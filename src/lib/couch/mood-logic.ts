// The music director of a couch night: what the scene is doing to the crew,
// and which music cue says it (docs/couch-mode-spec.md 2.6, Ambience).
//
// The GM names the mood with set_mood; the server raises it from what the
// tools did (an attack is a fight, whether or not anyone said so), and a
// new act sets the floor until the GM speaks. Music that changes on every
// reply is noise, so it climbs at once and comes down only after it has
// played a while: horror spikes fast and releases slow.
//
// Pure, for scripts/test-couch-mood.mjs. The rim is src/lib/couch/mood.ts.

export const COUCH_MOODS = ["calm", "relief", "uneasy", "aftermath", "dread", "danger", "chase", "fight"] as const;
export type CouchMood = (typeof COUCH_MOODS)[number];

// How hard each mood presses. Only rising is immediate.
const INTENSITY: Record<CouchMood, number> = {
  calm: 0,
  relief: 0,
  uneasy: 1,
  aftermath: 1,
  dread: 2,
  danger: 3,
  chase: 4,
  fight: 4,
};

// The night's score (src/lib/couch/sound-catalog.ts): every pack names its
// cues `${prefix}_${mood}`, and a fight in the last act is its finale. The
// sci-fi pack's prefix is "score".
export const DEFAULT_SCORE_PREFIX = "score";

// Until the GM names a mood in an act, the act's own: slow dread, then worse.
const ACT_FLOOR: readonly CouchMood[] = ["uneasy", "uneasy", "dread"];

// A falling mood waits this long after the last change; the GM's own word
// waits only long enough that one reply cannot bounce it.
export const MOOD_DWELL_MS = 90_000;
export const MOOD_GUARD_MS = 15_000;

export type MoodState = {
  mood: CouchMood;
  // When `mood` started playing (ms since the epoch).
  since: number;
  // The GM's last set_mood and the act it was said in; stale once the act
  // turns.
  stated: CouchMood | null;
  statedAct: number;
};

export function isCouchMood(value: unknown): value is CouchMood {
  return typeof value === "string" && (COUCH_MOODS as readonly string[]).includes(value);
}

export function moodIntensity(mood: CouchMood): number {
  return INTENSITY[mood];
}

export function moodCue(mood: CouchMood, act: number, scorePrefix = DEFAULT_SCORE_PREFIX): string {
  return `${scorePrefix}_${mood === "fight" && act >= ACT_FLOOR.length - 1 ? "finale" : mood}`;
}

// What the scene sits at when nothing is happening: the GM's word in this
// act, else the act's floor.
export function baseMood(state: MoodState | null, act: number): CouchMood {
  if (state?.stated && state.statedAct === act) return state.stated;
  return ACT_FLOOR[Math.max(0, Math.min(act, ACT_FLOOR.length - 1))];
}

// The mood a tool that just worked says the scene is in, or null when it
// says nothing. Only a call that succeeded counts: a refused attack is not a
// fight.
const FIGHT_TOOLS = new Set([
  "pc_attack",
  "enemy_attack",
  "aoe_damage",
  "cast_at_enemy",
  "start_encounter",
  "legendary_action",
  "lair_action",
]);
const DANGER_TOOLS = new Set(["apply_damage", "cast_at_player", "apply_hazard"]);

export function toolMood(name: string, rawArguments: string, outcome: Record<string, unknown>): CouchMood | null {
  if (outcome.error !== undefined || outcome.refused !== undefined) return null;
  if (FIGHT_TOOLS.has(name)) return "fight";
  if (DANGER_TOOLS.has(name)) return "danger";
  if (name === "start_scene") {
    try {
      return (JSON.parse(rawArguments || "{}") as { kind?: unknown }).kind === "chase" ? "chase" : null;
    } catch {
      return null;
    }
  }
  return null;
}

// The next mood. `proposal` is what the scene is now; `stated` marks the
// GM's own set_mood, which is remembered as the act's base and may come
// down without the full dwell; `renew` marks a tool that showed the scene
// is still at this pitch (another blow in a long fight), which restarts the
// dwell so the fight music does not drop out mid-fight.
export function steerMood(
  previous: MoodState | null,
  proposal: CouchMood,
  input: { act: number; now: number; stated?: boolean; renew?: boolean },
): MoodState {
  const stated = input.stated ? proposal : (previous?.stated ?? null);
  const statedAct = input.stated ? input.act : (previous?.statedAct ?? input.act);
  if (!previous) {
    return { mood: proposal, since: input.now, stated, statedAct };
  }
  const keep = { ...previous, stated, statedAct };
  if (proposal === previous.mood) return input.renew ? { ...keep, since: input.now } : keep;
  const held = input.now - previous.since;
  const rising = INTENSITY[proposal] > INTENSITY[previous.mood];
  const settled = held >= (input.stated ? MOOD_GUARD_MS : MOOD_DWELL_MS);
  return rising || settled ? { mood: proposal, since: input.now, stated, statedAct } : keep;
}

// One line for the GM's game state, so set_mood is called when the mood
// turns rather than every reply.
export function moodPromptLine(state: MoodState | null): string {
  return `Mood: ${state?.mood ?? "not set"} (the TV's music follows it; call set_mood when the scene turns).`;
}
