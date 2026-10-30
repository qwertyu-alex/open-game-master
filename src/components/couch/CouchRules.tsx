"use client";

import { Dices } from "lucide-react";
import type { StoredRoll } from "@/lib/db/rolls";
import { COUCH_PLAY_RULES } from "@/lib/couch/rules-logic";
import { couchRollFeedback } from "@/lib/couch/roll-feedback-logic";
import { ROLL_KIND_LABELS } from "@/lib/roll-labels";
import { rollWhat } from "@/components/couch/phone-logic";

// The phone's rules and dice: the rules the TV reads out at the start, for
// the ? in the phone's bar, and one roll as a line in the story.

export function CouchRules() {
  return (
    <section className="couch-rules" aria-label="How to play">
      {COUCH_PLAY_RULES.map((rule) => (
        <div key={rule.title} className="grid gap-1">
          <h3 className="font-semibold">{rule.title}</h3>
          <p>{rule.text}</p>
        </div>
      ))}
    </section>
  );
}

// One roll, small: who rolled for what, the arithmetic and the verdict. The
// TV plays the dice; this is the record for whoever missed it, standing in
// the passage where the GM rolled it. Hidden rolls stay hidden
// (couchRollFeedback answers only public ones).
export function CouchRollChip({ roll, who }: { roll: StoredRoll; who: string | undefined }) {
  const feedback = couchRollFeedback(roll, who);
  if (!feedback) return null;
  const what = rollWhat(roll.detail, ROLL_KIND_LABELS[roll.kind] ?? "Roll");
  return (
    <div className="couch-roll-chip" role="group" aria-label="Dice roll">
      <Dices className="couch-roll-chip-icon size-5" aria-hidden="true" />
      <span className="couch-roll-chip-body">
        <span className="couch-roll-chip-what">{who ? `${who} · ${what}` : what}</span>
        <span className="couch-roll-chip-math">
          {feedback.math}
          {feedback.target !== null ? ` · needs ${feedback.target}` : ""}
        </span>
      </span>
      <strong className="couch-roll-chip-verdict" data-good={feedback.good ? "" : undefined} data-bad={feedback.bad ? "" : undefined}>
        {feedback.verdict}
      </strong>
    </div>
  );
}
