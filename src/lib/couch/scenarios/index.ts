import { readForge, type Forge } from "@/lib/couch/forge-logic";
import { scenarioCard, scenarioSeats } from "@/lib/couch/scenario-cards";
import { ALL_SOULS_STATION } from "@/lib/couch/scenarios/all-souls-station";
import { GOOD_SHEPHERD } from "@/lib/couch/scenarios/good-shepherd";
import { HOLLOW_NIGHT } from "@/lib/couch/scenarios/hollow-night";
import { KESSLERS_MOON } from "@/lib/couch/scenarios/kesslers-moon";
import { MIDWINTER_RIME } from "@/lib/couch/scenarios/midwinter-rime";
import { SIXTY_FATHOMS } from "@/lib/couch/scenarios/sixty-fathoms";
import type { WrittenScenario } from "@/lib/couch/scenarios/types";
import { UNTO_US } from "@/lib/couch/scenarios/unto-us";
import { DEAD_AIR } from "@/lib/couch/scenarios/dead-air";
import { HADDON_OUTPOST_SCENARIO } from "@/lib/couch/scenarios/haddon-outpost";

// The ready-made nights (src/lib/couch/scenario-cards.ts has their public
// faces). Server-only: each one holds its truth, its threat and every
// agenda, so nothing in a client component imports this module.

export const WRITTEN_SCENARIOS: readonly WrittenScenario[] = [
  KESSLERS_MOON,
  GOOD_SHEPHERD,
  SIXTY_FATHOMS,
  HOLLOW_NIGHT,
  ALL_SOULS_STATION,
  MIDWINTER_RIME,
  UNTO_US,
  DEAD_AIR,
  HADDON_OUTPOST_SCENARIO,
];

export function writtenScenario(id: string): WrittenScenario | undefined {
  return WRITTEN_SCENARIOS.find((scenario) => scenario.id === id);
}

// A written scenario as tonight's forge, for this many players: read by the
// same reader as the model's reply, so it is seated, cut and mended exactly
// as a written-tonight story would be, and the rest of the night cannot
// tell the two apart.
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
