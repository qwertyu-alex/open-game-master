import { allocateSeq, getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { getDatabase } from "@/lib/db/core";
import { getActiveEncounter } from "@/lib/db/encounters";
import { insertCampaignMessage } from "@/lib/db/messages";
import { publishWithSeq } from "@/lib/events";
import { getDmStatus } from "@/lib/dm/status";
import { tableBreakOn } from "@/lib/dm/table-break";
import { wakeDm } from "@/lib/dm/wake";
import { introDone, introTotal } from "@/lib/couch/intro-logic";
import { pacePhase } from "@/lib/couch/pacing-logic";
import { getCouchForge, listCouchCrew, markCouchPressure, startCouchActClock, markCouchBeatPlayed } from "@/lib/couch/store";
import {
  QUIET_NOTE,
  beatId,
  couchTensionLine,
  decideQuiet,
  isStrikeTool,
  readBeats,
  type BeatKind,
} from "@/lib/couch/tension-logic";

// The rim of the night's tension clock (src/lib/couch/tension-logic.ts):
// only the strikes the tools show restart it (dice that can hurt; a logged
// beat only marks the deck), every couch
// turn outside a fight reads where it stands, and a room that has gone
// quiet after the GM spoke wakes the GM to play the next beat.

// The GM's replies after `since`: the striking reply lands after the tool
// that struck, so it counts.
function repliesSince(campaignId: string, since: string): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM campaign_messages WHERE campaign_id = ? AND author_type = 'dm' AND created_at > ?`)
    .get(campaignId, since) as { n: number } | undefined;
  return row?.n ?? 0;
}

type Newest = { authorType: "player" | "dm" | "system"; content: string; createdAt: string };

function newestMessage(campaignId: string): Newest | null {
  return (
    (getDatabase()
      .prepare(`SELECT author_type AS authorType, content, created_at AS createdAt FROM campaign_messages WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1`)
      .get(campaignId) as Newest | undefined) ?? null
  );
}

// A tool that worked during a GM turn: an attack, damage or a chase is
// something coming at the crew whether or not the GM logged it.
export function noteCouchTensionTool(campaign: Campaign, name: string, rawArguments: string, outcome: Record<string, unknown>) {
  if (!campaign.gameSettings.couchMode || !isStrikeTool(name, rawArguments, outcome)) return;
  markCouchPressure(campaign.id);
}

// "" off a couch night, before the night is forged, and during a fight,
// which is the strike itself (COUCH_FIGHT_RULES).
export function couchTensionPrompt(campaign: Campaign, inFight: boolean): string {
  if (!campaign.gameSettings.couchMode || inFight) return "";
  const forge = getCouchForge(campaign.id);
  if (!forge || forge.status !== "ready") return "";
  const actSince = startCouchActClock(campaign.id);
  const since = forge.pressureAt || actSince;
  const newest = newestMessage(campaign.id);
  const actMinutes = (Date.now() - Date.parse(actSince)) / 60000;
  const overTime = pacePhase(forge.act, Number.isFinite(actMinutes) ? actMinutes : 0, repliesSince(campaign.id, actSince), forge.forge?.scenario.minutes) === "over";
  return couchTensionLine({
    act: forge.act,
    replies: repliesSince(campaign.id, since),
    beats: readBeats(forge.forge?.scenario.acts[forge.act]?.beats),
    used: new Set(forge.beatsUsed),
    quiet: newest?.authorType === "system" && newest.content === QUIET_NOTE ? "silent" : tablePassed(campaign.id) ? "passed" : false,
    overTime,
  });
}

const PASS = /^\s*(?:i\s+)?pass(?:es|ed)?[.!]?\s*$/i;

// Every answer since the GM's last reply was a pass: typed as one word, or
// the phone's Pass (a table_pass event). At least one answer, so a table
// that has said nothing yet is not "passing".
function tablePassed(campaignId: string): boolean {
  const db = getDatabase();
  const last = db.prepare(`SELECT MAX(seq) AS seq FROM campaign_messages WHERE campaign_id = ? AND author_type = 'dm'`).get(campaignId) as { seq: number | null } | undefined;
  const since = last?.seq ?? 0;
  const posts = db
    .prepare(`SELECT content FROM campaign_messages WHERE campaign_id = ? AND author_type = 'player' AND seq > ?`)
    .all(campaignId, since) as Array<{ content: string }>;
  const passes = db.prepare(`SELECT COUNT(*) AS n FROM campaign_events WHERE campaign_id = ? AND type = 'table_pass' AND seq > ?`).get(campaignId, since) as { n: number } | undefined;
  return posts.every((post) => PASS.test(post.content)) && posts.length + (passes?.n ?? 0) > 0;
}

export type SpringResult = { ok: true; kind: BeatKind; beat?: string } | { ok: false; error: string };

// spring_beat: a deck beat by its number, or one the GM improvised, by kind.
// A beat played twice is still played once. It marks the deck and nothing
// else: only dice restart the clock (noteCouchTensionTool).
export function springCouchBeat(campaign: Campaign, input: { beat?: number; kind?: BeatKind }): SpringResult {
  const forge = getCouchForge(campaign.id);
  if (!forge || forge.status !== "ready") return { ok: false, error: "The night is not ready yet." };
  const beats = readBeats(forge.forge?.scenario.acts[forge.act]?.beats);
  let kind = input.kind;
  let what: string | undefined;
  if (input.beat !== undefined) {
    const chosen = beats[input.beat - 1];
    if (!chosen) {
      return { ok: false, error: beats.length ? `This act's deck has beats 1 to ${beats.length}.` : "This act has no deck: give the kind of beat you played instead." };
    }
    markCouchBeatPlayed(campaign.id, beatId(forge.act, input.beat - 1));
    kind = chosen.kind;
    what = chosen.what;
  }
  if (!kind) return { ok: false, error: "Give the beat's number from TENSION, or its kind (sign, human or strike)." };
  return { ok: true, kind, ...(what ? { beat: what } : {}) };
}

// ---- the quiet room ----

declare global {
  var __odmCouchQuiet: Map<string, ReturnType<typeof setTimeout>> | undefined;
}

const timers = () => (globalThis.__odmCouchQuiet ??= new Map<string, ReturnType<typeof setTimeout>>());

function quietInARow(campaignId: string): number {
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) AS n FROM campaign_messages WHERE campaign_id = ? AND author_type = 'system' AND content = ?
         AND seq > COALESCE((SELECT MAX(seq) FROM campaign_messages WHERE campaign_id = ? AND author_type = 'player'), 0)`,
    )
    .get(campaignId, QUIET_NOTE, campaignId) as { n: number } | undefined;
  return row?.n ?? 0;
}

function anyonePosted(campaignId: string): boolean {
  return Boolean(getDatabase().prepare(`SELECT 1 FROM campaign_messages WHERE campaign_id = ? AND author_type = 'player' LIMIT 1`).get(campaignId));
}

function rollWaiting(campaignId: string): boolean {
  return Boolean(getDatabase().prepare(`SELECT 1 FROM pending_rolls WHERE campaign_id = ? AND status = 'pending' LIMIT 1`).get(campaignId));
}

// Everything that makes a silent room busy or away rather than quiet.
function busy(campaign: Campaign): boolean {
  if (campaign.status !== "active" || getDmStatus(campaign.id) !== "idle" || tableBreakOn(campaign.id)) return true;
  const forge = getCouchForge(campaign.id);
  if (!forge || forge.status !== "ready" || !introDone(forge.introStep, introTotal(listCouchCrew(campaign.id).length))) return true;
  return Boolean(getActiveEncounter(campaign.id)) || rollWaiting(campaign.id) || !anyonePosted(campaign.id);
}

function clear(campaignId: string) {
  const timer = timers().get(campaignId);
  if (timer) clearTimeout(timer);
  timers().delete(campaignId);
}

// Called when a GM turn ends and after a restart: looks at the room, and
// either wakes the GM now or sets the clock for when it should look again.
// Anything that happens in between (a post, a fight) is seen when it does.
export function armCouchQuiet(campaignId: string, now = Date.now()): boolean {
  clear(campaignId);
  const campaign = getCampaignById(campaignId);
  // A night that has ended has no room to wake.
  if (!campaign?.gameSettings.couchMode || campaign.status !== "active") return false;
  const newest = newestMessage(campaignId);
  const decision = decideQuiet({
    newest: newest ? { authorType: newest.authorType, at: Date.parse(newest.createdAt) } : null,
    quietInARow: quietInARow(campaignId),
    busy: busy(campaign),
    now,
  });
  if (decision.fire) {
    const seq = allocateSeq(campaignId);
    const message = insertCampaignMessage({ campaignId, seq, authorType: "system", glyph: "cue-bell", content: QUIET_NOTE });
    publishWithSeq(campaignId, seq, "message_added", { message });
    wakeDm(campaignId);
    return true;
  }
  if (decision.retryAt !== null) {
    // Node timers fire late, never early; the room is read again then.
    const timer = setTimeout(() => {
      timers().delete(campaignId);
      armCouchQuiet(campaignId);
    }, Math.max(0, decision.retryAt - now) + 50);
    timer.unref?.();
    timers().set(campaignId, timer);
  }
  return false;
}

// After a restart the timers are gone: every active couch night looks at
// its room once.
export function rearmCouchQuiet(): number {
  const rows = getDatabase()
    .prepare(`SELECT id FROM campaigns WHERE status = 'active' AND json_extract(game_settings_json, '$.couchMode') = 1`)
    .all() as Array<{ id: string }>;
  let woken = 0;
  for (const row of rows) {
    if (armCouchQuiet(row.id)) woken += 1;
  }
  return woken;
}
