import { z } from "zod";
import { allocateSeq, getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import { createDmTurn, saveDmTurn } from "@/lib/db/dm-turns";
import { getActiveEncounter } from "@/lib/db/encounters";
import { insertCampaignMessage } from "@/lib/db/messages";
import { getSheetById, listSheets } from "@/lib/db/sheets";
import { publishPersisted, publishWithSeq } from "@/lib/events";
import { enqueueDmJob } from "@/lib/dm/queue";
import { moveToSide } from "@/lib/dm/combat-sides";
import { sheetSide, standingOn } from "@/lib/dm/combatant";
import { aiPlaysSheet } from "@/lib/dm/companion-command";
import { finishEncounter, publishEncounter } from "@/lib/dm/enemy-damage";
import type { ToolResult } from "@/lib/dm/tool-errors";
import { wakeDm } from "@/lib/dm/wake";
import { enqueueNarrationAudio } from "@/lib/tts";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { answerTruce, couchTruceCall, couchTruceResult, couchTruceVoiceId, type CouchTruce } from "./truce-logic";

// A truce in a couch fight (docs/couch-mode-spec.md 2.11), the server half.
// offer_truce is the offering crew member's action: it spends their turn,
// and the fight hands on as after any ruling. Every other crew member
// standing in the fight is asked on their phone, out of turn, so the offer
// never waits on whoever's move it is. The answers settle it in the DM
// queue, so a truce never lands in the middle of a turn being written.
//
// couch_truces: one row per offer, its state as JSON. Made here on first
// use, as src/lib/couch/group-check.ts makes its own.

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_truces (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        encounter_id TEXT NOT NULL,
        status TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS couch_truces_campaign ON couch_truces(campaign_id, created_at);
    `);
    ensured.add(database);
  }
  return database;
}

function save(campaignId: string, truce: CouchTruce) {
  db()
    .prepare(
      `INSERT INTO couch_truces (id, campaign_id, encounter_id, status, state_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, state_json = excluded.state_json`,
    )
    .run(truce.id, campaignId, truce.encounterId, truce.status, JSON.stringify(truce), truce.createdAt);
}

// The offer still waiting on answers in the fight that is on, for a TV or a
// phone that loads mid-offer. An offer from a fight that has since ended is
// over with it.
export function latestCouchTruce(campaignId: string): CouchTruce | null {
  const row = db()
    .prepare(`SELECT state_json FROM couch_truces WHERE campaign_id = ? AND status = 'open' ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(campaignId) as { state_json: string } | undefined;
  const truce = row ? parseJson<CouchTruce | null>(row.state_json, null) : null;
  return truce && getActiveEncounter(campaignId)?.id === truce.encounterId ? truce : null;
}

function speak(campaign: Campaign, id: string, text: string) {
  if (!campaign.gameSettings.ttsEnabled) return;
  void enqueueNarrationAudio(campaign.id, id, text, [], campaign.gameSettings, null, { onDemand: true, narratorOnly: true });
}

function tableNote(campaign: Campaign, content: string) {
  const seq = allocateSeq(campaign.id);
  const message = insertCampaignMessage({ campaignId: campaign.id, seq, authorType: "system", glyph: "cue-battle", content });
  publishWithSeq(campaign.id, seq, "message_added", { message });
}

const isCrew = (sheet: CharacterSheet) => !sheet.isCompanion && !sheet.summon;
const standing = (sheet: CharacterSheet) => !sheet.deathSaves?.dead && sheet.currentHp > 0;

const offerSchema = z.object({
  characterId: z.string().trim().min(1),
  terms: z.string().trim().max(300).optional(),
});

// offer_truce on a couch night.
export function handleOfferTruce(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "A truce vote belongs to a couch one-shot; use end_encounter.", refused: "rules" };
  }
  let args: z.infer<typeof offerSchema>;
  try {
    args = offerSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: offer_truce needs the offering crew member's characterId, and may take the terms.", retry: true };
  }
  const encounter = getActiveEncounter(campaign.id);
  if (!encounter?.orderReady) {
    return { error: "No fight is on: without one there is nothing to stop. Narrate the words.", refused: "rules" };
  }
  const sheets = listSheets(campaign.id);
  const offerer = sheets.find((sheet) => sheet.id === args.characterId);
  if (!offerer) {
    return { error: "characterId names no crew member; use the offering crew member's characterId from GAME STATE.", retry: true };
  }
  const current = encounter.order[encounter.turnIndex];
  if (current?.kind !== "pc" || current.characterId !== offerer.id) {
    return { error: `It is not ${offerer.name}'s move: a truce is offered on the offerer's own turn.`, refused: "rules" };
  }
  if (latestCouchTruce(campaign.id)) {
    return { error: "A truce is already waiting on the crew's answers; the phones settle it.", refused: "rules" };
  }
  const inFight = new Set(encounter.order.flatMap((entry) => (entry.kind === "pc" ? [entry.characterId] : [])));
  const asked = sheets.filter(
    (sheet) => sheet.id !== offerer.id && inFight.has(sheet.id) && isCrew(sheet) && standing(sheet) && !aiPlaysSheet(campaign, sheet),
  );
  if (!asked.length) {
    return {
      ok: true,
      note: `Nobody else in this fight answers from a phone: decide whether the foes accept ${offerer.name}'s truce (npc_reaction or social_check), then end_encounter with outcome truce if they do. Offering it is ${offerer.name}'s action this turn.`,
    };
  }
  const truce: CouchTruce = {
    id: crypto.randomUUID(),
    encounterId: encounter.id,
    offeredBy: { characterId: offerer.id, name: offerer.name },
    terms: args.terms ?? "",
    members: asked.map((sheet) => ({ characterId: sheet.id, name: sheet.name, answer: "waiting" })),
    status: "open",
    createdAt: nowIso(),
  };
  save(campaign.id, truce);
  publishPersisted(campaign.id, "couch_truce", { truce });
  speak(campaign, couchTruceVoiceId(truce.id, "call"), couchTruceCall(truce));
  const creatures = standingOn(campaign.id, encounter, "foe").some((combatant) => combatant.kind === "enemy");
  return {
    ok: true,
    asked: asked.map((sheet) => sheet.name),
    note: [
      `Offering the truce is ${offerer.name}'s action this turn. ${asked.map((sheet) => sheet.name).join(", ")} answer on their phones; the server reads the answer to the table and ends the fight if everyone accepts.`,
      "Narrate the offer in a line or two and stop. Never ask anyone whether they accept, and never answer for them.",
      creatures ? "The creatures in the fight are not asked: they fight on unless you rule otherwise." : "",
    ].filter(Boolean).join(" "),
  };
}

export type TruceAnswerOutcome = { ok: true; truce: CouchTruce } | { ok: false; status: number; error: string };

// A crew member's answer from their phone (POST .../couch/truce).
export function answerCouchTruce(campaign: Campaign, userId: string, truceId: string, accept: boolean): TruceAnswerOutcome {
  const truce = latestCouchTruce(campaign.id);
  if (!truce || truce.id !== truceId) {
    return { ok: false, status: 409, error: "That truce is settled." };
  }
  const mine = truce.members.find((member) => member.answer === "waiting" && getSheetById(member.characterId)?.userId === userId);
  if (!mine) {
    return { ok: false, status: 409, error: "This truce is not waiting on you." };
  }
  const next = answerTruce(truce, mine.characterId, accept);
  save(campaign.id, next);
  publishPersisted(campaign.id, "couch_truce", { truce: next });
  if (next.status !== "open") {
    enqueueDmJob(campaign.id, async () => settleTruce(campaign.id, next.id));
  }
  return { ok: true, truce: next };
}

// The last answer is in. Refused: the table is told and the fight goes on.
// Accepted: the crew who turned stand with the others again; with no foe
// left standing the fight ends as a truce, and the GM is woken to narrate
// the peace.
async function settleTruce(campaignId: string, truceId: string) {
  const campaign = getCampaignById(campaignId);
  const row = db().prepare(`SELECT state_json FROM couch_truces WHERE id = ?`).get(truceId) as { state_json: string } | undefined;
  const truce = row ? parseJson<CouchTruce | null>(row.state_json, null) : null;
  const encounter = getActiveEncounter(campaignId);
  if (!campaign || !truce || encounter?.id !== truce.encounterId) return;
  if (truce.status === "refused") {
    const line = couchTruceResult(truce, { fightOver: false });
    tableNote(campaign, line);
    speak(campaign, couchTruceVoiceId(truce.id, "result"), line);
    return;
  }
  const others = standingOn(campaignId, encounter, "foe").filter((combatant) => combatant.kind === "enemy" || !isCrew(combatant.sheet));
  if (others.length) {
    // Creatures still stand: the crew make peace among themselves and face
    // them together.
    for (const id of [truce.offeredBy.characterId, ...truce.members.map((member) => member.characterId)]) {
      if (sheetSide(encounter, id) === "foe") moveToSide(campaign, id, "party", { reason: "The truce holds.", quiet: true });
    }
    publishEncounter(campaignId);
    const line = couchTruceResult(truce, { fightOver: false });
    tableNote(campaign, line);
    speak(campaign, couchTruceVoiceId(truce.id, "result"), line);
    return;
  }
  const sheets = listSheets(campaignId);
  // A turn for the fight's end and its records, closed as soon as it is
  // used, as a fight the party loses is (encounter-tools.ts partyFallen).
  const turn = createDmTurn(campaignId, [], "human_dm");
  try {
    finishEncounter(campaign, turn, encounter, "truce", sheets, new Map(sheets.map((sheet) => [sheet.id, sheet])));
  } finally {
    turn.status = "done";
    saveDmTurn(turn);
  }
  publishEncounter(campaignId);
  const line = couchTruceResult(truce, { fightOver: true });
  tableNote(campaign, line);
  speak(campaign, couchTruceVoiceId(truce.id, "result"), line);
  wakeDm(campaignId);
}
