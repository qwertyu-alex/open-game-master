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
import { matchArmor } from "@/lib/srd/armor";
import { describeFeature } from "@/lib/help";
import { textKey } from "@/lib/language/text-logic";
import { itemArtKey, itemTitle, paintedItemIcon } from "@/lib/couch/item-art-logic";
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
// A carried thing as the Gear section shows it: a tile's short title, the
// whole line when the title cuts it, and its painted icon when the icon set
// has one (otherwise the night paints it, src/lib/couch/item-art.ts).
export type CouchItem = {
  key: string;
  name: string;
  title: string;
  full: string;
  rest: string;
  qty: number;
  icon: string | null;
};
export type CouchWeapon = CouchItem & { toHit: number; damage: string; type: string };
export type CouchFeature = { name: string; text: string };

export type CouchCharacter = {
  abilities: CouchAbility[];
  // Best first: the order a player scans for "what am I good at".
  checks: CouchCheck[];
  // The one personal thing the forge gave this character, out of the pack.
  signature: CouchItem | null;
  weapons: CouchWeapon[];
  // Armour and shields: what is worn rather than carried.
  worn: CouchItem[];
  // Everything else carried.
  gear: CouchItem[];
  features: CouchFeature[];
  initiative: number;
  passivePerception: number;
};

type SheetInput = Pick<
  CharacterSheet,
  "abilities" | "level" | "proficiencies" | "spellcasting" | "class" | "subclass" | "features" | "feats" | "equipment" | "wildShape" | "campaignId"
> &
  Partial<Pick<CharacterSheet, "notes">>;

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
  // The signature item is the row the forge's notes name
  // (src/lib/couch/forge-logic.ts crewSheetFields); it leaves the pack to
  // stand on its own.
  const signatureName = /^Signature item:\s*(.+)$/m.exec(sheet.notes ?? "")?.[1]?.trim() ?? "";
  const signatureRow = signatureName ? sheet.equipment.findIndex((item) => textKey(item.name) === textKey(signatureName)) : -1;
  const weapons: CouchWeapon[] = [];
  const worn: CouchItem[] = [];
  const gear: CouchItem[] = [];
  sheet.equipment.forEach((item, index) => {
    if (index === signatureRow || !item.name.trim()) return;
    const srd = weaponOf(item) ?? matchWeapon(item);
    if (srd) {
      const profile = weaponAttackProfile(derived, sheet.proficiencies.weapons, { displayName: item.name, srd, unarmed: false });
      if (weapons.some((weapon) => weapon.name === profile.weapon)) return;
      weapons.push({
        ...couchItem(item.name, item.qty, item.srdName ?? srd.name),
        name: profile.weapon,
        toHit: profile.toHit,
        damage: profile.damageExpression,
        type: profile.damageType,
      });
      return;
    }
    (matchArmor(item) ? worn : gear).push(couchItem(item.name, item.qty, item.srdName));
  });
  const signatureItem = signatureRow >= 0 ? sheet.equipment[signatureRow] : null;
  const signature = signatureItem ? couchItem(signatureItem.name, signatureItem.qty) : null;

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
    signature,
    weapons,
    worn,
    gear,
    features,
    initiative: derived.initiative,
    passivePerception: derived.passivePerception,
  };
}

function couchItem(name: string, qty: number | undefined, srdName?: string): CouchItem {
  const trimmed = name.trim();
  return { key: itemArtKey(trimmed), name: trimmed, ...itemTitle(trimmed), qty: qty ?? 1, icon: paintedItemIcon(trimmed, srdName) };
}

// Every item's key, for the pictures the night paints and for what is new.
export function itemKeys(view: Pick<CouchCharacter, "signature" | "weapons" | "worn" | "gear">): string[] {
  const items = [view.signature, ...view.weapons, ...view.worn, ...view.gear].filter((item): item is CouchItem => Boolean(item));
  return [...new Set(items.map((item) => item.key))];
}

// The Character view's three sections, each for a moment in the night:
// Gear while playing (it changes as things are found and spent), Skills
// when weighing what to try, About when reading who you are.
export type CharacterSection = "gear" | "skills" | "about";

// The section a visit to the Character tab opens on. Something new there
// comes first: an act's new agenda opens About, a thing just picked up
// opens Gear. With neither, a player who has not yet made a move is still
// learning who they are (About); after that the section left last stays.
export function sectionOnEntry(
  current: CharacterSection | null,
  { agendaFresh, newGear, acted }: { agendaFresh: boolean; newGear: boolean; acted: boolean },
): CharacterSection {
  if (agendaFresh) return "about";
  if (newGear) return "gear";
  return current ?? (acted ? "gear" : "about");
}

// The keys picked up since the player last looked: none on the first look,
// which takes the starting kit as seen.
export function newGearKeys(seen: readonly string[] | null, current: readonly string[]): string[] {
  if (!seen) return [];
  const known = new Set(seen);
  return current.filter((key) => !known.has(key));
}

function rank(check: CouchCheck): number {
  return check.training === "expert" ? 2 : check.training === "trained" ? 1 : 0;
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

// The About section's parts, read from what the forge wrote
// (src/lib/couch/forge-logic.ts crewSheetFields): the public backstory as
// paragraphs, its "Ties:" line as one tie per crewmate (each shown with
// that crewmate's face), and the personality line from the owner's notes.
export type CouchTie = { to: string; line: string };
export function aboutParts(backstory: string, notes: string): { story: string[]; ties: CouchTie[]; personality: string } {
  const paragraphs = backstory
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const tiesAt = paragraphs.findIndex((paragraph) => /^Ties:\s/.test(paragraph));
  const ties =
    tiesAt < 0
      ? []
      : paragraphs[tiesAt]
          .replace(/^Ties:\s*/, "")
          .replace(/\.\s*$/, "")
          .split(/;\s*/)
          .map((entry) => /^([^,]+),\s*(.+)$/.exec(entry.trim()))
          .filter((match): match is RegExpExecArray => Boolean(match))
          .map((match) => ({ to: match[1].trim(), line: match[2].trim().replace(/^\p{Ll}/u, (letter) => letter.toUpperCase()) }));
  const story = ties.length ? paragraphs.filter((_, index) => index !== tiesAt) : paragraphs;
  const personality = /^Personality:\s*(.+)$/m.exec(notes)?.[1]?.trim() ?? "";
  return { story, ties, personality };
}
