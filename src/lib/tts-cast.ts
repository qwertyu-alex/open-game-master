import { TTS_VOICES } from "@/lib/tts-voices";
import { textKey } from "@/lib/language/text-logic";

// Casting voices (issue 97): which of the server's voices suits a speaker
// nobody has chosen one for. Pure and deterministic, so the same table is
// always cast the same way and scripts/test-tts-cast.mjs can check it. The
// choice is saved the moment it is made, so it never drifts afterwards and
// the table can change it like any other.

export type VoiceGender = "f" | "m" | "";

// What a server says about a voice beyond its id. ElevenLabs ids are opaque
// ("JBFqnCBsd6RMkjVDRZzb"), so its voice list's labels are the only way to
// cast a woman in a woman's voice; `preferred` marks the voices made for
// characters and stories, which are cast before the podcast and advert
// voices an account also holds.
export type VoiceTraits = { gender: VoiceGender; language: string; preferred: boolean };

// OpenAI's voices do not say what they sound like in their names.
const OPENAI_GENDER: Record<string, VoiceGender> = {
  ash: "m",
  ballad: "m",
  coral: "f",
  echo: "m",
  nova: "f",
  onyx: "m",
  sage: "f",
  shimmer: "f",
  verse: "m",
};

// Kokoro ids are <language><f|m>_<name>: af_heart, bm_george.
const KOKORO_ID = /^([a-z])([fm])_[a-z0-9]+$/;

export function isKokoroVoiceId(voiceId: string): boolean {
  return KOKORO_ID.test(voiceId);
}

export function voiceGender(voiceId: string, traits?: ReadonlyMap<string, VoiceTraits>): VoiceGender {
  const listed = traits?.get(voiceId);
  if (listed) {
    return listed.gender;
  }
  const kokoro = KOKORO_ID.exec(voiceId);
  if (kokoro) {
    return kokoro[2] as VoiceGender;
  }
  return OPENAI_GENDER[voiceId] ?? "";
}

const ENGLISH = new Set(["a", "b"]);

// The voices worth casting from: never the narrator's own, never the old
// takes and novelty voices a Kokoro server still lists, and on a Kokoro
// server only voices in the narrator's language (an English passage read by
// a Japanese voice is not a character, it is a fault). The shipped, named
// voices come first: they are the ones known to sound good. A server that
// describes its voices (traits) is cast from those in the narrator's
// language whose gender it names: ElevenLabs accounts hold experiments and
// voices in many languages, and an unlabelled one is as likely to be a
// Spanish advert as a character.
export function castingPool(serverVoices: string[], narratorVoice: string, traits?: ReadonlyMap<string, VoiceTraits>): string[] {
  if (traits?.size) {
    return describedPool(serverVoices, narratorVoice, traits);
  }
  const narratorLanguage = KOKORO_ID.exec(narratorVoice)?.[1] ?? "a";
  const sameLanguage = (letter: string) =>
    ENGLISH.has(narratorLanguage) ? ENGLISH.has(letter) : letter === narratorLanguage;
  const pool = serverVoices.filter((id) => {
    if (id === narratorVoice || /_v0|santa/.test(id)) {
      return false;
    }
    const kokoro = KOKORO_ID.exec(id);
    return kokoro ? sameLanguage(kokoro[1]) : true;
  });
  const curated = TTS_VOICES.map((voice) => voice.id as string);
  const rank = (id: string) => (curated.includes(id) ? curated.indexOf(id) : curated.length);
  return [...pool].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function describedPool(serverVoices: string[], narratorVoice: string, traits: ReadonlyMap<string, VoiceTraits>): string[] {
  const language = traits.get(narratorVoice)?.language || "en";
  const others = serverVoices.filter((id) => id !== narratorVoice);
  const gendered = others.filter((id) => traits.get(id)?.gender);
  const spoken = gendered.filter((id) => traits.get(id)?.language === language);
  const pool = spoken.length ? spoken : gendered.length ? gendered : others;
  const rank = (id: string) => (traits.get(id)?.preferred ? 0 : 1);
  return [...pool].sort((a, b) => rank(a) - rank(b));
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

// One voice for one speaker: of the right sort when that is known, the one
// fewest others at the table already have, a named voice before an unnamed
// one, and among equals the speaker's own name decides, so two tables do not
// cast everyone in the same order. "" when the server offers nothing.
export function pickVoice(
  name: string,
  gender: VoiceGender,
  pool: string[],
  taken: string[],
  traits?: ReadonlyMap<string, VoiceTraits>,
): string {
  if (!pool.length) {
    return "";
  }
  const suited = gender ? pool.filter((id) => voiceGender(id, traits) === gender) : [];
  const candidates = suited.length ? suited : pool;
  const uses = (id: string) => taken.filter((entry) => entry === id).length;
  const fewest = Math.min(...candidates.map(uses));
  const free = candidates.filter((id) => uses(id) === fewest);
  const curated = new Set<string>(TTS_VOICES.map((voice) => voice.id));
  const named = free.filter((id) => (traits?.size ? traits.get(id)?.preferred === true : curated.has(id)));
  const from = named.length ? named : free;
  return from[hash(textKey(name)) % from.length];
}
