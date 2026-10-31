// What a carried thing looks like on the couch phone, the pure half. Every
// item on the Character view's Gear section has a picture: the painted icon
// set's when it holds one (the SRD's weapons, armour, potions and some
// gear), otherwise one the server paints in the night's own look
// (src/lib/couch/item-art.ts), which is how a signature item, a keycard the
// GM hands over or a plain backpack gets one. Shared by the phone and the
// painter, so both agree on which items need painting.
// scripts/test-couch-phone.mjs.
import { iconCandidates } from "@/lib/icons";
import { textKey } from "@/lib/language/text-logic";

// Gear the painted set holds as an action card's painting rather than an
// item's: the wide paintings of the things a hand of cards can use.
const GEAR_PAINTINGS: Array<[RegExp, string]> = [
  [/\bhooded lantern\b|^lantern,\s*hooded\b/i, "gear-hooded-lantern"],
  [/^(?:lamp )?oil\b/i, "gear-oil"],
  [/\btinderbox\b/i, "gear-tinderbox"],
  [/\brope\b/i, "gear-rope"],
  [/\bball bearings\b/i, "gear-ball-bearings"],
  [/\bcaltrops\b/i, "gear-caltrops"],
  [/\btorch(?:es)?\b/i, "gear-torch"],
  [/\bhealer'?s kit\b/i, "gear-healers-kit"],
  [/\bantitoxin\b/i, "gear-antitoxin"],
  [/\bholy water\b/i, "gear-holy-water"],
  [/\balchemist'?s fire\b/i, "gear-alchemists-fire"],
  [/^acid\b/i, "gear-acid"],
];

// The painted icon for an item, by its own name or the SRD name it stands
// for; null when the set has none and the night paints one instead.
export function paintedItemIcon(name: string, srdName?: string): string | null {
  for (const key of [srdName, name]) {
    if (!key?.trim()) continue;
    const painted = iconCandidates({ kind: "item", key })[0];
    if (painted) return painted;
  }
  const gear = GEAR_PAINTINGS.find(([pattern]) => pattern.test(name.trim()));
  return gear ? `/assets/icons/action/${gear[1]}.webp` : null;
}

// One painting per name per night: two players' rations share one.
export function itemArtKey(name: string): string {
  return textKey(name);
}

// The most a night paints, and how often one item is tried. A starting kit
// is about twenty rows a character, most of them painted already or shared.
export const ITEM_ART_NIGHT_MAX = 90;
export const ITEM_ART_TRIES = 2;

// The picture asked for: the night's style lock first (image models weigh
// the first words most), then the one object alone on black, so it sits in
// a tile beside the painted cut-outs.
export function itemArtPrompt(name: string, styleLock: string): string {
  return [
    styleLock,
    `Still life of a single object: ${name}`,
    "the whole object centred and filling the frame, seen slightly from above, plain black background, no people, no hands, no text or lettering",
  ]
    .filter(Boolean)
    .join(". ");
}

// ---- names, as a tile reads them ----

const ARTICLE = /^(?:a|an|the)\s+/i;

// What a tile calls an item, and the rest of its line when the tile cuts
// it. The SRD writes gear backwards ("Rope, Hempen (50 feet)"), which reads
// forwards on a phone ("Hempen rope (50 feet)"); a line the story wrote
// ("A hollow blue ceramic transit token, worn on a cord; …") is named by its
// first clause, the rest of the line goes under it, and the whole line is
// kept for the item's own card.
export function itemTitle(name: string): { title: string; full: string; rest: string } {
  const text = name.trim().replace(/\s+/g, " ");
  const inverted = /^([A-Z][\w'’-]*(?: [\w'’-]+)?),\s*([A-Z][\w'’-]*(?: [\w'’-]+)?)(\s*\([^)]*\))?$/.exec(text);
  if (inverted) {
    const title = `${inverted[2]} ${inverted[1].toLowerCase()}${inverted[3] ?? ""}`;
    return { title: capitalize(title), full: "", rest: "" };
  }
  const bare = text.replace(ARTICLE, "");
  const cut = /\s*[;:,—–]\s*|\s+-\s+/.exec(bare);
  if (cut && cut.index >= 3) {
    // Under the title, the line goes on from where the title stops.
    return { title: capitalize(bare.slice(0, cut.index)), full: text, rest: capitalize(bare.slice(cut.index + cut[0].length)) };
  }
  return { title: capitalize(bare), full: "", rest: "" };
}

// The start of a move that uses the item, for the action box: "I use my
// hempen rope to ". A name in Title Case is the SRD's and reads lower case
// in a sentence; a name the story wrote keeps its own capitals.
export function itemMoveLine(name: string): string {
  const base = itemTitle(name).title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const words = base.split(" ");
  const titleCase = words.length > 1 && words.every((word) => /^[^\p{Ll}]/u.test(word));
  const phrase = titleCase ? base.toLowerCase() : base.replace(/^\p{Lu}(?!\p{Lu})/u, (letter) => letter.toLowerCase());
  return `I use my ${phrase} to `;
}

function capitalize(text: string): string {
  return text.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}
