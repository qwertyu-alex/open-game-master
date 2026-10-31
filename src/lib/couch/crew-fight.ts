import type { Campaign } from "@/lib/db/campaigns";
import { getCampaignById } from "@/lib/db/campaigns";
import { getActiveEncounter } from "@/lib/db/encounters";
import { getBattleMapForEncounter, getTokenByRef, listTokens, moveToken } from "@/lib/db/battle-maps";
import { findSpawnTiles } from "@/lib/battlemap/tactics";
import { occupiedTiles } from "@/lib/battlemap/view";
import { listSheets } from "@/lib/db/sheets";
import { moveToSide } from "@/lib/dm/combat-sides";
import { resolveCombatant, sideOf } from "@/lib/dm/combatant";
import { sheetStatBlock } from "@/lib/dm/companion-statblock";
import type { SheetFoeEntry } from "@/lib/dm/sheet-foes";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { crewNameKeys, crossingSide } from "@/lib/couch/crew-fight-logic";

// Crew against crew on a couch night (docs/couch-mode-spec.md 2.11): the
// engine's side of it. Two ways a crew member ends up fighting the others:
//
//   - the GM starts a fight naming them as the enemy (start_encounter, or
//     add_enemies mid-fight): the roster resolves the name to their own
//     sheet (sheet-foes.ts sheetFoesByName), which fights on the foes' side;
//   - they attack a crewmate on their own turn in a fight: before the attack
//     is planned they cross to the side opposite that crewmate
//     (encounter-tools.ts, pc_attack), which pc_attack otherwise refuses as
//     "does not strike an ally".
//
// Either way the sheet is the same sheet and their player keeps playing it
// from their phone (combat-sides.ts: a player's own character keeps its
// player wherever it fights). The side lasts for that fight only.

function isCrew(sheet: Pick<CharacterSheet, "isCompanion" | "summon">): boolean {
  return !sheet.isCompanion && !sheet.summon;
}

// The crew a fight's roster may name as its enemy, by name key: the whole
// name, or the first name alone when it is nobody else's. Only on a couch
// night; the dead are past fighting.
export function crewFoesByName(campaignId: string): Map<string, SheetFoeEntry> {
  const found = new Map<string, SheetFoeEntry>();
  if (!getCampaignById(campaignId)?.gameSettings.couchMode) return found;
  const crew = listSheets(campaignId).filter((sheet) => isCrew(sheet) && !sheet.deathSaves?.dead);
  const byId = new Map(crew.map((sheet) => [sheet.id, sheet]));
  for (const [key, id] of crewNameKeys(crew)) {
    const sheet = byId.get(id);
    if (!sheet) continue;
    // Budgeted on nothing: a turned character is never held to the fight's
    // ceiling (party-budget.ts rosterBudget).
    const { stats } = sheetStatBlock(sheet, { open: true, asItStands: true });
    found.set(key, { foe: { kind: "turned", sheetId: sheet.id, name: sheet.name }, name: sheet.name, stats, currentHp: sheet.currentHp });
  }
  return found;
}

// A crew member's pc_attack at a crewmate on their own side, on their own
// turn in a couch fight: they cross to the other side first, so the attack
// lands rather than being refused. Returns the line for the GM, or null when
// nothing crossed (no fight, not crew, already opposed, not their turn: a
// refused attack must not have turned anyone).
export function crossOverForAttack(campaign: Campaign, rawArguments: string): string | null {
  if (!campaign.gameSettings.couchMode) return null;
  const encounter = getActiveEncounter(campaign.id);
  if (!encounter?.orderReady) return null;
  let args: { characterId?: unknown; targetEnemyId?: unknown };
  try {
    args = JSON.parse(rawArguments || "{}") as typeof args;
  } catch {
    return null;
  }
  if (typeof args.characterId !== "string" || typeof args.targetEnemyId !== "string") return null;
  const attacker = resolveCombatant(campaign.id, encounter, args.characterId);
  const target = resolveCombatant(campaign.id, encounter, args.targetEnemyId);
  if (attacker?.kind !== "sheet" || target?.kind !== "sheet" || attacker.id === target.id) return null;
  if (!isCrew(attacker.sheet) || !isCrew(target.sheet)) return null;
  const current = encounter.order[encounter.turnIndex];
  if (current?.kind !== "pc" || current.characterId !== attacker.id) return null;
  const side = crossingSide(attacker.side, target.side);
  if (!side) return null;
  const moved = moveToSide(campaign, attacker.id, side, { reason: `${attacker.name} attacks ${target.name}.` });
  if ("error" in moved) return null;
  return `${attacker.name} turned on ${target.name} and fights on the other side for the rest of this fight, still played by their own player. The fight ends when either side is down.`;
}

// A crew member fielded on the foes' side as a fight starts stands beside
// the crew they turned on: the fight broke out among them. The engine puts
// a character joining the foes' side near the other foes and away from the
// party, which with no creature in the fight left them across the map ("Bex
// is 75 feet away", in a two-seat cockpit), out of reach of every swing.
export function standWithCrew(campaign: Campaign, sheetId: string): void {
  if (!campaign.gameSettings.couchMode) return;
  const encounter = getActiveEncounter(campaign.id);
  const map = encounter ? getBattleMapForEncounter(encounter.id) : null;
  const own = map ? getTokenByRef(map.id, sheetId) : null;
  if (!encounter || !map || !own) return;
  const tokens = listTokens(map.id);
  const crew = tokens.filter((token) => token.kind === "pc" && token.refId !== sheetId && sideOf(encounter, "sheet", token.refId) === "party");
  if (!crew.length) return;
  const others = tokens.filter((token) => token.id !== own.id);
  const [spot] = findSpawnTiles(map.terrain, map.width, map.height, occupiedTiles(map, others, null), 1, crew.map((token) => ({ x: token.x, y: token.y })), []);
  if (spot) moveToken(own.id, spot.x, spot.y, 0);
}
