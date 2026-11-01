// Hidden effects on the crew (docs/couch-mode-spec.md 2.13): the parasite
// in a chest, the spores in a lung, the implant nobody remembers getting,
// the thing that answers to someone else's voice. The best surprises of an
// ALIEN night are ones the GM planted acts earlier, showed in symptoms the
// room half-noticed, and paid off at the worst moment. Without a record the
// GM forgot them by the next act, or blurted them out the turn they began.
//
// An effect is a secret on one crew member: what it really is (the truth),
// and its stages, each a symptom the GM shows, the last the payoff. The GM
// moves it on; the server counts the replies it has sat at a stage and says
// when the next symptom is due, and when the payoff is.
//
// Pure, for scripts/test-couch-hidden.mjs; src/lib/couch/hidden-effects.ts
// keeps the records.

export type HiddenEffectStatus = "active" | "cured" | "paid";

export type HiddenEffect = {
  id: string;
  characterId: string;
  // What the room may one day call it ("Parasite"), shown on the TV when it
  // is revealed.
  name: string;
  // What it really is and how it ends: the GM's alone.
  truth: string;
  // Two to four symptoms, the last the payoff ("it bursts from the chest").
  stages: string[];
  // The stage showing now, from 0.
  stage: number;
  // How many of the GM's replies a stage holds before the next is due.
  everyReplies: number;
  revealed: boolean;
  status: HiddenEffectStatus;
};

export const HIDDEN_NAME_MAX = 60;
export const HIDDEN_TRUTH_MAX = 300;
export const HIDDEN_STAGE_MAX = 160;
export const HIDDEN_STAGES_MIN = 2;
export const HIDDEN_STAGES_MAX = 4;
// One incubation per act on a two-and-a-half-hour night: about six replies
// a stage brings a three-stage effect home in the act after it began.
export const HIDDEN_EVERY_DEFAULT = 6;
export const HIDDEN_EVERY_MIN = 2;
export const HIDDEN_EVERY_MAX = 20;
// More than this at once and none of them land.
export const HIDDEN_ACTIVE_MAX = 3;

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

export function cleanStages(stages: readonly string[]): string[] {
  return stages.map((stage) => clip(stage, HIDDEN_STAGE_MAX)).filter(Boolean).slice(0, HIDDEN_STAGES_MAX);
}

export const isPayoffStage = (effect: Pick<HiddenEffect, "stage" | "stages">): boolean => effect.stage >= effect.stages.length - 1;

// Whether the stage has held long enough: the next symptom, or on the last
// stage the payoff, is due.
export const hiddenDue = (effect: Pick<HiddenEffect, "everyReplies">, replies: number): boolean => replies >= effect.everyReplies;

// The GM's block, one line per active effect, in the secret part of the
// prompt beside the crew's agendas. `replies` is each effect's replies at
// its stage; `names` reads a characterId as the crew member's name.
export function hiddenEffectsBlock(
  effects: readonly HiddenEffect[],
  replies: ReadonlyMap<string, number>,
  names: ReadonlyMap<string, string>,
): string {
  const lines = effects
    .filter((effect) => effect.status === "active" && names.has(effect.characterId))
    .map((effect) => {
      const held = replies.get(effect.id) ?? 0;
      const last = isPayoffStage(effect);
      const due = hiddenDue(effect, held);
      const now = effect.stages[effect.stage] ?? "";
      const next = last ? "" : effect.stages[effect.stage + 1] ?? "";
      const call = last
        ? due
          ? "PAYOFF DUE: pay it off at the worst moment, this reply or the next (hidden_effect payoff)."
          : "At the payoff: hold it for the worst moment."
        : due
          ? `NEXT SYMPTOM DUE: show "${next}", then hidden_effect advance.`
          : `Next: "${next}".`;
      return [
        `- ${effect.name} in ${names.get(effect.characterId)} (effectId=${effect.id}${effect.revealed ? ", revealed" : ", nobody knows"}): ${effect.truth}`,
        `stage ${effect.stage + 1} of ${effect.stages.length}, ${held} ${held === 1 ? "reply" : "replies"} in: "${now}". ${call}`,
      ].join(" | ");
    });
  return lines.length
    ? `HIDDEN EFFECTS (secret: show them only as symptoms, never name one aloud before it is revealed):\n${lines.join("\n")}`
    : "";
}

// The TV's card when an effect comes out.
export function revealCard(effect: Pick<HiddenEffect, "name">, crewName: string): { title: string; subtitle: string } {
  return { title: effect.name, subtitle: crewName };
}
