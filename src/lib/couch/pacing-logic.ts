import { actName } from "@/lib/couch/prompt-logic";

// The night's pace (docs/couch-mode-spec.md 2.2): how long the act in force
// has run against its share of the evening, and what the crew is trying to
// do right now. Without it the GM could not tell a brisk act from a stalled
// one: on 2026-10-30 act I of "Unto Us" took 85 minutes and fifty replies
// (docking a lifepod took twenty of them), the act clocks never moved on
// their own, and the room started typing "skip". Pure, for
// scripts/test-couch-agenda.mjs; src/lib/couch/pacing.ts reads the clock.

// Each act's share of a two-and-a-half-hour night, in minutes, and in GM
// replies for a table that plays fast or slow.
export const ACT_MINUTES = [40, 55, 50] as const;
export const ACT_REPLIES = [18, 24, 22] as const;
export const NIGHT_MINUTES = ACT_MINUTES[0] + ACT_MINUTES[1] + ACT_MINUTES[2];

// A scenario written to run shorter (or longer) than the usual night
// (forge-logic.ts scenario.minutes) shares its acts out the same way.
export function actBudget(act: number, nightMinutes?: number): { minutes: number; replies: number } {
  const index = Math.max(0, Math.min(2, act));
  const scale = nightMinutes && nightMinutes > 0 ? nightMinutes / NIGHT_MINUTES : 1;
  return { minutes: Math.max(5, Math.round(ACT_MINUTES[index] * scale)), replies: Math.max(6, Math.round(ACT_REPLIES[index] * scale)) };
}

// What every screen shows the crew is trying to do: one line, and the
// deadline when there is one. act is the act it was set in, so a new act
// starts with none (src/lib/couch/store.ts setCouchAct).
export type CouchObjective = { text: string; clock: string; act: number };

export const OBJECTIVE_MAX = 100;
export const OBJECTIVE_CLOCK_MAX = 60;

export function readObjective(value: unknown): CouchObjective | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.replace(/\s+/g, " ").trim().slice(0, OBJECTIVE_MAX) : "";
  if (!text) return null;
  const clock = typeof raw.clock === "string" ? raw.clock.replace(/\s+/g, " ").trim().slice(0, OBJECTIVE_CLOCK_MAX) : "";
  const act = typeof raw.act === "number" && Number.isInteger(raw.act) && raw.act >= 0 ? raw.act : 0;
  return { text, clock, act };
}

export type PacePhase = "fresh" | "middle" | "late" | "over";

// Where the act stands: by the clock, unless the table has barely spoken
// (a pizza break is not a stalled act), and by the replies, which can only
// hurry it (a table that plays fast reaches the act's end sooner).
export function pacePhase(act: number, minutes: number, replies: number, nightMinutes?: number): PacePhase {
  const budget = actBudget(act, nightMinutes);
  const byTime = minutes / budget.minutes;
  const byReplies = replies / budget.replies;
  const share = Math.max(replies < 6 ? Math.min(byTime, 0.84) : byTime, byReplies);
  if (share >= 1.1) return "over";
  if (share >= 0.8) return "late";
  if (share >= 0.45) return "middle";
  return "fresh";
}

const LAST_ACT = 2;

// The GM's line, read every turn in the part of the prompt that changes.
export function couchPacingLine(input: { act: number; minutes: number; replies: number; objective: CouchObjective | null; nightMinutes?: number }): string {
  const act = Math.max(0, Math.min(LAST_ACT, input.act));
  const minutes = Math.max(0, Math.round(input.minutes));
  const phase = pacePhase(act, minutes, input.replies, input.nightMinutes);
  const last = act === LAST_ACT;
  const budget = actBudget(act, input.nightMinutes).minutes;
  const head = `NIGHT PACE: ${actName(act)} of III, ${minutes} of about ${budget} minutes, ${input.replies} of your replies so far.`;
  const push = {
    fresh: "On pace. Keep scenes short; TENSION says when the world acts.",
    middle: "Halfway: spring the act's twist if it has not landed, and bring in its escalation or a foe.",
    late: last
      ? "Nearly out of time: drive to the climax now; the ending lands within three or four replies, with end_night."
      : "Nearly out of time: drive to the act's goal now. Within two or three replies the act ends, its goal won or lost at a cost, and you call advance_act.",
    over: last
      ? `OVER TIME by ${Math.max(1, minutes - budget)} minutes: land the ending in this reply or the next, and call end_night with it. The clock runs out on its own.`
      : `OVER TIME by ${Math.max(1, minutes - budget)} minutes: end the act in this reply or the next. The clock runs out on its own: the escalation hits, the goal is won or lost at a cost, then advance_act.`,
  }[phase];
  const objective =
    input.objective && input.objective.act === act
      ? `OBJECTIVE on every screen: "${input.objective.text}"${input.objective.clock ? ` (clock: ${input.objective.clock})` : ""}. Change it with set_objective when the crew's aim changes.`
      : "OBJECTIVE: none on screen for this act. Call set_objective in this reply: what the crew must do now, in a few plain words.";
  return [head, push, objective].join(" ");
}
