// The ready-made nights' public faces: what the home screen and the
// couch-night screen may show about a written scenario before anyone plays
// it. Nothing here spoils the story: a premise as a back-of-the-box blurb,
// the mood, who it is for and how long it runs, and what kind of horror it
// leans on so a room can set its off-limits line. The scenarios themselves
// (truth, threat, agendas, hidden role) are server-only, in
// src/lib/couch/scenarios/, and never reach a browser.
//
// They follow the shape of the cinematic sci-fi horror one-shots the couch
// night is modelled on (three acts, a pre-written crew with secret agendas,
// at most one hidden role), but every story, creature, company and name is
// original: the published scenarios are someone else's to sell, and a night
// built on one would spoil it for anyone who later plays the real thing.
// Crew Expendable is set in a published universe at the owner's request
// (src/lib/couch/scenarios/crew-expendable.ts says how), but its story is
// still written new, and its card names nothing from it.

export type ScenarioCard = {
  id: string;
  title: string;
  // One line under the title: where and what, no twist.
  tagline: string;
  // The place, in two or three words, as the picture's caption.
  setting: string;
  // Two or three sentences, the hook only.
  blurb: string;
  // The kind of horror, in two or three words each.
  mood: string[];
  // The crew written for it: the night seats the first N.
  players: { min: number; max: number; best: string };
  hours: string;
  // What it shows, for the off-limits line. General, never a plot point.
  contentNotes: string[];
  // How hard it hits, 1 to 3 (INTENSITY_LABELS), so a room can pick a
  // gentler or a harder night without reading what happens.
  intensity: 1 | 2 | 3;
  // The holiday a seasonal story is told around, shown as its first tag.
  occasion?: "Halloween" | "Christmas";
  // Played on an overhead map of the whole site (docs/couch-overhead-spec.md).
  onMap?: boolean;
};

export const INTENSITY_LABELS = { 1: "Slow burn", 2: "Tense", 3: "Harrowing" } as const;

// The cover picture: the opening place, painted ahead of time by
// scripts/paint-scenario-covers.mjs. It shows no threat and no twist.
export function scenarioCover(card: ScenarioCard): string {
  return `/assets/couch/scenarios/${card.id}.webp`;
}

export const SCENARIO_CARDS: readonly ScenarioCard[] = [
  {
    id: "kesslers-moon",
    title: "Night Shift on Kessler's Moon",
    tagline: "A mining colony on a frozen moon, nine hours before the relief shuttle.",
    setting: "Ice-moon mining colony",
    blurb:
      "Deep Bore Six broke through into something warm, two kilometres under the ice. Now the drill crew below has stopped answering, the colony's heating is failing, and you are the night shift.",
    mood: ["Isolation", "Cold and dark", "Slow burn"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 2,
    contentNotes: ["Body horror", "Freezing", "Confined spaces"],
  },
  {
    id: "good-shepherd",
    title: "The Good Shepherd",
    tagline: "A hospital ship that answered your distress call, and is very glad you came.",
    setting: "Hospital ship",
    blurb:
      "Your tug lost its drive in the deep dark. The hospital ship Good Shepherd took you aboard, fed you, and patched you up. Everyone aboard is kind. Everyone is calm. Nobody seems in any hurry to fix your ship.",
    mood: ["Paranoia", "Something is wrong here", "Social horror"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 1,
    contentNotes: ["Medical settings", "Loss of self", "Needles"],
  },
  {
    id: "sixty-fathoms",
    title: "Sixty Fathoms",
    tagline: "A research station on the floor of an alien ocean, and a voice on the radio.",
    setting: "Sea-floor station",
    blurb:
      "Benthic Station Lir went silent during a storm. Your maintenance crew rides the diving bell down to restart it. Somewhere in the dark water, someone is still calling for help on the station channel.",
    mood: ["Claustrophobia", "Deep water", "Who is talking?"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 2,
    contentNotes: ["Drowning", "Deep water", "Sea creatures"],
  },
  {
    id: "hollow-night",
    title: "Hollow Night",
    tagline: "A farming colony's harvest festival: masks, carved lanterns, and a missing child.",
    setting: "Farming colony",
    blurb:
      "Furrow Colony celebrates Hollow Night the old Earth way, with bonfires, masks and a parade to the far fields. You are the night crew keeping it safe, and a nine-year-old in a ghost costume has not come home.",
    mood: ["Folk horror", "Masks", "Slow dread"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 3,
    contentNotes: ["Body horror", "Children in danger", "Fire"],
    occasion: "Halloween",
  },
  {
    id: "all-souls-station",
    title: "All Souls Station",
    tagline: "The outer system's most famous Halloween party, and nobody answering.",
    setting: "Orbital relay station",
    blurb:
      "Every year All Souls Relay broadcasts its Halloween party live. This year the picture cut out at 20:14. Your maintenance shuttle docks at eleven, and through the airlock window the decorations are still up and the music is still playing.",
    mood: ["Ghost story", "Haunted station", "Unseen things"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 2,
    contentNotes: ["Death", "Suffocation", "Vacuum"],
    occasion: "Halloween",
  },
  {
    id: "midwinter-rime",
    title: "Midwinter at Rime Station",
    tagline: "Christmas Eve on the ice at the edge of a world's endless night.",
    setting: "Polar research station",
    blurb:
      "Once a year the supply drone the crew call the sleigh brings parts, fuel and presents from home. Tonight it crashed on the ice two kilometres out, a storm is coming, and the wind has started to sound like bells.",
    mood: ["Creature feature", "Blizzard", "Who's on the list?"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 2,
    contentNotes: ["Freezing", "Abduction", "Being hunted"],
    occasion: "Christmas",
  },
  {
    id: "unto-us",
    title: "Unto Us",
    tagline: "A small ore hauler, a lone survivor in labour, and three ships following a star.",
    setting: "Deep-space ore hauler",
    blurb:
      "On Christmas Eve the Bethany Mae picks up a beacon bright as a star: a lifepod from a colony ship lost nine months ago, carrying one young woman about to give birth. There is no room aboard and no doctor. Three Company ships are on their way.",
    mood: ["Body horror", "Paranoia", "Hard choices"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 3,
    contentNotes: ["Pregnancy and birth", "Infants", "Body horror"],
    occasion: "Christmas",
  },
  {
    id: "dead-air",
    title: "Dead Air",
    tagline: "A short night: a silent relay station, one hour, and a voice in the cables.",
    setting: "Deep-space relay station",
    blurb:
      "Tern Relay Nine went quiet in the middle of a sentence. The Company is paying your salvage tug triple to get it back on the air within the hour. The station is dark, and somebody on the intercom knows your name.",
    mood: ["Played on a map", "Paranoia", "Fast and loud"],
    players: { min: 2, max: 4, best: "3 or 4" },
    hours: "About 45 minutes",
    intensity: 2,
    contentNotes: ["Body horror", "Confined spaces", "Voices of the dead"],
    onMap: true,
  },
  {
    id: "haddon-outpost",
    title: "The Haddon Distress Call",
    tagline: "A mining outpost on a dead moon: lights on, supper on the tables, nobody home.",
    setting: "Moon-base mining outpost",
    blurb:
      "Haddon's distress beacon came on three days ago: no voice, just the outpost's code on a loop. Your survey lander is the nearest ship. The lights are on inside, the air is running, and the corridor beyond the airlock is perfectly still.",
    mood: ["Played on a map", "Stalked", "Something in the vents"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 2,
    contentNotes: ["Body horror", "Being hunted", "Confined spaces"],
    onMap: true,
  },
  {
    id: "crew-expendable",
    title: "Crew Expendable",
    tagline: "An hour, three of you, and a Company ship lost four years ago, calling for help.",
    setting: "Hauler and derelict",
    blurb:
      "Your ice hauler's computer woke you forty days early: a Company ship listed lost with all hands four years ago has started calling for help, dead ahead. Your contract says you answer. The umbilical has already locked on. Not everyone aboard your ship is who they say they are.",
    mood: ["Played on a map", "Who is human?", "Betrayal"],
    players: { min: 3, max: 4, best: "3" },
    hours: "About an hour",
    intensity: 3,
    contentNotes: ["Body horror", "Being hunted", "Betrayal by a friend"],
    onMap: true,
  },
];

export function scenarioCard(id: string): ScenarioCard | undefined {
  return SCENARIO_CARDS.find((card) => card.id === id);
}

// Whether a written scenario seats this many players: each one carries a
// crew of its own, and the night takes the first N of it.
export function scenarioSeats(card: ScenarioCard, players: number): boolean {
  return players >= card.players.min && players <= card.players.max;
}
