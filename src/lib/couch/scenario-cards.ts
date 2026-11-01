// The ready-made nights' public faces: what the home screen and the
// couch-night screen may show about a written scenario before anyone plays
// it. Nothing here spoils the story: a premise as a back-of-the-box blurb,
// the mood, who it is for and how long it runs, and what kind of horror it
// leans on so a room can set its off-limits line. The scenarios themselves
// (truth, threat, agendas, hidden role) are server-only, in
// src/lib/couch/scenarios/, and never reach a browser.
//
// Every night is played on an overhead map of its site (src/lib/couch/
// sites, docs/couch-overhead-spec.md), so a story is offered here only
// once its site is written.
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
};

export const INTENSITY_LABELS = { 1: "Slow burn", 2: "Tense", 3: "Harrowing" } as const;

// The cover picture: the opening place, painted ahead of time by
// scripts/paint-scenario-covers.mjs. It shows no threat and no twist.
export function scenarioCover(card: ScenarioCard): string {
  return `/assets/couch/scenarios/${card.id}.webp`;
}

export const SCENARIO_CARDS: readonly ScenarioCard[] = [
  {
    id: "dead-air",
    title: "Dead Air",
    tagline: "A short night: a silent relay station, one hour, and a voice in the cables.",
    setting: "Deep-space relay station",
    blurb:
      "Tern Relay Nine went quiet in the middle of a sentence. The Company is paying your salvage tug triple to get it back on the air within the hour. The station is dark, and somebody on the intercom knows your name.",
    mood: ["Paranoia", "Fast and loud"],
    players: { min: 2, max: 4, best: "3 or 4" },
    hours: "About 45 minutes",
    intensity: 2,
    contentNotes: ["Body horror", "Confined spaces", "Voices of the dead"],
  },
  {
    id: "haddon-outpost",
    title: "The Haddon Distress Call",
    tagline: "A mining outpost on a dead moon: lights on, supper on the tables, nobody home.",
    setting: "Moon-base mining outpost",
    blurb:
      "Haddon's distress beacon came on three days ago: no voice, just the outpost's code on a loop. Your survey lander is the nearest ship. The lights are on inside, the air is running, and the corridor beyond the airlock is perfectly still.",
    mood: ["Stalked", "Something in the vents"],
    players: { min: 2, max: 5, best: "3 to 5" },
    hours: "2–3 hours",
    intensity: 2,
    contentNotes: ["Body horror", "Being hunted", "Confined spaces"],
  },
  {
    id: "crew-expendable",
    title: "Crew Expendable",
    tagline: "An hour, three of you, and a Company ship lost four years ago, calling for help.",
    setting: "Hauler and derelict",
    blurb:
      "Your ice hauler's computer woke you forty days early: a Company ship listed lost with all hands four years ago has started calling for help, dead ahead. Your contract says you answer. The umbilical has already locked on. Not everyone aboard your ship is who they say they are.",
    mood: ["Who is human?", "Betrayal"],
    players: { min: 3, max: 4, best: "3" },
    hours: "About an hour",
    intensity: 3,
    contentNotes: ["Body horror", "Being hunted", "Betrayal by a friend"],
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

// A night's crew is the players on phones plus the AI crewmates
// (src/lib/couch/ai-crew.ts): together they must fit the story's crew, and
// at least one person plays. The AI fills the seats a small room cannot.
export function crewSeats(card: ScenarioCard, players: number, aiCrew: number): boolean {
  return players >= 1 && aiCrew >= 0 && scenarioSeats(card, players + aiCrew);
}

// The AI crewmates for a head count, kept inside the story's crew: never
// fewer than it takes to reach the story's minimum (one player alone gets
// company), never so many that the crew runs past its maximum. A room that
// already fills the story keeps the count it asked for.
export function fitAiCrew(card: ScenarioCard, players: number, aiCrew: number): number {
  return Math.min(Math.max(aiCrew, card.players.min - players, 0), Math.max(card.players.max - players, 0));
}
