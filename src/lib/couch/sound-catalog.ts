import type { AmbienceCue } from "../ambience/catalog";
import type { SoundPack } from "./sound-packs/build";
import { COSMIC_HORROR } from "./sound-packs/cosmic-horror";
import { FOLK_HORROR } from "./sound-packs/folk-horror";
import { GOTHIC_HORROR } from "./sound-packs/gothic-horror";
import { SCIFI_HORROR } from "./sound-packs/scifi-horror";
import { SURVIVAL_HORROR } from "./sound-packs/survival-horror";
import { THRILLER } from "./sound-packs/thriller";

// A couch night's sound library, one pack a genre: its places, its score
// (one cue a mood, src/lib/couch/mood-logic.ts) and its one-shot stings
// (docs/couch-mode-spec.md 2.6).
//
// The upstream library (src/lib/ambience/catalog.ts) is a fantasy table's:
// its "ship" is a sailing ship, so a crew aboard a salvage tug heard waves
// and rigging. These cues live in the same catalog, so the player, the
// manifest and the sound pack need nothing new, but each carries a `pack`,
// and a table playing that pack is offered only its own and the few it
// shares. A new genre is a new file in ./sound-packs, not a new engine.
//
// Every file is generated once (scripts/generate-ambience.mjs --backend
// elevenlabs --pack <id>), so a cue's prompt is the source of its sound.
// The scores are written as big film scores; the prompts describe the
// sound instead of naming a composer, because the music model refuses
// artist names.
//
// Pure, no I/O: catalog.ts imports this, and the scripts load catalog.ts
// directly.

export const COUCH_SOUND_PACK_LIST: readonly SoundPack[] = [SCIFI_HORROR, GOTHIC_HORROR, THRILLER, FOLK_HORROR, COSMIC_HORROR, SURVIVAL_HORROR];

export const COUCH_SOUND_PACKS = ["scifi_horror", "gothic_horror", "thriller", "folk_horror", "cosmic_horror", "survival_horror"] as const;
export type CouchSoundPack = (typeof COUCH_SOUND_PACKS)[number];

export const COUCH_SOUND_CUES: AmbienceCue[] = COUCH_SOUND_PACK_LIST.flatMap((pack) => pack.cues);

export const COUCH_PACK_SHARED: Record<string, readonly string[]> = Object.fromEntries(
  COUCH_SOUND_PACK_LIST.map((pack) => [pack.id, pack.shared]),
);

export function soundPackById(id: string | null | undefined): SoundPack | null {
  return COUCH_SOUND_PACK_LIST.find((pack) => pack.id === id) ?? null;
}

export function isCouchSoundPack(value: unknown): value is CouchSoundPack {
  return typeof value === "string" && (COUCH_SOUND_PACKS as readonly string[]).includes(value);
}
