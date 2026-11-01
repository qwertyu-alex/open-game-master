import { getDatabase, nowIso } from "@/lib/db/core";
import type { Campaign } from "@/lib/db/campaigns";
import { getSheetById, listSheets } from "@/lib/db/sheets";
import { defaultRng, type DieRng, type RollResult } from "@/lib/dice";
import { publishPersisted } from "@/lib/events";
import { publishTitleCard } from "@/lib/dm/scene-state";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import {
  STRESS_KINDS,
  clampStress,
  couchStressLine,
  panicMovesLeft,
  rollPanic,
  stressThrowWords,
  throwStressDice,
  type PanicRoll,
  type StressView,
} from "@/lib/couch/stress-logic";

// The rim of a couch night's stress (src/lib/couch/stress-logic.ts).
//
// couch_stress: one row per crew member once they have any, with the panic
// that is taking moves from them. couch_stress_rolls: the stress dice thrown
// beside a stored roll, so the TV's readout and the GM's answer can say
// them. Made here on first use, as src/lib/couch/store.ts makes its own;
// the campaign foreign keys cascade.
//
// Imported by the damage engine (src/lib/dm/pc-damage.ts), so it must not
// import the turn, the tools or the death engine.

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_stress (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id TEXT NOT NULL,
        stress INTEGER NOT NULL DEFAULT 0,
        panic_label TEXT NOT NULL DEFAULT '',
        panic_lose INTEGER NOT NULL DEFAULT 0,
        panic_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, character_id)
      );
      CREATE TABLE IF NOT EXISTS couch_stress_rolls (
        roll_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        words TEXT NOT NULL
      );
    `);
    ensured.add(database);
  }
  return database;
}

type Row = { character_id: string; stress: number; panic_label: string; panic_lose: number; panic_at: string };

function rows(campaignId: string): Row[] {
  return db().prepare(`SELECT character_id, stress, panic_label, panic_lose, panic_at FROM couch_stress WHERE campaign_id = ?`).all(campaignId) as Row[];
}

export function couchStressOf(campaignId: string, characterId: string): number {
  const row = db().prepare(`SELECT stress FROM couch_stress WHERE campaign_id = ? AND character_id = ?`).get(campaignId, characterId) as { stress: number } | undefined;
  return row?.stress ?? 0;
}

function repliesSince(campaignId: string, since: string): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM campaign_messages WHERE campaign_id = ? AND author_type = 'dm' AND created_at > ?`)
    .get(campaignId, since) as { n: number } | undefined;
  return row?.n ?? 0;
}

function viewOf(campaignId: string, row: Row): StressView {
  const left = row.panic_lose > 0 && row.panic_at ? panicMovesLeft(row.panic_lose, repliesSince(campaignId, row.panic_at)) : 0;
  return { stress: row.stress, panic: left > 0 ? { label: row.panic_label, left } : null };
}

// Every crew member's stress, for the snapshot and the stream: null off a
// couch night.
export function couchStressViews(campaign: Pick<Campaign, "id" | "gameSettings">): Record<string, StressView> | null {
  if (!campaign.gameSettings.couchMode) return null;
  return Object.fromEntries(rows(campaign.id).map((row) => [row.character_id, viewOf(campaign.id, row)]));
}

export function publishCouchStress(campaign: Pick<Campaign, "id" | "gameSettings">): void {
  const stress = couchStressViews(campaign);
  if (stress) publishPersisted(campaign.id, "couch_stress", { stress });
}

// The crew members whose panic is still taking their moves.
export function panickedCrewIds(campaign: Pick<Campaign, "id" | "gameSettings">): Set<string> {
  const views = couchStressViews(campaign) ?? {};
  return new Set(Object.entries(views).filter(([, view]) => view.panic).map(([id]) => id));
}

const isCrew = (sheet: Pick<CharacterSheet, "isCompanion" | "summon" | "deathSaves">) => !sheet.isCompanion && !sheet.summon && !sheet.deathSaves?.dead;

function write(campaignId: string, characterId: string, stress: number) {
  db()
    .prepare(
      `INSERT INTO couch_stress (campaign_id, character_id, stress, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET stress = excluded.stress, updated_at = excluded.updated_at`,
    )
    .run(campaignId, characterId, clampStress(stress), nowIso());
}

// Moves stress for the named crew (the dead and the non-crew are skipped)
// and tells every screen. Returns each one's new stress.
export function adjustCouchStress(campaign: Pick<Campaign, "id" | "gameSettings">, characterIds: readonly string[], delta: number): Array<{ id: string; name: string; stress: number }> {
  if (!campaign.gameSettings.couchMode || !delta) return [];
  const changed: Array<{ id: string; name: string; stress: number }> = [];
  for (const id of new Set(characterIds)) {
    const sheet = getSheetById(id);
    if (!sheet || sheet.campaignId !== campaign.id || !isCrew(sheet)) continue;
    const next = clampStress(couchStressOf(campaign.id, id) + delta);
    write(campaign.id, id, next);
    changed.push({ id, name: sheet.name, stress: next });
  }
  if (changed.length) publishCouchStress(campaign);
  return changed;
}

function otherCrewIds(campaignId: string, characterId: string): string[] {
  return listSheets(campaignId).filter((sheet) => sheet.id !== characterId && isCrew(sheet)).map((sheet) => sheet.id);
}

// A crew member hurt: +1 for them, and +1 for everyone else when it dropped
// them. Called by the damage engine with what got through.
export function noteCouchHurt(campaign: Pick<Campaign, "id" | "gameSettings">, characterId: string, droppedToZero: boolean): void {
  if (!campaign.gameSettings.couchMode) return;
  adjustCouchStress(campaign, [characterId], 1);
  if (droppedToZero) adjustCouchStress(campaign, otherCrewIds(campaign.id, characterId), 1);
}

// A crew member died: everyone still standing feels it.
export function noteCouchCrewDied(campaign: Pick<Campaign, "id" | "gameSettings">, characterId: string): void {
  if (!campaign.gameSettings.couchMode) return;
  adjustCouchStress(campaign, otherCrewIds(campaign.id, characterId), 1);
}

export type StressedRoll = { outcome: RollResult; words: string; panic: PanicRoll | null };

// A crew member's check or save: their stress dice join the d20. Null when
// they carry no stress or the roll is not a check or a save; the roll then
// stands as thrown. The bonus is a modifier on the total, so the stored
// roll, its success and every readout agree.
export function applyCouchStressDice(
  campaign: Pick<Campaign, "id" | "gameSettings">,
  characterId: string | null,
  kind: string,
  outcome: RollResult,
  rng: DieRng = defaultRng,
): StressedRoll | null {
  if (!campaign.gameSettings.couchMode || !characterId || !STRESS_KINDS.has(kind)) return null;
  const sheet = getSheetById(characterId);
  if (!sheet || !isCrew(sheet)) return null;
  const stress = couchStressOf(campaign.id, characterId);
  const thrown = throwStressDice(stress, rng);
  if (!thrown) return null;
  const boosted: RollResult = thrown.bonus
    ? { ...outcome, total: outcome.total + thrown.bonus, terms: [...outcome.terms, { kind: "modifier", sign: 1, value: thrown.bonus }] }
    : outcome;
  const panic = thrown.panic ? rollPanic(stress, rng) : null;
  if (panic) landPanic(campaign, sheet, panic);
  return { outcome: boosted, words: stressThrowWords(sheet.name, thrown, panic), panic };
}

function landPanic(campaign: Pick<Campaign, "id" | "gameSettings">, sheet: CharacterSheet, panic: PanicRoll) {
  const { entry } = panic;
  if (entry.lose > 0) {
    db()
      .prepare(
        `INSERT INTO couch_stress (campaign_id, character_id, stress, panic_label, panic_lose, panic_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (campaign_id, character_id) DO UPDATE SET panic_label = excluded.panic_label, panic_lose = excluded.panic_lose, panic_at = excluded.panic_at, updated_at = excluded.updated_at`,
      )
      .run(campaign.id, sheet.id, couchStressOf(campaign.id, sheet.id), entry.label, entry.lose, nowIso(), nowIso());
  }
  if (entry.selfStress) adjustCouchStress(campaign, [sheet.id], entry.selfStress);
  if (entry.othersStress) adjustCouchStress(campaign, otherCrewIds(campaign.id, sheet.id), entry.othersStress);
  // Nothing worth a card: the readout says it.
  if (entry.min > 0) publishTitleCard(campaign.id, { title: `${sheet.name} panics`, subtitle: entry.label, tone: "ember" });
  publishCouchStress(campaign);
}

export function recordCouchStressRoll(campaignId: string, rollId: string, words: string): void {
  db().prepare(`INSERT OR REPLACE INTO couch_stress_rolls (roll_id, campaign_id, words) VALUES (?, ?, ?)`).run(rollId, campaignId, words);
}

export function couchStressRollWords(rollId: string): string {
  const row = db().prepare(`SELECT words FROM couch_stress_rolls WHERE roll_id = ?`).get(rollId) as { words: string } | undefined;
  return row?.words ?? "";
}

// The GM's line: "" off a couch night and while nobody is stressed.
export function couchStressPrompt(campaign: Pick<Campaign, "id" | "gameSettings">, sheets: readonly Pick<CharacterSheet, "id" | "name" | "isCompanion" | "summon" | "deathSaves">[]): string {
  const views = couchStressViews(campaign);
  if (!views) return "";
  return couchStressLine(sheets.filter(isCrew).flatMap((sheet) => (views[sheet.id] ? [{ name: sheet.name, view: views[sheet.id] }] : [])));
}
