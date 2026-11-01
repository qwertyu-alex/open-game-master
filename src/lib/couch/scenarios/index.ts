import { readForge, type Forge } from "@/lib/couch/forge-logic";
import { scenarioCard, scenarioSeats } from "@/lib/couch/scenario-cards";
import type { WrittenScenario } from "@/lib/couch/scenarios/types";
import { DEAD_AIR } from "@/lib/couch/scenarios/dead-air";
import { HADDON_OUTPOST_SCENARIO } from "@/lib/couch/scenarios/haddon-outpost";
import { CREW_EXPENDABLE } from "@/lib/couch/scenarios/crew-expendable";

// The ready-made nights (src/lib/couch/scenario-cards.ts has their public
// faces), each played on its written site (src/lib/couch/sites).
// Server-only: each one holds its truth, its threat and every agenda, so
// nothing in a client component imports this module.

export const WRITTEN_SCENARIOS: readonly WrittenScenario[] = [DEAD_AIR, HADDON_OUTPOST_SCENARIO, CREW_EXPENDABLE];

export function writtenScenario(id: string): WrittenScenario | undefined {
  return WRITTEN_SCENARIOS.find((scenario) => scenario.id === id);
}

// A written scenario as tonight's forge, for this many players: read by the
// forge's reader (src/lib/couch/forge-logic.ts readForge), which seats,
// cuts and mends it.
export function writtenForge(id: string, players: number): { forge: Forge } | { error: string } {
  const scenario = writtenScenario(id);
  const card = scenarioCard(id);
  if (!scenario || !card) {
    return { error: "That ready-made story is not on this server any more. Start a new night." };
  }
  if (!scenarioSeats(card, players)) {
    return { error: `"${card.title}" is written for ${card.players.min} to ${card.players.max} players, not ${players}.` };
  }
  const read = readForge(JSON.stringify(scenario.reply), players);
  return read.ok ? { forge: read.forge } : { error: `"${card.title}" could not be read (${read.error}).` };
}
