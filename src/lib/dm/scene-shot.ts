// Couch mode's picture of every GM turn: the table's side of
// src/lib/dm/scene-shot-logic.ts. Reads who could be in frame and their
// portraits, asks the utility model for the shot, and falls back to the
// passage's own last paragraphs when that call fails or says nothing
// usable. Called inside the picture's media job (src/lib/dm/images.ts), so a
// job replaced by a newer turn's before it ran never asks. The planner is
// told what the screen shows, so a find in the room on screen is painted
// as an insert beside it.

import { existsSync } from "node:fs";
import path from "node:path";
import { getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { inSceneIds } from "@/lib/couch/whereabouts";
import { getCharacter } from "@/lib/db/characters";
import { getCurrentLocation, type CampaignLocation } from "@/lib/db/locations";
import { getPlaceShot } from "@/lib/couch/place-shots";
import { fightCast } from "@/lib/couch/fight-art";
import { establishingFallback, establishingNote, owesEstablishingShot, shotWords, type PlaceShot } from "@/lib/couch/place-shots-logic";
import { listMessagesBefore } from "@/lib/db/messages";
import { listCastNpcs } from "@/lib/db/npcs";
import { listSheets } from "@/lib/db/sheets";
import { requestUtilityMessage } from "@/lib/dm/model";
import {
  heuristicShot,
  mentionedCast,
  onScreenFrame,
  parseShotReply,
  sceneComposition,
  sceneShotPrompt,
  shotAspect,
  SHOT_PLANNER_SYSTEM,
  shotPlannerInput,
  type PictureShot,
  type SceneShot,
  type ShotCastMember,
} from "@/lib/dm/scene-shot-logic";
import { MAX_PICTURE_REFERENCES, type PictureReference } from "@/lib/harness/picture-prompt-logic";
import { npcRoleLabel } from "@/lib/placeholders";
import { stripReasoningArtifacts } from "@/lib/story-prompt";

// The picture already takes most of a minute; a planner slower than this
// is worth less than the heuristic's frame now.
const PLANNER_TIMEOUT_MS = 60_000;

// How far back the picture on screen is looked for. A table that has gone
// this long without one is not looking at it any more.
const STAGE_LOOKBACK = 60;

type CastWithFace = ShotCastMember & { portrait: string };

// A face or a place this server wrote: an upload or a generated picture, by
// the one shape each has, so a stored path can never point the program
// elsewhere.
const FACE_PATH = /^\/(uploads|generated)\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(png|jpe?g|webp)$/;

export function pictureFile(url: string): string | null {
  if (!FACE_PATH.test(url) || url.includes("..")) {
    return null;
  }
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", ...url.slice(1).split("/"));
  return existsSync(file) ? file : null;
}

// The words the character's portrait was painted from: the sheet's own (a
// couch crew member's, from the forge), else the library character an older
// sheet was made from, which is where its appearance was kept.
function sheetLook(sheet: ReturnType<typeof listSheets>[number]): string {
  const own = sheet.appearance?.trim();
  if (own) {
    return own;
  }
  const kept = sheet.libraryCharacterId ? getCharacter(sheet.libraryCharacterId) : null;
  const appearance = kept?.sheet.appearance?.trim() ?? "";
  if (appearance) {
    return appearance;
  }
  return sheet.gender ? `${sheet.gender.toLowerCase()} ${sheet.raceLabel ?? sheet.race}`.trim() : "";
}

// Who the camera could put in frame: every sheet at the table, the NPCs
// the passage names (the rest of the world's cast cannot be in this shot,
// and listing them would only cost the planner's attention), and in a fight
// each foe the night has painted, with that picture as its face, so the
// foe in the scene is the one on the TV's card
// (src/lib/couch/fight-art.ts).
//
// A split couch crew's picture is of the group in the scene: the others are
// somewhere else (src/lib/couch/whereabouts.ts).
export function sceneShotCast(campaignId: string, content: string): CastWithFace[] {
  const campaign = getCampaignById(campaignId);
  const sheets = listSheets(campaignId);
  const scene = campaign ? inSceneIds(campaign, sheets) : null;
  const crew: CastWithFace[] = sheets
    .filter((sheet) => sheet.name.trim() && !sheet.summon && (!scene || scene.has(sheet.id)))
    .map((sheet) => ({ id: sheet.id, name: sheet.name, look: sheetLook(sheet), portrait: sheet.portrait?.url ?? "" }));
  const npcs: CastWithFace[] = listCastNpcs(campaignId)
    .filter((npc) => !npc.archived)
    .map((npc) => ({
      id: npc.id,
      name: npc.name,
      aliases: npc.aliases,
      look: [npc.gender.toLowerCase(), npcRoleLabel(npc.role), npc.trait].filter(Boolean).join(", "),
      portrait: npc.portraitUrl,
    }));
  const creatures = fightCast(campaignId).filter((creature) => creature.portrait);
  return [...crew, ...mentionedCast(content, npcs), ...creatures];
}

// The faces of a shot's subjects that exist on disk, in the shot's order.
export function castReferences(subjects: readonly string[], cast: readonly CastWithFace[]): PictureReference[] {
  const references: PictureReference[] = [];
  for (const id of subjects) {
    const member = cast.find((entry) => entry.id === id);
    const file = member?.portrait ? pictureFile(member.portrait) : null;
    if (member && file) {
      references.push({ path: file, label: member.name, kind: "person" });
    }
  }
  return references.slice(0, MAX_PICTURE_REFERENCES);
}

// The faces of the characters the narrator named in its own generate_image
// call (their sheet ids, or an NPC's id).
export function portraitReferences(campaignId: string, ids: readonly string[] | undefined): PictureReference[] {
  if (!ids?.length) {
    return [];
  }
  const cast = [
    ...listSheets(campaignId).map((sheet) => ({ id: sheet.id, name: sheet.name, look: "", portrait: sheet.portrait?.url ?? "" })),
    ...listCastNpcs(campaignId).map((npc) => ({ id: npc.id, name: npc.name, look: "", portrait: npc.portraitUrl })),
  ];
  return castReferences(ids, cast);
}

// What the screen shows of the party's place before the passage at `seq`:
// onScreenFrame's line for the planner, or null when nothing of it is.
export function screenBefore(campaignId: string, seq: number, placeId: string | null): string | null {
  const { stage } = sceneComposition(listMessagesBefore(campaignId, seq, STAGE_LOOKBACK).messages);
  return onScreenFrame(stage, placeId);
}

export async function planSceneShot(
  campaign: Campaign,
  content: string,
  cast: readonly ShotCastMember[],
  onScreen: string | null = null,
  establish: { shot: PlaceShot | null } | null = null,
): Promise<SceneShot> {
  const place = getCurrentLocation(campaign.id);
  const { message, error } = await requestUtilityMessage(
    campaign.settings,
    [
      { role: "system", content: SHOT_PLANNER_SYSTEM },
      {
        role: "user",
        content: shotPlannerInput(content, cast, placeLine(place, establish ? null : place ? getPlaceShot(place.id) : null), onScreen, establish ? establishingNote(establish.shot?.change ?? "") : ""),
      },
    ],
    { meta: { task: "scene_shot" }, timeoutMs: PLANNER_TIMEOUT_MS, thinking: false, temperature: 0.2 },
  );
  const planned = error
    ? null
    : parseShotReply(stripReasoningArtifacts(String(message?.content ?? "")), cast, { onScreen: onScreen !== null });
  if (!planned) {
    // Logged without the text (PRIVACY: it is the table's story).
    console.error(`[scene-shot] ${campaign.id}: the shot planner ${error ? "failed" : "answered nothing usable"}; framing from the passage instead`);
  }
  if (establish) {
    // Wide and empty whatever the planner said: the place is the subject,
    // and it is painted to be reused under every later picture there.
    const prompt = planned?.shot === "wide"
      ? planned.prompt
      : establishingFallback(place?.name ?? "", place?.layoutDescription ?? "", heuristicShot(content, []).prompt);
    return { shot: "wide", subjects: [], prompt };
  }
  return planned ?? heuristicShot(content, cast);
}

// The planner's PLACE line: the place's name and layout, and what its
// establishing shot shows once it has one.
function placeLine(place: CampaignLocation | null, shot: PlaceShot | null): string {
  if (!place) return "";
  const seen = shot?.url ? shotWords(shot) : "";
  return [`${place.name}. ${place.layoutDescription}`.trim(), seen ? `It looks like this: ${seen}` : ""].filter(Boolean).join(" ");
}

// The place's establishing shot as a reference, when its file is on disk.
function placeReference(place: CampaignLocation, shot: PlaceShot | null): PictureReference | null {
  const file = shot?.url ? pictureFile(shot.url) : null;
  return file ? { path: file, label: place.name, kind: "place" } : null;
}

// The words, faces, shape and framing of one turn's picture. `seq` is the
// passage's own, so the picture on screen is the one before it.
//
// A place nobody has painted yet (or one the GM said has changed) gets its
// establishing shot: wide, empty, kept with the place. Every other picture
// there is painted with that shot as the place's reference, so the room
// stays the same room; an insert is not, since it shows one thing up close.
export async function planScenePicture(
  campaign: Campaign,
  content: string,
  seq?: number,
): Promise<{ prompt: string; references: PictureReference[]; aspect?: "square"; shot: PictureShot }> {
  const cast = sceneShotCast(campaign.id, content);
  const place = getCurrentLocation(campaign.id);
  const placeId = place?.id ?? null;
  const placeShot = place && campaign.gameSettings.couchMode ? getPlaceShot(place.id) : null;
  const establishing = Boolean(place && campaign.gameSettings.couchMode && owesEstablishingShot(placeShot));
  const onScreen = seq === undefined ? null : screenBefore(campaign.id, seq, placeId);
  const shot = await planSceneShot(campaign, content, cast, establishing ? null : onScreen, establishing ? { shot: placeShot } : null);
  const room = place && shot.shot !== "insert" ? placeReference(place, placeShot) : null;
  const faces = castReferences(shot.subjects, cast).slice(0, room ? MAX_PICTURE_REFERENCES - 1 : MAX_PICTURE_REFERENCES);
  return {
    prompt: sceneShotPrompt(shot, cast),
    references: room ? [...faces, room] : faces,
    aspect: shotAspect(shot.shot),
    shot: { kind: shot.shot, frame: shot.prompt, ...(placeId ? { placeId } : {}), ...(establishing ? { establishing: true as const } : {}) },
  };
}
