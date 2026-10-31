"use client";

import Link from "next/link";
import { ScenarioTile } from "@/components/couch/ScenarioTile";
import { SCENARIO_CARDS } from "@/lib/couch/scenario-cards";

// The ready-made nights (src/lib/couch/scenario-cards.ts), below the fold,
// drawn as the same posters as the couch-night screen's story picker: each
// story's spoiler-free face, so a room can pick one before anyone has read
// a word of it. A poster opens the couch-night screen with the story
// already picked; on a server or account that cannot start a night the
// posters are there to read, with no door.
export function ReadyNights({ canStart }: { canStart: boolean }) {
  return (
    <section className="ts-ready" aria-labelledby="ts-ready-heading">
      <div>
        <h2 id="ts-ready-heading" className="ts-below-eyebrow">
          Ready-made nights
        </h2>
        <p className="ts-below-lede">Already written, crew and all, so the night starts at once. No spoilers here.</p>
      </div>
      <ul className="ts-ready-row">
        {SCENARIO_CARDS.map((card) => (
          <li key={card.id}>
            {canStart ? (
              <Link
                href={`/couch?scenario=${card.id}`}
                aria-label={`Play ${card.title}`}
                className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
              >
                <ScenarioTile card={card} />
              </Link>
            ) : (
              <ScenarioTile card={card} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
