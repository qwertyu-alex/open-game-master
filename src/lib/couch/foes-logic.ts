import type { BestiaryEntry } from "@/lib/bestiary";
import { thresholdsForParty, xpForCr } from "@/lib/srd/encounter-math";

// The couch night's enemy menu (docs/couch-mode-spec.md 2.11): SRD stat
// blocks under sci-fi horror names, offered to the GM in place of the
// genre catalog a custom setting falls back to (high fantasy: drow and
// gnolls aboard an ore hauler, 2026-10-31). Every slug is one the genre
// catalogs in src/lib/bestiary already ship and scripts/test-bestiary.mjs
// checks against the content pack. People, machines and the threat's
// young or victims: the night's own threat at full strength is fled,
// sealed or burned, never fought (src/lib/couch/forge-logic.ts). Pure, for
// scripts/test-couch-agenda.mjs.

export const COUCH_FOES: readonly BestiaryEntry[] = [
  { slug: "guard", name: "Company Security", cr: 0.125, type: "humanoid", blurb: "stun baton, flak vest, follows orders" },
  { slug: "bandit", name: "Salvage Pirate", cr: 0.125, type: "humanoid", blurb: "patched vacsuit, nail gun, wants the cargo" },
  { slug: "cultist", name: "Turned Survivor", cr: 0.125, type: "humanoid", blurb: "believes the thing aboard is a gift" },
  { slug: "stirge", name: "Blood Nymph", cr: 0.125, type: "beast", blurb: "the threat's newborn young, drinks and swells" },
  { slug: "flying-sword", name: "Security Drone", cr: 0.25, type: "construct", blurb: "hovering ceiling unit with a cutting arm" },
  { slug: "zombie", name: "Host Body", cr: 0.25, type: "undead", blurb: "a dead crewman the thing still walks around" },
  { slug: "giant-centipede", name: "Vent Crawler", cr: 0.25, type: "beast", blurb: "venomous, quick, lives in the ducts" },
  { slug: "skeleton", name: "Stripped Synthetic", cr: 0.25, type: "undead", blurb: "skinless android still running its orders" },
  { slug: "thug", name: "Company Enforcer", cr: 0.5, type: "humanoid", blurb: "armoured leg-breaker with a shock maul" },
  { slug: "hobgoblin", name: "Corporate Trooper", cr: 0.5, type: "humanoid", blurb: "disciplined boarding-party soldier" },
  { slug: "scout", name: "Merc Marksman", cr: 0.5, type: "humanoid", blurb: "scoped carbine from the catwalks" },
  { slug: "darkmantle", name: "Ceiling Lurker", cr: 0.5, type: "monstrosity", blurb: "drops from the dark and smothers the light" },
  { slug: "gray-ooze", name: "Bio-Sludge", cr: 0.5, type: "ooze", blurb: "corrosive growth spreading from a breach" },
  { slug: "ghoul", name: "Feral Host", cr: 1, type: "undead", blurb: "infected crew, paralysing bite" },
  { slug: "giant-spider", name: "Hull Stalker", cr: 1, type: "beast", blurb: "webs the corridors, drags prey away" },
  { slug: "animated-armor", name: "Rogue Loader Rig", cr: 1, type: "construct", blurb: "empty work exo-frame on a corrupted routine" },
  { slug: "death-dog", name: "Lab Hound", cr: 1, type: "monstrosity", blurb: "two-headed experiment, infectious bite" },
  { slug: "spy", name: "Company Fixer", cr: 1, type: "humanoid", blurb: "smiling agent with a hidden pistol" },
  { slug: "bandit-captain", name: "Pirate Captain", cr: 2, type: "humanoid", blurb: "runs the boarding party from the front" },
  { slug: "ochre-jelly", name: "Spreading Mass", cr: 2, type: "ooze", blurb: "cutting it only makes more" },
  { slug: "ghast", name: "Brood Keeper", cr: 2, type: "undead", blurb: "a host gone far wrong, guards the young" },
  { slug: "veteran", name: "Merc Sergeant", cr: 3, type: "humanoid", blurb: "the one professional on the boarding team" },
];

// What the GM is offered for this crew: every entry a single foe could
// carry at the crew's deadly budget, so a menu for three level-1 crew never
// lists a sergeant who would end the night on one swing.
export function couchFoePicks(partyLevels: readonly number[]): BestiaryEntry[] {
  const deadly = thresholdsForParty(partyLevels.length ? [...partyLevels] : [1, 1, 1]).deadly;
  return COUCH_FOES.filter((entry) => xpForCr(entry.cr) <= deadly);
}
