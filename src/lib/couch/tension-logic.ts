// The night's tension clock (docs/couch-mode-spec.md 2.2, "Pressure"): how
// long the crew has gone without anything coming at them, and what the GM
// owes the room next. The ALIEN RPG's Game Mother advice, in the shape of a
// counter: dread first (signs, aftermath, people who want something), then a
// strike, then a breather that lets the crew lower its guard, and the next
// challenge waiting when it does. "The world moves every two or three
// replies" was a sentence in COUCH_RULES with nothing counting it, and the
// GM let quiet stretches run on. And the opposite failure, from tables that
// played ALIEN: pressure piled on pressure freezes a table, so a strike is
// one thing with one choice, and a strike the GM narrated without a tool is
// logged with spring_beat rather than struck again.
//
// Pure, for scripts/test-couch-tension.mjs; src/lib/couch/tension.ts keeps
// the clock and the quiet-room timer.

export const BEAT_KINDS = ["sign", "human", "strike"] as const;
export type BeatKind = (typeof BEAT_KINDS)[number];

// One prepared scare in an act's deck (forge-logic.ts ForgedAct.beats): a
// sign of the threat, a person who wants something now, or something that
// comes at the crew.
export type ForgedBeat = { kind: BeatKind; what: string };

export const BEAT_MAX = 200;
export const BEATS_PER_ACT = 6;

export function isBeatKind(value: unknown): value is BeatKind {
  return typeof value === "string" && (BEAT_KINDS as readonly string[]).includes(value);
}

// A deck as the story model (or an old night) wrote it: unknown kinds and
// empty lines dropped, the rest clipped.
export function readBeats(value: unknown): ForgedBeat[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const entry = raw as Record<string, unknown>;
      const kind = typeof entry.kind === "string" ? entry.kind.trim().toLowerCase() : "";
      const what = typeof entry.what === "string" ? entry.what.replace(/\s+/g, " ").trim().slice(0, BEAT_MAX) : "";
      return isBeatKind(kind) && what ? { kind, what } : null;
    })
    .filter((beat): beat is ForgedBeat => beat !== null)
    .slice(0, BEATS_PER_ACT);
}

// A beat's id in the used list: "act.index", both from 0.
export const beatId = (act: number, index: number): string => `${act}.${index}`;

// Tools whose success means something came at the crew. The same calls the
// music hears as a fight or danger (mood-logic.ts toolMood), plus a chase.
const STRIKE_TOOLS = new Set([
  "pc_attack",
  "enemy_attack",
  "aoe_damage",
  "cast_at_enemy",
  "start_encounter",
  "legendary_action",
  "lair_action",
  "apply_damage",
  "cast_at_player",
  "apply_hazard",
]);

// Whether a tool that just ran was a strike: dice or a condition that can
// hurt the crew. Only a call that worked: a refused attack came at nobody.
// A warning, an alarm or a logged beat is not one: on 2026-10-31 ("Crew
// Expendable") the GM logged eleven prose strikes, each an alarm that
// reset the clock, and the crew lost no hit points in seventy-five minutes.
export function isStrikeTool(name: string, rawArguments: string, outcome: Record<string, unknown>): boolean {
  if (outcome.error !== undefined || outcome.refused !== undefined) return false;
  if (STRIKE_TOOLS.has(name)) return true;
  if (name === "set_condition") {
    try {
      return Boolean((JSON.parse(rawArguments || "{}") as { characterId?: unknown }).characterId);
    } catch {
      return false;
    }
  }
  if (name === "start_scene") {
    try {
      return (JSON.parse(rawArguments || "{}") as { kind?: unknown }).kind === "chase";
    } catch {
      return false;
    }
  }
  return false;
}

export type TensionPhase = "breather" | "build" | "strike" | "overdue";

// Replies past due before the line stops asking and insists.
export const OVERDUE_AFTER = 2;

// After how many of the GM's replies, counting the one that struck, each
// act's quiet stretch must end. The acts tighten: act III strikes every
// other reply.
export const STRIKE_DUE = [4, 3, 2] as const;

// `replies` counts the GM's replies since the last strike, the striking reply
// included, so the reply right after a strike reads 1.
export function tensionPhase(act: number, replies: number): TensionPhase {
  const due = STRIKE_DUE[Math.max(0, Math.min(STRIKE_DUE.length - 1, act))];
  if (replies >= due + OVERDUE_AFTER) return "overdue";
  if (replies >= due) return "strike";
  // Act III has no breather: the reply after a strike already builds.
  if (replies <= 1 && due > 2) return "breather";
  return "build";
}

// What each phase reaches for first in the deck.
const PREFERS: Record<TensionPhase, readonly BeatKind[]> = {
  breather: ["sign"],
  build: ["sign", "human"],
  strike: ["strike", "human"],
  overdue: ["strike"],
};

// The next unused beat this phase wants, by its number in the act's deck
// (from 1, as spring_beat takes it), or null when the deck has none left of
// that kind.
export function nextBeat(beats: readonly ForgedBeat[], used: ReadonlySet<string>, act: number, phase: TensionPhase): { number: number; beat: ForgedBeat } | null {
  for (const kind of PREFERS[phase]) {
    const index = beats.findIndex((beat, at) => beat.kind === kind && !used.has(beatId(act, at)));
    if (index >= 0) return { number: index + 1, beat: beats[index] };
  }
  return null;
}

// The line the room sees when it has gone quiet (src/lib/couch/tension.ts):
// a table note, so the turn it wakes has something to answer and the
// transcript says why the GM spoke.
export const QUIET_NOTE = "The room has gone quiet.";

// How long a quiet room waits, and how many beats the GM plays in a row
// with nobody speaking: two, then it waits for the room (a pizza break is
// not a stalled scene).
export const QUIET_MS = 3 * 60_000;
export const QUIET_MAX_IN_A_ROW = 2;
// A room silent this long past its due time has left (a night abandoned
// last week, read again after a restart): nobody is there to play to.
export const QUIET_STALE_MS = 10 * 60_000;

export type QuietFacts = {
  // The newest message's author and when it landed (ms since the epoch).
  newest: { authorType: "player" | "dm" | "system"; at: number } | null;
  // Quiet notes since the last player post.
  quietInARow: number;
  // Anything that means the room is not quiet but busy or away: a turn
  // running or parked on a roll, a fight, a break, a closed floor, the
  // introductions still on, nobody having spoken yet tonight.
  busy: boolean;
  now: number;
};

export type QuietDecision = { fire: true } | { fire: false; retryAt: number | null };

// Whether the quiet room's clock should wake the GM now, or when to look
// again. Only after the GM's own narration: a post is answered by its own
// turn, and a note already waiting has its turn coming.
export function decideQuiet(facts: QuietFacts): QuietDecision {
  if (facts.busy || !facts.newest || facts.newest.authorType !== "dm" || facts.quietInARow >= QUIET_MAX_IN_A_ROW) {
    return { fire: false, retryAt: null };
  }
  const due = facts.newest.at + QUIET_MS;
  if (facts.now > due + QUIET_STALE_MS) return { fire: false, retryAt: null };
  return facts.now >= due ? { fire: true } : { fire: false, retryAt: due };
}

const STEER: Record<TensionPhase, string> = {
  breather: "Breather: let them catch their breath, plan, patch up, loot, talk. Plant one sign that it is not over. Those who truly rest: adjust_stress -1. Lowered guards are when the next thing comes.",
  build: "Build: the threat leaves a sign (a sound, a trace, a body, a failing system; a horror seen is adjust_stress +1), a hidden effect shows a symptom, or someone presses a demand. An unexplored room is where it waits. Never repeat a warning: a threat announced twice lands.",
  strike: "STRIKE DUE: this reply dice that can hurt land on a named crew member: apply_hazard (the vent blows, the line whips, the deck gives way: a save, real damage), an attack, a foe or an NPC turning on them without warning (start_encounter, surprised: party), a hidden effect paying off. One strike, one clear choice.",
  overdue: "OVERDUE: you have warned enough. Stop describing alarms and sounds: in this reply the thing you warned of happens, with dice: apply_hazard on named crew, or start_encounter with surprised: party. It can wound, drop or kill.",
};

// The GM's line, read every turn outside a fight beside NIGHT PACE.
export function couchTensionLine(input: {
  act: number;
  replies: number;
  beats: readonly ForgedBeat[];
  used: ReadonlySet<string>;
  // The room went silent (the quiet clock's note), or every answer since
  // your last reply was a pass.
  quiet: false | "silent" | "passed";
  // NIGHT PACE says the act is over time: its escalation is overdue too.
  overTime?: boolean;
}): string {
  const act = Math.max(0, Math.min(STRIKE_DUE.length - 1, input.act));
  const replies = Math.max(0, Math.round(input.replies));
  const counted = tensionPhase(act, replies);
  // A table that passes is waiting for the world: never a breather, and the
  // strike comes now rather than after another round of the same question.
  const calm = counted === "breather" || counted === "build";
  const phase = (input.quiet === "passed" || input.overTime) && calm ? "strike" : input.quiet && counted === "breather" ? "build" : counted;
  const head = `TENSION: ${replies} ${replies === 1 ? "reply" : "replies"} since dice last threatened the crew.`;
  const quiet =
    input.quiet === "silent"
      ? "THE ROOM WENT QUIET: nobody has spoken for a few minutes. Do not wait on them: the world acts now, then end on a choice put to a named crew member."
      : input.quiet === "passed"
        ? "THE TABLE PASSED: nobody chose. Never ask the same question again: the world chooses for them, now."
        : "";
  const late = input.overTime ? "THE ACT IS OVER TIME: its escalation hits now, with dice, whatever the crew is doing." : "";
  const next = nextBeat(input.beats, input.used, act, phase);
  const deck = next
    ? `Ready: beat ${next.number} (${next.beat.kind}): ${next.beat.what}`
    : input.beats.length
      ? "The act's deck is spent: improvise from its escalation, set pieces and foes."
      : "";
  const log =
    phase === "strike" || phase === "overdue"
      ? "Only dice reset this clock (apply_hazard, an attack, start_encounter, damage or a condition on crew); a warning or a logged beat does not."
      : "Mark a deck beat you play with spring_beat.";
  return [head, quiet, late, STEER[phase], deck, log].filter(Boolean).join(" ");
}

// What a couch GM reads with a check or save a crew member failed. "Fail
// forward" alone let the GM describe a coolant line lashing a shoulder and
// deal no damage: the room never felt the risk it rolled against.
export const FAILED_CHECK_COST =
  "FAILED: the cost lands now, on them. If what they risked was physical (a fall, a blow, fire, cold, vacuum, a machine, a creature), it hurts: apply_hazard or apply_damage on them in this reply. A described wound with no damage is not a cost.";

export function couchFailedCheckCost(kind: string, dc: number | null | undefined, success: boolean | null | undefined): string | null {
  if (dc === null || dc === undefined || success !== false) return null;
  return kind === "attack" || kind === "damage" || kind === "initiative" ? null : FAILED_CHECK_COST;
}
