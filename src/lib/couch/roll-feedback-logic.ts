import type { StoredRoll } from "@/lib/db/rolls";
import { rollExpression } from "@/lib/dice";
import { rollToastLead, ROLL_KIND_LABELS } from "@/lib/roll-labels";

export type CouchRollFeedback = {
  roll: StoredRoll;
  target: number | null;
  label: string;
  announcement: string;
  result: string;
  verdict: string;
  math: string;
  good: boolean;
  bad: boolean;
  // The parked roll a crew member threw from their phone: its call was
  // already read aloud, so the TV goes straight to the dice.
  pendingId?: string;
};

export type CouchAttackRuling = { hit: boolean; crit?: boolean; target?: number };

// Read adjudication only when it identifies every attack unambiguously.
// A natural 20 may hit a duplicate or have its critical damage prevented;
// the face alone is not the engine's ruling.
export function couchAttackRulings(rolls: readonly StoredRoll[], outcome: Record<string, unknown>): Map<string, CouchAttackRuling> {
  const attacks = rolls.filter((roll) => roll.kind === "attack");
  const rulings = new Map<string, CouchAttackRuling>();
  const swings = Array.isArray(outcome.swings) ? outcome.swings : [outcome];
  const resolved = swings.filter((swing): swing is Record<string, unknown> => Boolean(swing && typeof swing === "object" && typeof swing.rolled === "number" && typeof swing.hit === "boolean"));
  if (resolved.length !== attacks.length || !attacks.every((roll, index) => roll.total === resolved[index].rolled)) return rulings;
  attacks.forEach((roll, index) => rulings.set(roll.id, {
    hit: resolved[index].hit as boolean,
    crit: resolved[index].crit === true,
    ...(typeof outcome.vsAc === "number" ? { target: outcome.vsAc } : {}),
  }));
  return rulings;
}

// "call" is read for a parked roll, keyed by the pending roll, before
// anyone has thrown; "announce" and "result", keyed by the stored roll.
export type CouchRollPart = "announce" | "result" | "call";
export const COUCH_ROLL_PARTS: readonly CouchRollPart[] = ["announce", "result"];
export const couchRollVoiceId = (id: string, part: CouchRollPart) => `couch-roll-${id}-${part}`;

// A roll waiting on a crew member's phone (src/lib/dice/held-rolls.ts
// rollHolderIds), as the TV's call card, the phone's roll screen and the
// narrator read it. It is read before the throw: the stakes, the dice and
// the target, never a face.
export type CouchRollAsk = {
  id: string;
  kind: string;
  detail: string;
  expression: string;
  advantage: string;
  dc: number | null;
  reason: string;
};

export type CouchRollCall = {
  id: string;
  what: string;
  // "d20 + 5": the dice and the bonus, as the screens print them.
  formula: string;
  bonus: number;
  target: number | null;
  // "" without advantage or disadvantage; else what it does, in words.
  edge: string;
  announcement: string;
};

const COUNT_WORDS = ["", "a", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const ABILITIES: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

// What a roll is for, in words a new player reads: the GM often names a
// check by its ability's abbreviation ("int"), which says nothing on a couch
// or read aloud. A bare ability on a saving throw is a save.
export function rollWhat(detail: string, kindLabel: string): string {
  const text = detail.replaceAll("_", " ").trim();
  const short = /^(str|dex|con|int|wis|cha)(?:\s+(check|save|saving throw))?$/i.exec(text);
  if (short) {
    const kind = (short[2] ?? (/saving/i.test(kindLabel) ? "save" : "check")).toLowerCase();
    return `${ABILITIES[short[1].toLowerCase()]} ${kind === "check" ? "check" : "save"}`;
  }
  return text || kindLabel;
}

export function couchRollCall(ask: CouchRollAsk, name?: string): CouchRollCall {
  const kindLabel = ROLL_KIND_LABELS[ask.kind] ?? "Roll";
  const what = rollWhat(ask.detail, kindLabel);
  let terms: ReturnType<typeof rollExpression>["terms"] = [];
  try {
    terms = rollExpression(ask.expression, () => 1).terms;
  } catch {
    // An expression the engine rejects never parks; the words fall back to it.
  }
  // Advantage parks as 2d20kh1: one die to the eye, and the edge says why two.
  const shown = terms.map((term) =>
    term.kind === "dice" && term.keep?.count === 1 && term.count === 2 ? { ...term, count: 1 } : term,
  );
  const bonus = shown.reduce((sum, term) => sum + (term.kind === "modifier" ? term.sign * term.value : 0), 0);
  const formula = shown.map((term, index) => {
    const sign = term.sign < 0 ? "− " : index ? "+ " : "";
    return term.kind === "dice" ? `${sign}${term.count > 1 ? term.count : ""}d${term.sides}` : `${sign}${term.value}`;
  }).join(" ") || ask.expression;
  const spokenDice = shown.flatMap((term) => term.kind === "dice" ? [`${COUNT_WORDS[term.count] ?? term.count} d${term.sides}`] : []);
  const spoken = `${spokenDice.join(" and ") || ask.expression}${bonus > 0 ? ` plus ${bonus}` : bonus < 0 ? ` minus ${-bonus}` : ""}`;
  const edge = ask.advantage === "advantage" ? "Advantage: two dice, the higher counts." :
    ask.advantage === "disadvantage" ? "Disadvantage: two dice, the lower counts." : "";
  const who = name?.trim() || "You";
  const why = ask.reason.trim().slice(0, 200).replace(/[.!?]+$/, "");
  const announcement = `${who} · ${what}. ${why ? `${why}. ` : ""}${kindLabel}: ${who}, take your phone and roll ${spoken}.${
    ask.dc !== null ? ` Target ${ask.dc}; meet or beat it.` : ""}${edge ? ` ${edge}` : ""}`;
  return { id: ask.id, what, formula, bonus, target: ask.dc, edge, announcement };
}

export function rollMath(roll: StoredRoll): string {
  const terms = roll.breakdown?.terms ?? [];
  const math = terms.map((term, index) => {
    const value = term.kind === "modifier" ? String(term.value) : term.dice.map((die) =>
      die.kept ? String(die.value) : `${die.value} discarded`,
    ).join(", ");
    return `${term.sign < 0 ? "− " : index ? "+ " : ""}${term.kind === "dice" && term.dice.length > 1 ? `(${value})` : value}`;
  }).join(" ");
  return `${math || roll.expression} = ${roll.total}`;
}

// Public results only, even when the TV is signed in as the lead. Critical
// attack rules never turn an ordinary skill check into an automatic result.
export function couchRollFeedback(roll: StoredRoll, name?: string, reason = "", ruling?: CouchAttackRuling): CouchRollFeedback | null {
  if (roll.visibility !== "public" || !roll.breakdown) return null;
  const attackCrit = roll.kind === "attack" ? roll.breakdown.crit : undefined;
  const target = ruling?.target ?? roll.dc;
  const success = ruling ? ruling.hit : roll.kind === "attack" && target !== null
    ? attackCrit === "nat20" ? true : attackCrit === "nat1" ? false : roll.success : roll.success;
  const verdict = ruling?.hit && ruling.crit ? "Critical hit" :
    success === true ? (roll.kind === "attack" ? "Hit" : "Success") :
      success === false ? (roll.kind === "attack" ? "Miss" : "Failure") :
        attackCrit === "nat20" ? "Natural 20" : attackCrit === "nat1" ? "Natural 1" :
        roll.kind === "damage" ? "Damage rolled" : roll.kind === "initiative" ? "Turn order" : "Result";
  const label = rollToastLead({ ...roll, detail: rollWhat(roll.detail, ROLL_KIND_LABELS[roll.kind] ?? "") }, name);
  const targetWords = target !== null ? ` Target ${target}; meet or beat it.` : "";
  const advantage = roll.advantage === "advantage" ? " Roll twice and keep the higher." : roll.advantage === "disadvantage" ? " Roll twice and keep the lower." : "";
  const why = reason.trim().slice(0, 200);
  const announcement = `${label}. ${why ? `${why.replace(/[.!?]+$/, "")}. ` : ""}${ROLL_KIND_LABELS[roll.kind] ?? "Dice"}: rolling ${roll.expression}.${targetWords}${advantage}`;
  const meaning = roll.kind === "damage" ? "This is the damage rolled; defenses may change the health lost." :
    roll.kind === "initiative" ? "Higher initiative acts earlier." :
      roll.kind === "attack" ? success === true ? "The attack hits." : success === false ? "The attack misses." : "The GM resolves the attack and any defenses." :
        success === true ? "The roll succeeds." : success === false ? "The roll fails." : "The GM will explain what this changes.";
  const faces = roll.breakdown.terms.filter((term) => term.kind === "dice").flatMap((term) =>
    term.dice.map((die) => `${die.value}${die.kept ? "" : " discarded"}`),
  );
  const result = `${label}. ${faces.length ? `Dice: ${faces.join(", ")}. ` : ""}Total ${roll.total}${target !== null ? ` against target ${target}` : ""}. ${ruling?.hit && ruling.crit ? "Critical hit. " : ""}${meaning}`;
  return { roll, target, label, announcement, result, verdict, math: rollMath(roll), good: success === true, bad: success === false };
}
