import type { EquipmentItem } from "@/lib/schemas/sheet";
import { matchArmor } from "@/lib/srd/armor";
import { matchWeapon } from "@/lib/srd/weapons";
import { ammoKindForItem, ammoKindForWeapon } from "@/lib/srd/ammunition";

// What a couch crew member carries when the night starts
// (docs/couch-mode-spec.md 2.1): the class's whole 5e kit made a phone's
// pack eighteen rows long (pitons, a hammer, ten torches, ten days of
// rations, 2026-10-31), and nothing was left to find. A crew starts light
// and finds the rest (COUCH_RULES, "finds"): their armour, one weapon to
// hit with, one to shoot or throw with and a little ammunition for it.
// The signature item goes on after (src/lib/couch/forge-logic.ts
// withSignatureItem). Everyday kit for their job (a torch, tools, a basic
// medkit) is assumed and never listed. Pure, for
// scripts/test-couch-forge.mjs.

// Scarce, as the night is: what a ranged weapon starts loaded with.
export const STARTING_AMMO = 10;
const STARTING_THROWN = 2;

export function couchStartingKit(equipment: readonly EquipmentItem[]): EquipmentItem[] {
  const armor = equipment.find((item) => {
    const suit = matchArmor(item);
    return suit && suit.category !== "shield";
  });
  const weapons = equipment.map((item) => ({ item, weapon: matchWeapon(item) })).filter((entry) => entry.weapon);
  const melee = weapons.find((entry) => entry.weapon!.kind === "melee" && !entry.weapon!.properties?.includes("thrown")) ?? weapons.find((entry) => entry.weapon!.kind === "melee");
  const ranged =
    weapons.find((entry) => entry.weapon!.kind === "ranged") ??
    weapons.find((entry) => entry !== melee && entry.weapon!.properties?.includes("thrown"));
  const ammoKind = ranged ? ammoKindForWeapon(ranged.weapon!.name) : null;
  const ammo = ammoKind ? equipment.find((item) => ammoKindForItem(item) === ammoKind) : undefined;
  const kept: EquipmentItem[] = [];
  if (armor) kept.push(armor);
  if (melee) kept.push({ ...melee.item, qty: 1 });
  if (ranged) kept.push({ ...ranged.item, qty: ranged.weapon!.kind === "ranged" ? 1 : Math.min(ranged.item.qty, STARTING_THROWN) });
  if (ammo) kept.push({ ...ammo, qty: Math.min(ammo.qty, STARTING_AMMO) });
  return kept;
}
