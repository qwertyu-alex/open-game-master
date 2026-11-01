import type { Campaign } from "@/lib/db/campaigns";
import { getActiveEncounter } from "@/lib/db/encounters";
import { listSheets } from "@/lib/db/sheets";
import { rollDeathSave } from "@/lib/dm/death";
import type { CharacterSheet } from "@/lib/schemas/sheet";

// A dying crew member outside a fight (docs/couch-mode-spec.md 2.12). The
// engine rolls death saves only on combat turns (src/lib/dm/encounter-
// tools.ts), so a crew member a venting airlock or a parasite's payoff
// dropped to 0 HP would lie dying forever, and the environment could never
// finish what its damage started. On a couch night each GM turn outside a
// fight is their turn: one save each, before the GM reads the table, so the
// crew has a few replies to stabilise or heal them.

export function dyingCrewIds(sheets: readonly Pick<CharacterSheet, "id" | "isCompanion" | "summon" | "currentHp" | "deathSaves">[]): string[] {
  return sheets
    .filter((sheet) => !sheet.isCompanion && !sheet.summon && sheet.currentHp <= 0 && sheet.deathSaves && !sheet.deathSaves.stable && !sheet.deathSaves.dead)
    .map((sheet) => sheet.id);
}

export function rollCouchDeathSaves(campaign: Campaign): number {
  if (!campaign.gameSettings.couchMode || getActiveEncounter(campaign.id)) return 0;
  const dying = dyingCrewIds(listSheets(campaign.id));
  for (const id of dying) rollDeathSave(campaign, id);
  return dying.length;
}
