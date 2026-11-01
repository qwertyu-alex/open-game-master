import type { AmbienceCue } from "../../ambience/catalog";

// Small builders for a genre pack's cues (src/lib/couch/sound-catalog.ts),
// so each pack file reads as its sounds and their prompts, not boilerplate.
// Pure, no imports but the type.

// The couch moods a score answers (src/lib/couch/mood-logic.ts), and the
// last-act fight.
export const SCORE_MOODS = ["calm", "relief", "uneasy", "dread", "danger", "chase", "fight", "aftermath", "finale"] as const;
export type ScoreMood = (typeof SCORE_MOODS)[number];

type Part = { label: string; blurb: string; prompt: string; keywords?: string[]; seconds?: number; gain?: number };

// A room tone under narration, not a piece of music, and one that loops.
const BED_TAIL = "no music, no melody, no voices, steady and even, seamless loop";

export function beds(pack: string, entries: Record<string, Part & { keywords: string[] }>): AmbienceCue[] {
  return Object.entries(entries).map(([id, part]) => ({
    id,
    layer: "bed",
    label: part.label,
    blurb: part.blurb,
    keywords: part.keywords,
    search: [`${part.label.toLowerCase()} ambience`],
    gain: part.gain ?? 0.45,
    seconds: part.seconds ?? 30,
    prompt: `${part.prompt}, ${BED_TAIL}`,
    pack,
  }));
}

// One cue a mood, named `${prefix}_${mood}`, each prompt opened by the
// pack's style line.
export function score(pack: string, prefix: string, style: string, entries: Record<ScoreMood, Part>): AmbienceCue[] {
  return SCORE_MOODS.map((mood) => {
    const part = entries[mood];
    return {
      id: `${prefix}_${mood}`,
      layer: "music",
      label: part.label,
      blurb: part.blurb,
      keywords: part.keywords ?? [mood],
      search: [`${mood} cinematic music`],
      gain: part.gain ?? 0.35,
      seconds: part.seconds ?? (mood === "finale" ? 150 : 120),
      prompt: `${style}. ${part.prompt}`,
      pack,
    };
  });
}

export function stings(pack: string, entries: Record<string, Part>): AmbienceCue[] {
  return Object.entries(entries).map(([id, part]) => ({
    id,
    layer: "sting",
    label: part.label,
    blurb: part.blurb,
    keywords: part.keywords ?? [],
    search: [`${part.label.toLowerCase()} sound effect`],
    gain: part.gain ?? 0.65,
    seconds: part.seconds ?? 4,
    prompt: part.prompt,
    pack,
  }));
}

export type SoundPack = {
  id: string;
  // What the pack is, in a few words, for a person choosing.
  label: string;
  // Score cue ids are `${scorePrefix}_${mood}`.
  scorePrefix: string;
  // Where a night of this genre is when nothing says.
  defaultBed: string;
  // One line for the GM on filing places, when the genre needs one.
  sceneHint?: string;
  cues: AmbienceCue[];
  // Sounds from elsewhere this pack also plays: the upstream library's or
  // another pack's.
  shared: readonly string[];
};
