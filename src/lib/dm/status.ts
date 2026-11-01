import { latestTurnParkedByAi } from "@/lib/db/dm-turns";
import { publishEphemeral } from "@/lib/events";
import { jobAbandoned } from "@/lib/dm/job-control";

// Last-published DM status per campaign, kept in memory so the campaign
// snapshot can report a turn already in flight (dm_status events are
// ephemeral and a client that reloads mid-turn would otherwise see idle).
// Lives on globalThis so dev-mode HMR cannot fork the map.

export type DmStatusState =
  | "idle"
  | "thinking"
  | "rolling"
  | "narrating"
  | "awaiting_rolls"
  | "writing_chapter"
  | "plotting_arc";

declare global {
  var __odmDmStatus: Map<string, DmStatusState> | undefined;
  var __odmDmPrivate: Set<string> | undefined;
}

function statuses() {
  return (globalThis.__odmDmStatus ??= new Map<string, DmStatusState>());
}

// Tables whose turn in flight only answers private whispers: nothing public
// waits on it, so a couch table keeps playing while the GM writes back
// (src/components/couch/couch-logic.ts couchGmStatus). Rides on every status
// the turn publishes and ends with it.
function privateTurns() {
  return (globalThis.__odmDmPrivate ??= new Set<string>());
}

// Set before the turn's first status; the next status carries it.
export function setDmTurnPrivate(campaignId: string, value: boolean) {
  if (value) privateTurns().add(campaignId);
  else privateTurns().delete(campaignId);
}

export function dmTurnPrivate(campaignId: string): boolean {
  return statuses().get(campaignId) !== "idle" && privateTurns().has(campaignId);
}

export function setDmStatus(campaignId: string, state: DmStatusState) {
  // A job the queue gave up on (src/lib/dm/queue.ts) no longer speaks for
  // the table: a newer job may own the line now.
  if (jobAbandoned()) {
    return;
  }
  statuses().set(campaignId, state);
  if (state === "idle") privateTurns().delete(campaignId);
  publishEphemeral(campaignId, "dm_status", { state, private: dmTurnPrivate(campaignId) });
}

// What this process last set for the table, without asking the database:
// undefined when it never set one.
export function knownDmStatus(campaignId: string): DmStatusState | undefined {
  return statuses().get(campaignId);
}

export function getDmStatus(campaignId: string): DmStatusState {
  const known = statuses().get(campaignId);
  if (known) {
    return known;
  }
  // This process never set the table's status: it started after the one
  // that did stopped. A turn the storyteller parked on physical dice is
  // still waiting on them whatever restarted, so the turns say so, and the
  // snapshot, continue and renarrate read what they read before the restart.
  // The answer is kept as if this process had set it, so the turns are read
  // once a table and every later change comes through setDmStatus.
  const found: DmStatusState = latestTurnParkedByAi(campaignId) ? "awaiting_rolls" : "idle";
  statuses().set(campaignId, found);
  return found;
}
