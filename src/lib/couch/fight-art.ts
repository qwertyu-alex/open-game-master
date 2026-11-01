import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_STYLE_LOCK } from "@/lib/couch/forge-logic";
import { creatureLook, FIGHT_ART_NIGHT_MAX, FIGHT_ART_TRIES, fightArtPrompt, knownFoe, type KnownFoe, type KnownPerson } from "@/lib/couch/fight-art-logic";
import { fightArtKey, fightArtStage, type FightArtStage } from "@/lib/couch/fight-logic";
import { getCouchForge } from "@/lib/couch/store";
import { healthState } from "@/lib/bestiary/health";
import { getCampaignById } from "@/lib/db/campaigns";
import { getDatabase, nowIso } from "@/lib/db/core";
import { getActiveEncounter, listEnemies } from "@/lib/db/encounters";
import { listRecentMessages } from "@/lib/db/messages";
import { listCastNpcs } from "@/lib/db/npcs";
import { getSheetById, listSheets } from "@/lib/db/sheets";
import { sheetsAgainstParty } from "@/lib/dm/combat-sides";
import { stripToolText, withoutRollMarkers } from "@/lib/dm/tool-text";
import type { PictureReference } from "@/lib/harness/picture-prompt-logic";
import { toEnglishForImage } from "@/lib/image-english";
import { generateStoryImage } from "@/lib/image-generate";
import { enqueueMediaJob, type MediaLane } from "@/lib/media-queue";
import { copyIntoUploads, whenImagesAvailable } from "@/lib/portrait";
import { configuredDefaultStorySettings } from "@/lib/runtime-defaults";

// The pictures of whoever a couch night's crew fights, people, machines or
// creatures (docs/couch-mode-spec.md 2.11): one set per kind of foe, painted the
// moment the TV first shows the fight, in the night's own look. The whole
// creature first, then its hurt and down pictures together, both painted
// from the whole one so it stays the same beast. The TV swaps them as the
// creature's health crosses into bloodied and down
// (GET /api/campaigns/[id]/couch/fight-art), and every scene picture of the
// fight takes the creature's picture as a reference (scene-shot.ts), so the
// beast in the scene is the one on the card.
//
// couch_fight_art: one row per kind per night, made here on first use like
// the rest of couch's tables; the campaign's foreign key cascades.

export type FightArt = Partial<Record<FightArtStage, string>>;

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_fight_art (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        art_key TEXT NOT NULL,
        name TEXT NOT NULL,
        whole_url TEXT,
        hurt_url TEXT,
        down_url TEXT,
        tries INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, art_key)
      );
    `);
    ensured.add(database);
  }
  return database;
}

type ArtRow = { art_key: string; name: string; whole_url: string | null; hurt_url: string | null; down_url: string | null; tries: number };

function listRows(campaignId: string): Map<string, ArtRow> {
  const rows = db().prepare(`SELECT art_key, name, whole_url, hurt_url, down_url, tries FROM couch_fight_art WHERE campaign_id = ?`).all(campaignId) as ArtRow[];
  return new Map(rows.map((row) => [row.art_key, row]));
}

function artOf(row: ArtRow): FightArt {
  return {
    ...(row.whole_url ? { whole: row.whole_url } : {}),
    ...(row.hurt_url ? { hurt: row.hurt_url } : {}),
    ...(row.down_url ? { down: row.down_url } : {}),
  };
}

// Each painted foe's whole picture by art key, for the overhead map's
// tokens (src/lib/couch/site.ts): a foe fought once wears its face there.
export function paintedFoes(campaignId: string): Map<string, string> {
  const faces = new Map<string, string>();
  for (const [key, row] of listRows(campaignId)) if (row.whole_url) faces.set(key, row.whole_url);
  return faces;
}

function recordTry(campaignId: string, key: string, name: string): void {
  db()
    .prepare(
      `INSERT INTO couch_fight_art (campaign_id, art_key, name, tries, updated_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (campaign_id, art_key) DO UPDATE SET tries = tries + 1, updated_at = excluded.updated_at`,
    )
    .run(campaignId, key, name, nowIso());
}

const COLUMN: Record<FightArtStage, string> = { whole: "whole_url", hurt: "hurt_url", down: "down_url" };

function setArt(campaignId: string, key: string, stage: FightArtStage, url: string): void {
  db().prepare(`UPDATE couch_fight_art SET ${COLUMN[stage]} = ?, updated_at = ? WHERE campaign_id = ? AND art_key = ?`).run(url, nowIso(), campaignId, key);
}

declare global {
  var __odmCouchFightArt: Set<string> | undefined;
}

// Kinds being painted now: a second ask while one paints queues nothing.
function running(): Set<string> {
  return (globalThis.__odmCouchFightArt ??= new Set());
}

export type FightArtState = {
  // Art key to the pictures painted so far, for every creature in the fight.
  art: Record<string, FightArt>;
  // Whether any of them is still being painted, so the TV asks again.
  pending: boolean;
};

// Everyone the night already knows by name, with the look and face the
// rest of its pictures use: the forge's cast, the GM's NPCs and the crew's
// sheets. A foe among them is painted as themselves.
function knownPeople(campaignId: string): KnownPerson[] {
  const cast = getCouchForge(campaignId)?.forge?.scenario.cast ?? [];
  return [
    ...cast.map((person) => ({ names: [person.name], look: person.look, portrait: "" })),
    ...listCastNpcs(campaignId).map((npc) => ({
      names: [npc.name, ...npc.aliases],
      look: [npc.gender.toLowerCase(), npc.trait].filter(Boolean).join(", "),
      portrait: npc.portraitUrl,
    })),
    ...listSheets(campaignId).map((sheet) => ({ names: [sheet.name], look: sheet.appearance ?? "", portrait: sheet.portrait?.url ?? "" })),
  ];
}

// The pictures for the foes in the running fight, painting the kinds
// that have none within the night's budget. Nothing while no fight runs.
export function fightArtFor(campaignId: string): FightArtState {
  const encounter = getActiveEncounter(campaignId);
  if (!encounter) return { art: {}, pending: false };
  const kinds = new Map<string, string>();
  for (const enemy of listEnemies(encounter.id)) {
    const key = fightArtKey(enemy.displayName);
    if (key && !kinds.has(key)) kinds.set(key, enemy.displayName.replace(/\s+#?\d+$/u, ""));
  }
  // A crew member who turned on the others (src/lib/couch/crew-fight.ts) is
  // painted for the fight too, from their own portrait (knownFoe).
  for (const id of sheetsAgainstParty(encounter)) {
    const sheet = getSheetById(id);
    const key = sheet ? fightArtKey(sheet.name) : "";
    if (sheet && key && !kinds.has(key)) kinds.set(key, sheet.name);
  }
  const rows = listRows(campaignId);
  const people = knownPeople(campaignId);
  let budget = FIGHT_ART_NIGHT_MAX - rows.size;
  const art: Record<string, FightArt> = {};
  let pending = false;
  for (const [key, name] of kinds) {
    const row = rows.get(key);
    if (row) art[key] = artOf(row);
    if (running().has(`${campaignId}\u0000${key}`)) {
      pending = true;
      continue;
    }
    if (row?.whole_url && row.hurt_url && row.down_url) continue;
    if ((row?.tries ?? 0) >= FIGHT_ART_TRIES || (!row && budget <= 0)) continue;
    if (!row) budget -= 1;
    pending = true;
    paintCreature(campaignId, key, name, encounter.summary, row ? artOf(row) : {}, knownFoe(name, people));
  }
  return { art, pending };
}

// The foes in the running fight as the scene picture's planner may frame
// them: each living one with the picture of it as it is now, so the foe in
// the scene is the one on the TV's card.
export function fightCast(campaignId: string): Array<{ id: string; name: string; look: string; portrait: string }> {
  const encounter = getActiveEncounter(campaignId);
  if (!encounter) return [];
  const rows = listRows(campaignId);
  const people = knownPeople(campaignId);
  return listEnemies(encounter.id)
    .filter((enemy) => enemy.status === "alive")
    .map((enemy) => {
      const row = rows.get(fightArtKey(enemy.displayName));
      const art = row ? artOf(row) : {};
      const stage = fightArtStage({ health: healthState(enemy.currentHp, enemy.maxHp), status: enemy.status });
      return {
        id: enemy.id,
        name: enemy.displayName,
        look: [knownFoe(enemy.displayName, people)?.look, `fighting the crew, ${stage === "hurt" ? "badly hurt" : "unhurt"}`].filter(Boolean).join(", "),
        portrait: art[stage] ?? art.whole ?? "",
      };
    });
}

// A painter on another machine (the agent program, OpenAI) can paint beside
// the turn's scene picture; this machine's GPU takes one picture at a time
// (media-queue.ts).
function laneFor(campaignId: string): MediaLane {
  const backend = configuredDefaultStorySettings().imageBackend;
  return backend === "harness" || backend === "openai" ? `couch:${campaignId}` : "gpu";
}

function fileOf(url: string): string | null {
  if (!/^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(?:png|jpe?g|webp)$/.test(url)) return null;
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", ...url.slice(1).split("/"));
  return existsSync(file) ? file : null;
}

// The GM's newest passages: what the story has said the foe looks like.
function storySoFar(campaignId: string): string[] {
  return listRecentMessages(campaignId, 12)
    .filter((message) => message.authorType === "dm")
    .slice(-3)
    // Dice markers, leaked tool text and the voice's [whispers] tags are no
    // part of what anyone saw.
    .map((message) => withoutRollMarkers(stripToolText(message.content)).replace(/\[[a-z][a-z ,'-]{1,30}\]/g, "").trim());
}

function paintCreature(campaignId: string, key: string, name: string, summary: string, have: FightArt, known: KnownFoe | null): void {
  const flight = `${campaignId}\u0000${key}`;
  running().add(flight);
  recordTry(campaignId, key, name);
  const styleLock = getCouchForge(campaignId)?.forge?.styleLock || DEFAULT_STYLE_LOCK;
  const look = creatureLook(summary, storySoFar(campaignId));
  void whenImagesAvailable(() =>
    enqueueMediaJob(
      `couch fight art ${campaignId} ${key}`,
      async () => {
        const campaign = getCampaignById(campaignId);
        if (!campaign) return;
        // The story's words are the table's language; an image model reads English.
        const words = { name, look, known: known?.look ?? "" };
        const english = await toEnglishForImage(campaign, words).catch(() => words);
        // A foe with a face already (an NPC's portrait, a sheet's) is painted
        // from it, so the one on the card is the one the room has met.
        const faceFile = known?.portrait ? fileOf(known.portrait) : null;
        const face: PictureReference[] = faceFile ? [{ path: faceFile, label: english.name, kind: "person" }] : [];
        const paint = async (stage: FightArtStage, references: PictureReference[]): Promise<string | null> => {
          const started = Date.now();
          try {
            const image = await generateStoryImage(configuredDefaultStorySettings(), {
              prompt: fightArtPrompt(stage, { name: english.name, look: english.look, known: english.known, face: stage === "whole" && face.length > 0, styleLock }),
              mode: "fast",
              aspect: "square",
              references,
            });
            const url = copyIntoUploads(image.url).url;
            setArt(campaignId, key, stage, url);
            console.log(`[couch] fight picture ${stage} for ${name} painted in ${Math.round((Date.now() - started) / 1000)}s (${campaignId})`);
            return url;
          } catch (error) {
            console.error(`[couch] fight picture ${stage} failed for ${name} (${campaignId}):`, error);
            return null;
          }
        };
        const whole = have.whole ?? (await paint("whole", face));
        const file = whole ? fileOf(whole) : null;
        if (!file) return;
        const reference: PictureReference[] = [{ path: file, label: english.name, kind: "person" }];
        // Both at once: by the time a creature is bloodied the room should
        // not be waiting on its next picture.
        await Promise.all([
          have.hurt ? null : paint("hurt", reference),
          have.down ? null : paint("down", reference),
        ]);
      },
      laneFor(campaignId),
    ),
  ).finally(() => {
    running().delete(flight);
  });
}
