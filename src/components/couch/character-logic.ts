// The couch phone's Character view (docs/couch-mode-spec.md 2.7), the pure
// half: what a player needs in hand to decide what to try. The TV shows
// what the room shares (names, health, the picture, the route); the phone
// shows what is yours: how good you are at each check, what you carry and
// swing, and what your features do. Every number comes from the helpers
// the table's own sheet uses (computeSheetDerived, weaponAttackProfile), so
// the phone says what the GM will roll. scripts/test-couch-phone.mjs.
import { computeSheetDerived, SRD_SKILLS } from "@/lib/srd";
import { weaponAttackProfile, weaponOf } from "@/lib/dm/attack-logic";
import { matchWeapon } from "@/lib/srd/weapons";
import { describeFeature } from "@/lib/help";
import type { Ability, CharacterSheet } from "@/lib/schemas/sheet";

const ABILITY_ORDER: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export const ABILITY_WORDS: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export type CouchAbility = { key: Ability; name: string; score: number; mod: number; save: number; saveTrained: boolean };
export type CouchCheck = { id: string; name: string; ability: Ability; bonus: number; training: "expert" | "trained" | null };
export type CouchWeapon = { name: string; toHit: number; damage: string; type: string };
export type CouchFeature = { name: string; text: string };

export type CouchCharacter = {
  abilities: CouchAbility[];
  // Best first: the order a player scans for "what am I good at".
  checks: CouchCheck[];
  weapons: CouchWeapon[];
  // What is carried that is not a weapon above.
  gear: Array<{ name: string; qty: number }>;
  features: CouchFeature[];
  initiative: number;
  passivePerception: number;
};

type SheetInput = Pick<
  CharacterSheet,
  "abilities" | "level" | "proficiencies" | "spellcasting" | "class" | "subclass" | "features" | "feats" | "equipment" | "wildShape" | "campaignId"
>;

export function couchCharacter(sheet: SheetInput): CouchCharacter {
  const derived = computeSheetDerived(sheet);
  const trained = new Set(sheet.proficiencies.skills);
  const expert = new Set(sheet.proficiencies.expertise ?? []);
  const abilities = ABILITY_ORDER.map((key) => ({
    key,
    name: ABILITY_WORDS[key],
    score: sheet.abilities[key],
    mod: derived.abilityMods[key],
    save: derived.saves[key],
    saveTrained: sheet.proficiencies.saves.includes(key),
  }));
  const checks: CouchCheck[] = SRD_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    ability: skill.ability,
    bonus: derived.skills[skill.id] ?? derived.abilityMods[skill.ability],
    training: expert.has(skill.id) ? ("expert" as const) : trained.has(skill.id) ? ("trained" as const) : null,
    // A stable sort: equal checks keep the SRD's own (alphabetical) order.
  })).sort((a, b) => b.bonus - a.bonus || rank(b) - rank(a));

  // As the printed sheet lists them (character-sheet-pdf.ts weaponAttacks):
  // a row the SRD knows as a weapon, by its slug or its name.
  const weapons: CouchWeapon[] = [];
  const weaponRows = new Set<number>();
  sheet.equipment.forEach((item, index) => {
    const srd = weaponOf(item) ?? matchWeapon(item);
    if (!srd) return;
    weaponRows.add(index);
    const profile = weaponAttackProfile(derived, sheet.proficiencies.weapons, { displayName: item.name, srd, unarmed: false });
    if (weapons.some((weapon) => weapon.name === profile.weapon)) return;
    weapons.push({ name: profile.weapon, toHit: profile.toHit, damage: profile.damageExpression, type: profile.damageType });
  });
  const gear = sheet.equipment
    .filter((item, index) => !weaponRows.has(index) && item.name.trim())
    .map((item) => ({ name: item.name.trim(), qty: item.qty ?? 1 }));

  const features = sheet.features
    .filter((feature) => feature.name.trim())
    .map((feature) => ({
      name: feature.name.trim(),
      // Some rule lines are written to follow the name ("extra d6s once per
      // turn…"); standing alone under it, they start a sentence.
      text: (describeFeature(feature.classId ?? sheet.class, sheet.subclass ?? "", feature.name) ?? "").replace(/^\p{Ll}/u, (letter) => letter.toUpperCase()),
    }));

  return {
    abilities,
    checks,
    weapons,
    gear,
    features,
    initiative: derived.initiative,
    passivePerception: derived.passivePerception,
  };
}

function rank(check: CouchCheck): number {
  return check.training === "expert" ? 2 : check.training === "trained" ? 1 : 0;
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}
