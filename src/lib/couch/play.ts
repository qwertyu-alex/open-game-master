import { catchUpPortraits, forgeRunning, publishCouchChange } from "@/lib/couch/forge";
import { couchIntroKey } from "@/lib/couch/intro";
import { actName } from "@/lib/couch/prompt-logic";
import { actBreakSpeech, actRollCall, readActRecap, type CouchActBreak } from "@/lib/couch/act-break-logic";
import { enqueueNarrationAudio } from "@/lib/tts";
import { forgedMember, introDone, introTotal } from "@/lib/couch/intro-logic";
import { publishCouchNavigation } from "@/lib/couch/navigation";
import {
  failCouchForge,
  getCouchCrew,
  getCouchForge,
  listCouchCrew,
  recordCrewSheet,
  releaseCrewCard,
  addCouchActPoint,
  setCouchAct,
  takeCrewCard,
  type CouchStatus,
} from "@/lib/couch/store";
import { getCampaignById, listMembers, setMemberReady, type Campaign } from "@/lib/db/campaigns";
import { insertWhisper } from "@/lib/db/dm-whispers";
import { createSheet, getSheetById, getSheetForUser, listSheets, setSheetAgenda } from "@/lib/db/sheets";
import { seatAddedSheet } from "@/lib/character-seat";
import { publishTitleCard } from "@/lib/dm/scene-state";
import { publishEphemeral, publishPersisted } from "@/lib/events";
import type { CharacterSheet } from "@/lib/schemas/sheet";

// A couch night in play (docs/couch-mode-spec.md 2.1 and 2.2): the lobby's
// view of the forge and its cards, a player claiming one, the acts turning
// and story points landing. The forge itself is src/lib/couch/forge.ts.

// What every member's lobby reads (GET /api/campaigns/[id]/couch). Never an
// agenda, a hidden role or the truth: only what the TV may show the room.
export type CouchView = {
  status: CouchStatus;
  error: string;
  scenario: { title: string; logline: string; briefing: string } | null;
  // The TV's introductions (src/lib/couch/intro-logic.ts): the step it is
  // on, how many there are, and a key that changes with the words, so a
  // clip of last story's crew is never played for this one's.
  intro: { step: number; total: number; key: string };
  crew: Array<{
    id: string;
    name: string;
    crewRole: string;
    // The public backstory, without the ties, which come apart below.
    backstory: string;
    personality: string;
    signatureItem: string;
    ties: Array<{ to: string; line: string }>;
    portraitUrl: string | null;
    claimedBy: { userId: string; name: string } | null;
  }>;
};

// A forge that says it is running when this process runs none was cut off by
// a restart; it reads as failed, so the lead can ask again, rather than
// leaving the TV on "writing the story" all night.
export function couchView(campaignId: string): CouchView | null {
  let forge = getCouchForge(campaignId);
  if (!forge) {
    return null;
  }
  if (forge.status === "forging" && !forgeRunning(campaignId)) {
    failCouchForge(campaignId, "The server restarted while the story was being written. Try again.");
    forge = getCouchForge(campaignId)!;
  }
  if (forge.status === "ready") {
    catchUpPortraits(campaignId);
  }
  const names = new Map(listMembers(campaignId).map((member) => [member.userId, member.username]));
  const ready = forge.status === "ready" ? forge.forge : null;
  const scenario = ready ? ready.scenario : null;
  const cards = ready ? listCouchCrew(campaignId) : [];
  const total = introTotal(cards.length);
  return {
    status: forge.status,
    error: forge.status === "failed" ? forge.error : "",
    scenario: scenario ? { title: scenario.title, logline: scenario.logline, briefing: scenario.briefing } : null,
    intro: { step: Math.min(forge.introStep, total), total, key: ready ? couchIntroKey(campaignId) : "" },
    crew: cards.map((card) => {
      const member = ready ? forgedMember(ready.crew, card) : null;
      return {
        id: card.id,
        name: card.name,
        crewRole: card.crewRole,
        backstory: member?.backstory || card.backstory,
        personality: member?.personality ?? "",
        signatureItem: member?.signatureItem ?? "",
        ties: member?.relationships ?? [],
        portraitUrl: card.portraitUrl,
        claimedBy: card.claimedBy ? { userId: card.claimedBy, name: names.get(card.claimedBy) ?? "A player" } : null,
      };
    }),
  };
}

// Whether the phones may take cards yet: not while the TV is still
// introducing the crew, in the lobby. Once the night has begun, a friend
// who joins late picks at once.
export function crewOpen(campaign: Pick<Campaign, "status">, forge: { introStep: number }, crewCount: number): boolean {
  return campaign.status !== "lobby" || introDone(forge.introStep, introTotal(crewCount));
}

export type ClaimOutcome = { ok: true; sheet: CharacterSheet } | { ok: false; status: number; error: string };

// A player takes a crew card: first come, first served, one each, and the
// TV's own seat (the lead) takes none, since a card on it would put that
// crew member's secret on the screen everyone watches. The card becomes the
// player's campaign sheet, agenda and all, they are marked ready (choosing
// the card is the whole of a couch lobby), and every screen is told.
export function claimCrew(campaign: Campaign, userId: string, crewId: string): ClaimOutcome {
  const forge = getCouchForge(campaign.id);
  if (!campaign.gameSettings.couchMode || !forge) {
    return { ok: false, status: 404, error: "This table has no crew to choose from." };
  }
  if (forge.status !== "ready") {
    return { ok: false, status: 409, error: "The crew is still being written." };
  }
  if (campaign.status === "ended") {
    return { ok: false, status: 409, error: "The story has ended." };
  }
  if (userId === campaign.leadUserId) {
    return { ok: false, status: 409, error: "The TV's own account plays no character. Join from a phone to take a crew card." };
  }
  const card = getCouchCrew(crewId);
  if (!card || card.campaignId !== campaign.id) {
    return { ok: false, status: 404, error: "No such crew member." };
  }
  if (getSheetForUser(campaign.id, userId)) {
    return { ok: false, status: 409, error: "You already have a character at this table." };
  }
  if (!crewOpen(campaign, forge, listCouchCrew(campaign.id).length)) {
    return { ok: false, status: 409, error: "The crew is still being introduced on the TV. Choosing opens when it ends." };
  }
  if (!takeCrewCard(campaign.id, crewId, userId)) {
    const now = getCouchCrew(crewId);
    return {
      ok: false,
      status: 409,
      error: now?.claimedBy === userId || listCouchCrew(campaign.id).some((entry) => entry.claimedBy === userId)
        ? "You already have a crew card."
        : `${card.name} is already taken.`,
    };
  }
  // A card taken after the acts have turned (a friend who came late) starts
  // on the act the rest of the crew is on.
  const agenda = card.sheet.agenda ? { ...card.sheet.agenda, act: Math.min(forge.act, card.sheet.agenda.acts.length - 1) } : card.sheet.agenda;
  let sheet: CharacterSheet;
  try {
    sheet = createSheet(campaign.id, userId, 1, {
      ...card.sheet,
      agenda,
      ...(card.portraitUrl ? { portrait: { id: card.id, name: `${card.name} portrait`, type: "image/png", url: card.portraitUrl } } : {}),
    });
  } catch (error) {
    // The card goes back on the table rather than staying held by nobody.
    releaseCrewCard(crewId);
    console.error(`[couch] could not seat ${card.name} for ${userId}:`, error);
    return { ok: false, status: 500, error: "That crew card could not be taken. Try again." };
  }
  recordCrewSheet(crewId, sheet.id);
  seatAddedSheet(campaign, userId, sheet.id);
  setMemberReady(campaign.id, userId, true);
  publishPersisted(campaign.id, "sheet_updated", { sheet });
  publishPersisted(campaign.id, "member_ready", { userId, ready: true });
  publishCouchChange(campaign.id);
  publishCouchNavigation(campaign);
  return { ok: true, sheet };
}

// The crew sheets in play: the claimed cards' sheets that still carry an
// agenda, the dead left out (their player plays on as someone else,
// src/lib/couch/takeover.ts).
function crewSheets(campaignId: string): CharacterSheet[] {
  return listSheets(campaignId).filter((sheet) => !sheet.isCompanion && sheet.agenda && !sheet.deathSaves?.dead);
}

// The next act: every crew member's agenda moves on one (never past their
// last), each owner is whispered their new one (it reaches their phone
// alone, src/lib/dm/whispers.ts, and the GM's next prompt as a whisper it
// sent), their sheet goes out again (the phone's agenda card re-reads it),
// and the TV shows the act break (src/lib/couch/act-break-logic.ts): the
// story so far (the recap's points, kept for the GM's later turns), each
// crew member's story points this act and the reminder of new agendas, all
// read aloud by the narrator, and then the act's title card. Returns the act now in force, 0 to 2; at the last act it changes
// nothing and returns 2.
//
// For the DM tool that turns the act (wired by the coordinator); never
// called by a route.
//
// earned: the sheet ids the GM judged to have chased the ended act's agenda
// at risk or cost; each earns its story point here, before the roll call.
export function advanceCouchAct(campaignId: string, subtitle = "", recap: readonly string[] = [], earned: readonly string[] = []): number {
  const forge = getCouchForge(campaignId);
  const current = forge?.act ?? 0;
  const next = Math.min(2, current + 1);
  if (!forge || next === current) {
    return current;
  }
  const points = readActRecap(recap);
  for (const sheetId of new Set(earned)) {
    if (isCouchCrew(campaignId, sheetId)) awardStoryPoint(campaignId, sheetId);
  }
  // The roll call reads the act's awards before the turn clears them.
  const crew = actRollCall(crewSheets(campaignId), getCouchForge(campaignId)?.actPoints ?? forge.actPoints);
  setCouchAct(campaignId, next, points);
  const recipients: Array<{ sheet: CharacterSheet; agenda: string }> = [];
  for (const sheet of crewSheets(campaignId)) {
    const agenda = sheet.agenda!;
    const act = Math.min(next, agenda.acts.length - 1);
    const updated = setSheetAgenda(sheet.id, { ...agenda, act });
    if (updated) {
      publishPersisted(campaignId, "sheet_updated", { sheet: updated });
      recipients.push({ sheet: updated, agenda: agenda.acts[act] ?? "" });
    }
  }
  for (const { sheet, agenda } of recipients) {
    insertWhisper(campaignId, null, [{ userId: sheet.userId, characterId: sheet.id, characterName: sheet.name }], `${actName(next)} begins. Your agenda now: ${agenda}`);
  }
  if (recipients.length) {
    publishEphemeral(campaignId, "whisper_activity", {});
  }
  const title = subtitle.trim() || (forge.forge?.scenario.acts[next]?.title ?? "");
  // Before the title card, so the TV holds the card until the room has read
  // the story so far.
  if (points.length || crew.length) {
    const actBreak: CouchActBreak = { id: `act-break-${next}-${Date.now().toString(36)}`, ended: actName(current), points, crew, next: actName(next), at: Date.now() };
    publishPersisted(campaignId, "couch_act_break", actBreak);
    // In the narrator's voice, on its own lane, ahead of the GM's words
    // about the new act.
    const campaign = getCampaignById(campaignId);
    if (campaign?.gameSettings.ttsEnabled) {
      void enqueueNarrationAudio(campaignId, actBreak.id, actBreakSpeech(actBreak), [], campaign.gameSettings, null, { onDemand: true, narratorOnly: true });
    }
  }
  publishTitleCard(campaignId, { title: actName(next), ...(title ? { subtitle: title } : {}), tone: "act" });
  return next;
}

// ALIEN's cap (Starter Set rulebook, p. 35): nobody holds more than three.
export const STORY_POINTS_MAX = 3;

// Whether a sheet is a living crew member of this night with an agenda: who
// can earn a story point.
export function isCouchCrew(campaignId: string, sheetId: string): boolean {
  return crewSheets(campaignId).some((sheet) => sheet.id === sheetId);
}

// A story point for pursuing the agenda (docs/couch-mode-spec.md 2.2): the
// count on the crew member's agenda goes up by one, to three at most, and
// their sheet goes out again. The act break gives them (advanceCouchAct);
// the host's award_story_point gives one by hand. The error says why the
// call was wrong, for the tool to hand back with retry.
export function awardStoryPoint(campaignId: string, sheetId: string): { ok: true; storyPoints: number } | { ok: false; error: string } {
  const sheet = getSheetById(sheetId);
  if (!sheet || sheet.campaignId !== campaignId || !sheet.agenda) {
    return { ok: false, error: "That is not a crew member at this table; use a characterId from CREW AGENDAS." };
  }
  if (sheet.deathSaves?.dead) {
    return { ok: false, error: `${sheet.name} is dead; award the crew member their player plays now, from CREW AGENDAS.` };
  }
  // Never lower: a night from before the cap may hold more than three.
  const storyPoints = Math.max(sheet.agenda.storyPoints, Math.min(STORY_POINTS_MAX, sheet.agenda.storyPoints + 1));
  const updated = setSheetAgenda(sheet.id, { ...sheet.agenda, storyPoints });
  if (storyPoints > sheet.agenda.storyPoints) {
    addCouchActPoint(campaignId, sheet.id);
  }
  if (updated) {
    publishPersisted(campaignId, "sheet_updated", { sheet: updated });
  }
  return { ok: true, storyPoints };
}

// The night's visual bible for the scene painter (docs/couch-mode-spec.md
// 2.4): the style lock, each claimed crew member's fixed look and portrait,
// and the places as the forge described them. Null outside couch mode or
// before the forge is done.
export function couchVisualBible(campaignId: string): {
  styleLock: string;
  crew: Array<{ sheetId: string; name: string; look: string; portraitUrl: string | null }>;
  locations: Array<{ name: string; look: string }>;
} | null {
  const forge = getCouchForge(campaignId);
  if (forge?.status !== "ready" || !forge.forge) {
    return null;
  }
  return {
    styleLock: forge.forge.styleLock,
    crew: listCouchCrew(campaignId)
      .filter((card) => card.sheetId)
      .map((card) => ({ sheetId: card.sheetId!, name: card.name, look: card.look, portraitUrl: card.portraitUrl })),
    locations: forge.forge.scenario.locations,
  };
}
