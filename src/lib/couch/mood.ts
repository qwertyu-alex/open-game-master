import type { Campaign } from "@/lib/db/campaigns";
import { getCouchForge, getCouchMood, setCouchMood } from "@/lib/couch/store";
import { followMoodAmbience } from "@/lib/dm/ambience-tools";
import { soundPackById } from "@/lib/couch/sound-catalog";
import { couchSoundPack } from "@/lib/couch/sound-logic";
import { baseMood, moodCue, moodIntensity, steerMood, toolMood, type CouchMood } from "@/lib/couch/mood-logic";

// The rim of the couch music director (src/lib/couch/mood-logic.ts). Three
// callers: the GM's set_mood, every tool that worked during a GM turn, and
// the end of each turn, when a mood the tools raised may come back down.
// Every one writes the mood and puts its music on the TV, or does nothing.

function steer(
  campaign: Campaign,
  proposal: (base: CouchMood) => CouchMood,
  options: { stated?: boolean; renew?: boolean } = {},
): CouchMood | null {
  if (!campaign.gameSettings.couchMode) return null;
  const act = getCouchForge(campaign.id)?.act ?? 0;
  const previous = getCouchMood(campaign.id);
  const next = steerMood(previous, proposal(baseMood(previous, act)), { act, now: Date.now(), ...options });
  setCouchMood(campaign.id, next);
  // Only on a change: a cue the GM chose with set_ambience plays until the
  // mood moves on, and a held music layer is left alone (applyAuto).
  if (next.mood !== previous?.mood) {
    followMoodAmbience(campaign, moodCue(next.mood, act, soundPackById(couchSoundPack(campaign))?.scorePrefix));
  }
  return next.mood;
}

// set_mood: the GM's word, remembered as this act's base.
export function stateCouchMood(campaign: Campaign, mood: CouchMood): CouchMood | null {
  return steer(campaign, () => mood, { stated: true });
}

// A tool that worked during a GM turn: an attack is a fight whether or not
// the GM said so. Never lowers the mood.
export function noteCouchMoodTool(campaign: Campaign, name: string, rawArguments: string, outcome: Record<string, unknown>) {
  const raised = toolMood(name, rawArguments, outcome);
  if (!raised) return;
  steer(campaign, (base) => (moodIntensity(raised) > moodIntensity(base) ? raised : base), { renew: true });
}

// A GM turn ended: the scene settles back toward its base, after the dwell.
export function settleCouchMood(campaign: Campaign) {
  steer(campaign, (base) => base);
}
