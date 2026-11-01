// Stress and panic on a couch night (docs/couch-mode-spec.md 2.3): the one
// ALIEN mechanic laid over the 5e engine, because it makes fear count even
// when no hit point is lost. Each crew member carries stress from 0 to 10.
// It rises on its own (a wound, a crewmate dropping or dying, pushing a
// roll) and when the GM shows them something horrible, and falls when they
// truly rest. On a check or save the server throws one d6 per point beside
// the d20: each 6 adds +2 (adrenaline), and any 1 sets off a panic roll,
// d6 + stress on the table below. The scared get stronger and more likely
// to crack, which is the whole bargain.
//
// Server-run on purpose: on 2026-10-31 the GM went seventy-five minutes
// without dealing a point of damage it had described, so nothing here waits
// on the GM to remember a rule. Pure, for scripts/test-couch-stress.mjs;
// src/lib/couch/stress.ts keeps the counts.

import type { DieRng } from "@/lib/dice";

export const STRESS_MAX = 10;
// What a stress die's 6 adds to the check.
export const STRESS_SIX_BONUS = 2;
// How long a failed check waits for its thrower to push it before the GM
// reads it.
export const PUSH_WINDOW_MS = 15_000;

// Checks and saves only. Attacks stay 5e's, so a fight does not swing on
// dice nobody at the table can read.
export const STRESS_KINDS: ReadonlySet<string> = new Set(["skill_check", "ability_check", "saving_throw"]);

export const clampStress = (value: number): number => Math.max(0, Math.min(STRESS_MAX, Math.round(value)));

export type StressThrow = { faces: number[]; sixes: number; bonus: number; panic: boolean };

export function throwStressDice(stress: number, rng: DieRng): StressThrow | null {
  const count = clampStress(stress);
  if (!count) return null;
  const faces = Array.from({ length: count }, () => rng(6));
  const sixes = faces.filter((face) => face === 6).length;
  return { faces, sixes, bonus: sixes * STRESS_SIX_BONUS, panic: faces.includes(1) };
}

// What a panic does. `lose` is the moves the crew member sits out: only the
// top of the table takes the character out of their player's hands, so
// panic stays a rare, loud moment rather than a tax on every roll.
export type PanicEntry = {
  min: number;
  label: string;
  // For the GM, who narrates it.
  does: string;
  lose: number;
  // Stress it adds to its sufferer, and to every other crew member.
  selfStress: number;
  othersStress: number;
};

export const PANIC_TABLE: readonly PanicEntry[] = [
  { min: 0, label: "Holds it together", does: "they hold it together, barely: a shake in the voice, nothing more.", lose: 0, selfStress: 0, othersStress: 0 },
  { min: 7, label: "Jumpy", does: "a nervous twitch: they start at every sound (stress +1).", lose: 0, selfStress: 1, othersStress: 0 },
  { min: 8, label: "Drops it", does: "their hands shake and they drop what they are holding.", lose: 0, selfStress: 0, othersStress: 0 },
  { min: 9, label: "Freezes", does: "they freeze for a heartbeat: whatever they were doing comes a moment too late.", lose: 0, selfStress: 0, othersStress: 0 },
  { min: 10, label: "Screams", does: "they scream: every other crew member's stress +1, and anything hunting them now knows where they are.", lose: 0, selfStress: 0, othersStress: 1 },
  { min: 11, label: "Bolts", does: "they run, away from the threat, wherever their feet take them; they sit out their next move.", lose: 1, selfStress: 0, othersStress: 0 },
  { min: 12, label: "Lashes out", does: "they lash out at whatever is nearest, friend or not, with whatever is in their hands; resolve it, and they sit out their next move.", lose: 1, selfStress: 0, othersStress: 0 },
  { min: 13, label: "Catatonic", does: "they collapse into themselves, unable to move or speak, and sit out their next two moves unless a crewmate brings them round.", lose: 2, selfStress: 0, othersStress: 0 },
];

export function panicEntry(total: number): PanicEntry {
  return [...PANIC_TABLE].reverse().find((entry) => total >= entry.min) ?? PANIC_TABLE[0];
}

export type PanicRoll = { face: number; total: number; entry: PanicEntry };

export function rollPanic(stress: number, rng: DieRng): PanicRoll {
  const face = rng(6);
  const total = face + clampStress(stress);
  return { face, total, entry: panicEntry(total) };
}

// A failed roll its thrower may still push, or make succeed with a story
// point, until `until` (ms since the epoch), as every screen shows it
// (src/lib/couch/push.ts). push: false at full stress; storyPoints: what
// the thrower has to spend when the offer was made.
export type PushOffer = { pendingRollId: string; characterId: string; until: number; push: boolean; storyPoints: number };

// A crew member's stress as every screen shows it, and a panic still taking
// moves from them.
export type StressView = { stress: number; panic: { label: string; left: number } | null };

// The moves a panic still takes: the GM's replies since it struck count
// them off, so it ends without anyone remembering to end it.
export const panicMovesLeft = (lose: number, repliesSince: number): number => Math.max(0, lose - repliesSince);

// The GM's line, every turn, in the part of the prompt that changes. ""
// while nobody is stressed.
export function couchStressLine(crew: ReadonlyArray<{ name: string; view: StressView }>): string {
  const shown = crew.filter((member) => member.view.stress > 0 || member.view.panic);
  if (!shown.length) return "";
  const parts = shown.map(({ name, view }) =>
    `${name} ${view.stress}${view.panic ? ` (PANICKING: ${view.panic.label.toLowerCase()}, sits out ${view.panic.left} more ${view.panic.left === 1 ? "move" : "moves"}; ignore any move they send)` : ""}`,
  );
  return `STRESS (server-run, 0 to ${STRESS_MAX}; stress dice add +${STRESS_SIX_BONUS} per six to checks and saves, and a 1 sets off panic): ${parts.join(", ")}. Let it show in how they speak and move.`;
}

// What the roll's tool result tells the GM, and the TV's readout.
export function stressThrowWords(name: string, thrown: StressThrow, panic: PanicRoll | null): string {
  const dice = `${name}'s stress dice: ${thrown.faces.join(", ")}${thrown.bonus ? ` (+${thrown.bonus})` : ""}.`;
  return panic ? `${dice} PANIC (${panic.face} + stress = ${panic.total}): ${name} ${panic.entry.does}` : dice;
}

// The mark a spent story point leaves on the roll it saved (the end of its
// detail), which the readout reads, so it holds across a restart.
export const STORY_POINT_MARK = "(story point)";

export const savedByStoryPoint = (detail: string): boolean => detail.trimEnd().endsWith(STORY_POINT_MARK);
