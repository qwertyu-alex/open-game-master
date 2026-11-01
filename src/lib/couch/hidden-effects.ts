import { getDatabase, nowIso } from "@/lib/db/core";
import type { Campaign } from "@/lib/db/campaigns";
import { getSheetById } from "@/lib/db/sheets";
import { rollExpression } from "@/lib/dice";
import { applyPcDamage } from "@/lib/dm/pc-damage";
import { publishTitleCard } from "@/lib/dm/scene-state";
import type { ToolResult } from "@/lib/dm/tool-errors";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import {
  HIDDEN_ACTIVE_MAX,
  HIDDEN_EVERY_DEFAULT,
  HIDDEN_NAME_MAX,
  HIDDEN_STAGES_MIN,
  HIDDEN_TRUTH_MAX,
  cleanStages,
  hiddenEffectsBlock,
  isPayoffStage,
  revealCard,
  type HiddenEffect,
  type HiddenEffectStatus,
} from "@/lib/couch/hidden-effects-logic";

// The records of the crew's hidden effects (src/lib/couch/hidden-effects-
// logic.ts). couch_hidden_effects: one row per effect, made here on first
// use as src/lib/couch/store.ts makes its own; the campaign foreign key
// cascades. Nothing here leaves the server but the TV's card when an effect
// is revealed: the phones never hear of one, so it stays a surprise even to
// its host until the GM whispers or it comes out.
//
// A payoff hurts through the damage engine like any other blow
// (src/lib/dm/pc-damage.ts): it can drop a crew member, and kill one only
// as 5e kills, by massive damage or failed death saves. Nothing here kills
// outright.

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_hidden_effects (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id TEXT NOT NULL,
        name TEXT NOT NULL,
        truth TEXT NOT NULL DEFAULT '',
        stages_json TEXT NOT NULL,
        stage INTEGER NOT NULL DEFAULT 0,
        every_replies INTEGER NOT NULL,
        revealed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        stage_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_couch_hidden_campaign ON couch_hidden_effects (campaign_id, status);
    `);
    ensured.add(database);
  }
  return database;
}

type Row = {
  id: string;
  character_id: string;
  name: string;
  truth: string;
  stages_json: string;
  stage: number;
  every_replies: number;
  revealed: number;
  status: string;
  stage_at: string;
};

function mapRow(row: Row): HiddenEffect & { stageAt: string } {
  let stages: string[] = [];
  try {
    const parsed = JSON.parse(row.stages_json) as unknown;
    stages = Array.isArray(parsed) ? parsed.filter((stage): stage is string => typeof stage === "string") : [];
  } catch {
    stages = [];
  }
  const status: HiddenEffectStatus = row.status === "cured" || row.status === "paid" ? row.status : "active";
  return {
    id: row.id,
    characterId: row.character_id,
    name: row.name,
    truth: row.truth,
    stages,
    stage: row.stage,
    everyReplies: row.every_replies,
    revealed: row.revealed === 1,
    status,
    stageAt: row.stage_at,
  };
}

export function listHiddenEffects(campaignId: string, onlyActive = true) {
  const rows = db()
    .prepare(`SELECT * FROM couch_hidden_effects WHERE campaign_id = ? ${onlyActive ? "AND status = 'active'" : ""} ORDER BY created_at ASC, rowid ASC`)
    .all(campaignId) as Row[];
  return rows.map(mapRow);
}

function getEffect(campaignId: string, id: string) {
  const row = db().prepare(`SELECT * FROM couch_hidden_effects WHERE campaign_id = ? AND id = ?`).get(campaignId, id) as Row | undefined;
  return row ? mapRow(row) : null;
}

function repliesSince(campaignId: string, since: string): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM campaign_messages WHERE campaign_id = ? AND author_type = 'dm' AND created_at > ?`)
    .get(campaignId, since) as { n: number } | undefined;
  return row?.n ?? 0;
}

// The GM's secret block: "" off a couch night and when nothing is hidden.
export function couchHiddenEffectsPrompt(campaign: Campaign, sheets: readonly Pick<CharacterSheet, "id" | "name" | "deathSaves">[]): string {
  if (!campaign.gameSettings.couchMode) return "";
  const effects = listHiddenEffects(campaign.id);
  if (!effects.length) return "";
  // The dead carry nothing forward: their effect has nowhere left to go.
  const names = new Map(sheets.filter((sheet) => !sheet.deathSaves?.dead).map((sheet) => [sheet.id, sheet.name]));
  const replies = new Map(effects.map((effect) => [effect.id, repliesSince(campaign.id, effect.stageAt)]));
  return hiddenEffectsBlock(effects, replies, names);
}

function revealOnTv(campaign: Campaign, effect: HiddenEffect, crewName: string) {
  db().prepare(`UPDATE couch_hidden_effects SET revealed = 1 WHERE id = ?`).run(effect.id);
  publishTitleCard(campaign.id, { ...revealCard(effect, crewName), tone: "ember" });
}

export type HiddenEffectArgs = {
  action: "plant" | "advance" | "reveal" | "cure" | "payoff";
  characterId?: string;
  effectId?: string;
  name?: string;
  truth?: string;
  stages?: string[];
  everyReplies?: number;
  damage?: string;
  damageType?: string;
};

function crewSheet(campaign: Campaign, characterId: string | undefined): CharacterSheet | string {
  const sheet = characterId ? getSheetById(characterId) : null;
  if (!sheet || sheet.campaignId !== campaign.id || sheet.isCompanion || sheet.summon) return "Name a crew member by their characterId from GAME STATE.";
  if (sheet.deathSaves?.dead) return `${sheet.name} is dead; nothing more grows in them.`;
  return sheet;
}

export function runHiddenEffect(campaign: Campaign, turnId: string, args: HiddenEffectArgs): ToolResult {
  if (args.action === "plant") {
    const sheet = crewSheet(campaign, args.characterId);
    if (typeof sheet === "string") return { error: sheet, retry: true };
    const stages = cleanStages(args.stages ?? []);
    const name = (args.name ?? "").replace(/\s+/g, " ").trim().slice(0, HIDDEN_NAME_MAX);
    if (!name || stages.length < HIDDEN_STAGES_MIN) {
      return { error: `plant needs a name and ${HIDDEN_STAGES_MIN} to 4 stages, each a symptom, the last the payoff.`, retry: true };
    }
    if (listHiddenEffects(campaign.id).length >= HIDDEN_ACTIVE_MAX) {
      return { error: `${HIDDEN_ACTIVE_MAX} hidden effects are already growing: pay one off or cure it first.`, refused: "rules" };
    }
    const id = crypto.randomUUID();
    const now = nowIso();
    db()
      .prepare(
        `INSERT INTO couch_hidden_effects (id, campaign_id, character_id, name, truth, stages_json, stage, every_replies, revealed, status, stage_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 'active', ?, ?)`,
      )
      .run(id, campaign.id, sheet.id, name, (args.truth ?? "").replace(/\s+/g, " ").trim().slice(0, HIDDEN_TRUTH_MAX), JSON.stringify(stages), args.everyReplies ?? HIDDEN_EVERY_DEFAULT, now, now);
    return {
      ok: true,
      effectId: id,
      note: `Planted in ${sheet.name}, unseen. HIDDEN EFFECTS tracks it from the next turn and says when each symptom is due. Show this moment only as what the room could notice; whisper the host only what they would feel.`,
    };
  }
  const effect = args.effectId ? getEffect(campaign.id, args.effectId) : null;
  if (!effect || effect.status !== "active") return { error: "Name an active effect by its effectId from HIDDEN EFFECTS.", retry: true };
  const sheet = getSheetById(effect.characterId);
  const crewName = sheet?.name ?? "A crew member";
  if (args.action === "advance") {
    if (isPayoffStage(effect)) return { error: "It is at its payoff already: pay it off, or cure it.", retry: true };
    db().prepare(`UPDATE couch_hidden_effects SET stage = ?, stage_at = ? WHERE id = ?`).run(effect.stage + 1, nowIso(), effect.id);
    const last = effect.stage + 1 >= effect.stages.length - 1;
    return { ok: true, stage: effect.stage + 2, of: effect.stages.length, note: last ? "Next is the payoff: hold it for the worst moment." : `Now showing: ${effect.stages[effect.stage + 1]}` };
  }
  if (args.action === "reveal") {
    if (effect.revealed) return { error: "The room already knows.", retry: true };
    revealOnTv(campaign, effect, crewName);
    return { ok: true, note: `The TV shows "${effect.name}" over ${crewName}. Narrate how it comes out.` };
  }
  if (args.action === "cure") {
    db().prepare(`UPDATE couch_hidden_effects SET status = 'cured' WHERE id = ?`).run(effect.id);
    return { ok: true, note: `${effect.name} is gone from ${crewName}. A cure should have cost something: say what.` };
  }
  // payoff: out it comes, on the TV, and through the damage engine when it
  // hurts.
  if (!isPayoffStage(effect)) return { error: `Not yet: it is at stage ${effect.stage + 1} of ${effect.stages.length}. Advance it through its symptoms first.`, retry: true };
  db().prepare(`UPDATE couch_hidden_effects SET status = 'paid' WHERE id = ?`).run(effect.id);
  if (!effect.revealed) revealOnTv(campaign, effect, crewName);
  if (!args.damage || !sheet || sheet.deathSaves?.dead) {
    return { ok: true, payoff: effect.stages.at(-1), note: "Paid off. Narrate it: the room has waited for this." };
  }
  let total: number;
  try {
    total = rollExpression(args.damage).total;
  } catch {
    return { error: `"${args.damage}" is not dice the server can roll ("4d10").`, retry: true };
  }
  const hurt = applyPcDamage(campaign, turnId, sheet, { amount: Math.max(1, total), type: args.damageType || "piercing", reason: effect.stages.at(-1) ?? effect.name });
  return { ...hurt, payoff: effect.stages.at(-1), rolled: `${args.damage} = ${total}` };
}
