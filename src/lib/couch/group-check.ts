import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import type { Campaign } from "@/lib/db/campaigns";
import { getPendingRoll, publicPendingRoll, type DmTurn, type PendingRoll } from "@/lib/db/dm-turns";
import { getRoll } from "@/lib/db/rolls";
import { publishPersisted } from "@/lib/events";
import { enqueueNarrationAudio } from "@/lib/tts";
import { handleGroupCheck, type GroupCheckEntry } from "@/lib/dm/check-tools";
import type { ToolResult } from "@/lib/dm/tool-errors";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import {
  couchGroupAnswer,
  couchGroupCall,
  couchGroupResult,
  couchGroupVoiceId,
  groupCheckWhat,
  landGroupThrow,
  type CouchGroupCheck,
} from "./group-check-logic";

// A couch night's group check (docs/couch-mode-spec.md 2.10), the server
// half. group_check parks each crew member's roll for their phone; this
// keeps the group they belong to, so the TV shows one card, the narrator
// reads one call and one verdict, and the resumed GM turn reads one answer
// for the one call it made. The rolls themselves are ordinary parked rolls:
// the phone throws them through the pending-rolls route as it throws any.
//
// couch_group_checks: one row per group check, its state as JSON. Made here
// on first use, as src/lib/couch/store.ts makes its own.

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_group_checks (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL,
        status TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS couch_group_checks_turn ON couch_group_checks(turn_id);
      CREATE INDEX IF NOT EXISTS couch_group_checks_campaign ON couch_group_checks(campaign_id, created_at);
    `);
    ensured.add(database);
  }
  return database;
}

function save(campaignId: string, group: CouchGroupCheck) {
  db()
    .prepare(
      `INSERT INTO couch_group_checks (id, campaign_id, turn_id, status, state_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, state_json = excluded.state_json`,
    )
    .run(group.id, campaignId, group.turnId, group.status, JSON.stringify(group), group.createdAt);
}

function groupsForTurn(turnId: string): CouchGroupCheck[] {
  const rows = db()
    .prepare(`SELECT state_json FROM couch_group_checks WHERE turn_id = ? ORDER BY created_at, rowid`)
    .all(turnId) as Array<{ state_json: string }>;
  return rows.map((row) => parseJson<CouchGroupCheck | null>(row.state_json, null)).filter((group) => group !== null);
}

export function couchGroupForPending(turnId: string, pendingId: string): CouchGroupCheck | null {
  return groupsForTurn(turnId).find((group) => group.members.some((member) => member.pendingId === pendingId)) ?? null;
}

// The group still waiting on dice, for a TV or phone that loads mid-check.
export function latestCouchGroup(campaignId: string): CouchGroupCheck | null {
  const row = db()
    .prepare(`SELECT state_json FROM couch_group_checks WHERE campaign_id = ? AND status = 'open' ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(campaignId) as { state_json: string } | undefined;
  return row ? parseJson<CouchGroupCheck | null>(row.state_json, null) : null;
}

function speak(campaign: Campaign, id: string, text: string) {
  if (!campaign.gameSettings.ttsEnabled) return;
  void enqueueNarrationAudio(campaign.id, id, text, [], campaign.gameSettings, null, { onDemand: true, narratorOnly: true });
}

// The AI's group_check on a couch night. Every crew member it names whose
// phone holds their rolls (all of them, src/lib/dice/held-rolls.ts) gets a
// parked roll; the rest of the check (the DC, who may take part, the dead
// failing) is group_check's own. Returns parked: true when the turn waits.
export function handleCouchGroupCheck(
  campaign: Campaign,
  turn: DmTurn,
  rawArguments: string,
  sheets: CharacterSheet[],
  sheetsById: Map<string, CharacterSheet>,
  userIds: ReadonlySet<string>,
  toolCallId: string | null,
): ToolResult {
  const result = handleGroupCheck(campaign, turn, rawArguments, sheets, sheetsById, { toolCallId, userIds });
  if (!result.parked) return result;
  const entries = result.entries as GroupCheckEntry[];
  const check = String(result.check ?? "");
  const group: CouchGroupCheck = {
    id: crypto.randomUUID(),
    turnId: turn.id,
    toolCallId,
    check,
    what: groupCheckWhat(check),
    dc: Number(result.dc),
    difficulty: String(result.difficulty ?? ""),
    reason: String(result.reason ?? ""),
    members: entries.map((entry) => ({
      characterId: entry.characterId,
      name: entry.name,
      pendingId: entry.pending?.id ?? null,
      state: entry.pending ? "waiting" : entry.success ? "pass" : "fail",
      total: entry.pending || !entry.rollId ? null : entry.total,
      rollId: entry.rollId,
    })),
    decidedBy: null,
    status: "open",
    answered: false,
    createdAt: nowIso(),
  };
  save(campaign.id, group);
  // The group first, so no screen ever shows its rolls as separate calls.
  publishPersisted(campaign.id, "couch_group", { group });
  for (const entry of entries) {
    if (entry.pending) publishPersisted(campaign.id, "roll_pending", { pendingRoll: publicPendingRoll(entry.pending) });
  }
  speak(campaign, couchGroupVoiceId(group.id, "call"), couchGroupCall(group));
  return { ok: true, parked: true };
}

// A crew member threw their part of a group check (the pending-rolls route,
// through src/lib/couch/roll-feedback.ts). The card fills in; the last die
// in reads the verdict. Null when the roll is no group's.
export function landCouchGroupThrow(campaign: Campaign, pending: PendingRoll, roll: { id: string; total: number }): CouchGroupCheck | null {
  const group = couchGroupForPending(pending.turnId, pending.id);
  if (!group) return null;
  const next = landGroupThrow(group, pending.id, roll);
  if (next === group) return group;
  save(campaign.id, next);
  publishPersisted(campaign.id, "couch_group", { group: next });
  if (next.status === "done") speak(campaign, couchGroupVoiceId(next.id, "result"), couchGroupResult(next));
  return next;
}

// For the resumed GM turn (src/lib/dm/turn.ts resumeDmTurn): the parked
// rolls a group answers together, and one tool answer per finished group
// not yet handed over. Marks them handed over.
export function takeCouchGroupAnswers(campaignId: string, turnId: string): {
  pendingIds: Set<string>;
  answers: Array<{ toolCallId: string | null; content: string }>;
} {
  const groups = groupsForTurn(turnId);
  const pendingIds = memberPendingIds(groups);
  const answers: Array<{ toolCallId: string | null; content: string }> = [];
  for (const stored of groups) {
    if (stored.answered) continue;
    // A throw whose readout failed in the route is still a stored roll: it
    // counts here, so the GM is never resumed without its answer.
    let group = stored;
    for (const member of stored.members) {
      if (member.state !== "waiting" || !member.pendingId) continue;
      const pending = getPendingRoll(member.pendingId);
      const roll = pending?.status !== "pending" && pending?.rollId ? getRoll(pending.rollId) : null;
      if (roll) group = landGroupThrow(group, member.pendingId, roll);
    }
    if (group.status !== "done") continue;
    answers.push({ toolCallId: group.toolCallId, content: JSON.stringify(couchGroupAnswer(group)) });
    save(campaignId, { ...group, answered: true });
  }
  return { pendingIds, answers };
}

// The parked rolls of a group, whose calls are read once for the group
// instead of once each (src/lib/couch/roll-feedback.ts).
export function groupedPendingIds(turnId: string): Set<string> {
  return memberPendingIds(groupsForTurn(turnId));
}

function memberPendingIds(groups: CouchGroupCheck[]): Set<string> {
  return new Set(groups.flatMap((group) => group.members.flatMap((member) => member.pendingId ? [member.pendingId] : [])));
}
