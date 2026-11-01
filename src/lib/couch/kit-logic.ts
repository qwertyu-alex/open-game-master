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
//
// The rows are the class's 5e kit, so they came out as Scale Mail, a
// Longbow and Arrows on a salvage tug in 2186 (Dead Air, 2026-10-31). Each
// kept row is renamed to what a working crew in a couch night's future
// would carry, and keeps the 5e row it is in srdName: the attack, armour and
// ammunition engines read that (src/lib/srd/item-row.ts rowName), so the
// numbers and the class's proficiency stay exactly as they were.

// Scarce, as the night is: what a ranged weapon starts loaded with.
export const STARTING_AMMO = 10;
const STARTING_THROWN = 2;

// Every couch night is a sci-fi horror one-shot (docs/couch-mode-spec.md),
// so one table serves them all: plain working kit of the 22nd century, by
// the 5e row it stands for, close to that row's size and how it is held.
// A row missing here keeps its own name.
const ARMOR_NAMES: Record<string, string> = {
  Padded: "Padded work coveralls",
  Leather: "Reinforced work jacket",
  "Studded Leather": "Armoured flight jacket",
  Hide: "Insulated thermal suit",
  "Chain Shirt": "Ballistic vest",
  "Scale Mail": "Hardshell vac suit",
  Breastplate: "Composite chest plate",
  "Half Plate": "Armoured hardsuit",
  "Ring Mail": "Padded flak suit",
  "Chain Mail": "Security flak armour",
  Splint: "Riot armour",
  Plate: "Heavy combat hardsuit",
};

const WEAPON_NAMES: Record<string, string> = {
  Club: "Length of steel pipe",
  Dagger: "Utility knife",
  Greatclub: "Heavy pipe wrench",
  Handaxe: "Hatchet",
  Javelin: "Rivet spike",
  "Light Hammer": "Ball-peen hammer",
  Mace: "Pipe wrench",
  Quarterstaff: "Steel pry bar",
  Sickle: "Hook knife",
  Spear: "Harpoon",
  Battleaxe: "Fire axe",
  Flail: "Weighted tow chain",
  Glaive: "Pole cutter",
  Greataxe: "Demolition axe",
  Greatsword: "Plasma cutter",
  Halberd: "Breaching pole",
  Lance: "Shock lance",
  Longsword: "Heavy machete",
  Maul: "Sledgehammer",
  Morningstar: "Spiked mallet",
  Pike: "Boarding pike",
  Rapier: "Combat knife",
  Scimitar: "Cane knife",
  Shortsword: "Machete",
  Trident: "Gaff hook",
  "War Pick": "Rock pick",
  Warhammer: "Rivet hammer",
  Whip: "Shock cable",
  "Light Crossbow": "Bolt gun",
  "Heavy Crossbow": "Heavy bolt gun",
  "Hand Crossbow": "Nail pistol",
  Shortbow: "Service pistol",
  Longbow: "Carbine",
  Sling: "Flare pistol",
  Dart: "Throwing spike",
  Blowgun: "Dart pistol",
  Net: "Snare net",
  Musket: "Pump shotgun",
};

// What each ranged weapon above is loaded with: its ammunition row's new
// name, by the weapon's 5e row.
const AMMO_NAMES: Record<string, string> = {
  "Light Crossbow": "Bolt cartridges",
  "Heavy Crossbow": "Heavy bolt cartridges",
  "Hand Crossbow": "Nails",
  Shortbow: "Pistol rounds",
  Longbow: "Carbine rounds",
  Sling: "Flares",
  Blowgun: "Darts",
  Musket: "Shotgun shells",
};

// A kept row under its new name, the 5e row it was kept as srdName. A row
// already named otherwise (a pregen's own) keeps its srdName.
function renamed(item: EquipmentItem, srd: string, name: string | undefined): EquipmentItem {
  return name ? { ...item, name, srdName: item.srdName ?? srd } : item;
}

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
  if (armor) {
    const suit = matchArmor(armor)!.name;
    kept.push(renamed(armor, suit, ARMOR_NAMES[suit]));
  }
  if (melee) kept.push(renamed({ ...melee.item, qty: 1 }, melee.weapon!.name, WEAPON_NAMES[melee.weapon!.name]));
  if (ranged) {
    const qty = ranged.weapon!.kind === "ranged" ? 1 : Math.min(ranged.item.qty, STARTING_THROWN);
    kept.push(renamed({ ...ranged.item, qty }, ranged.weapon!.name, WEAPON_NAMES[ranged.weapon!.name]));
  }
  if (ammo) kept.push(renamed({ ...ammo, qty: Math.min(ammo.qty, STARTING_AMMO) }, ammo.srdName ?? ammo.name, AMMO_NAMES[ranged!.weapon!.name]));
  return kept;
}
