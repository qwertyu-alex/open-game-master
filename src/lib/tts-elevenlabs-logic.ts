import type { VoiceGender, VoiceTraits } from "@/lib/tts-cast";

// ElevenLabs as a narration server (docs/couch-mode-spec.md 2.5): the
// request it takes, how its voice list reads, and what its refusals mean,
// with no network here so scripts/test-tts-backend.mjs checks each piece.
// tts-backend.ts sends what this builds. Its shapes differ from the
// OpenAI-style servers on every count: speech is POSTed per voice to
// /v1/text-to-speech/{voice_id} with an xi-api-key header, the voices come
// from /v2/voices a page at a time, and an error says what it is in
// detail.status ("quota_exceeded", "voice_not_found"). The model is never
// named here: it is the admin's (speech.ttsModel or TTS_MODEL).

export const ELEVENLABS_DEFAULT_URL = "https://api.elevenlabs.io";
// MP3, like every other narration server here: the clips of a passage are
// concatenated into one file (src/lib/tts.ts).
export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
// ElevenLabs' documented pace range is narrower than a campaign's 0.7 to
// 1.4 (src/lib/tts-segments.ts SPEED_MIN/MAX).
export const ELEVENLABS_SPEED_MIN = 0.7;
export const ELEVENLABS_SPEED_MAX = 1.2;
// Its "natural" setting, sent on every request so a library voice saved
// with a flat, very stable setting still reads a scene with some feeling.
// 0.5 is also one of the three values the v3 models accept.
const STABILITY = 0.5;

export function elevenLabsSpeed(speed: number): number {
  const asked = Number.isFinite(speed) ? speed : 1;
  return Math.round(Math.min(ELEVENLABS_SPEED_MAX, Math.max(ELEVENLABS_SPEED_MIN, asked)) * 100) / 100;
}

// ElevenLabs voice ids are 20 letters and digits. A campaign made on a
// Kokoro server carries "af_heart", which no ElevenLabs account has.
export function isElevenLabsVoiceId(id: string): boolean {
  return /^[A-Za-z0-9]{20}$/.test(id);
}

function root(v1: string): string {
  return v1.replace(/\/v\d+$/, "");
}

export type ElevenLabsRequest = { url: string; headers: Record<string, string>; body: string };

export function elevenLabsHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { "xi-api-key": apiKey } : {};
}

export function elevenLabsSpeechUrl(v1: string, voice: string): string {
  return `${v1}/text-to-speech/${encodeURIComponent(voice)}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
}

// The text goes as written, audio tags and all: the model reads them.
export function elevenLabsSpeechRequest(
  backend: { v1: string; model: string; apiKey: string },
  text: string,
  voice: string,
  speed: number,
): ElevenLabsRequest {
  const pace = elevenLabsSpeed(speed);
  return {
    url: elevenLabsSpeechUrl(backend.v1, voice),
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg", ...elevenLabsHeaders(backend.apiKey) },
    body: JSON.stringify({
      text,
      model_id: backend.model,
      voice_settings: { stability: STABILITY, ...(pace !== 1 ? { speed: pace } : {}) },
    }),
  };
}

// Which of an account's voices one listing asks for. "default" is
// ElevenLabs' own (premade) set, "personal" and "workspace" the account's
// own clones and designs, "non-default" everything else it has saved.
export type ElevenLabsVoiceType = "personal" | "workspace" | "default" | "non-default";

export function elevenLabsVoicesUrl(v1: string, voiceType: ElevenLabsVoiceType, pageSize: number, token = ""): string {
  const url = new URL(`${root(v1)}/v2/voices`);
  url.searchParams.set("page_size", String(Math.max(1, Math.min(100, Math.floor(pageSize)))));
  url.searchParams.set("voice_type", voiceType);
  if (token) {
    url.searchParams.set("next_page_token", token);
  }
  return url.toString();
}

// The liveness check: one voice, which every key that can narrate may list.
export function elevenLabsProbeUrl(v1: string): string {
  return `${root(v1)}/v2/voices?page_size=1`;
}

export type ElevenLabsVoice = {
  id: string;
  name: string;
  // "premade", "professional", "cloned", "generated"...
  category: string;
  // The account's own clones and designs.
  own: boolean;
  gender: VoiceGender;
  // As listed ("male", "female", "neutral"), for the label.
  genderLabel: string;
  // ISO code, "en" when the voice does not say.
  language: string;
  accent: string;
  age: string;
  descriptive: string;
  useCase: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// One page of /v2/voices: its voices, and the token for the next page ("" on
// the last one).
export function parseElevenLabsVoices(payload: unknown): { voices: ElevenLabsVoice[]; next: string } {
  const page = payload as { voices?: unknown; has_more?: unknown; next_page_token?: unknown } | null;
  const list = page && Array.isArray(page.voices) ? page.voices : [];
  const voices: ElevenLabsVoice[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const id = text(raw.voice_id);
    if (!id || id.length > 120) {
      continue;
    }
    const labels = raw.labels && typeof raw.labels === "object" ? (raw.labels as Record<string, unknown>) : {};
    const verified = Array.isArray(raw.verified_languages) ? (raw.verified_languages as Array<{ language?: unknown }>) : [];
    const category = text(raw.category);
    const genderLabel = text(labels.gender);
    voices.push({
      id,
      name: (text(raw.name) || id).slice(0, 80),
      category,
      own: raw.is_owner === true || category === "cloned" || category === "generated",
      gender: genderLabel === "female" ? "f" : genderLabel === "male" ? "m" : "",
      genderLabel,
      language: text(labels.language) || text(verified[0]?.language) || "en",
      accent: text(labels.accent),
      age: text(labels.age).replace(/_/g, "-"),
      descriptive: text(labels.descriptive),
      useCase: text(labels.use_case),
    });
  }
  const next = page?.has_more === true ? text(page.next_page_token) : "";
  return { voices, next };
}

// The account's own voices first, then those saved from the voice library,
// then ElevenLabs' own set, each by name; a voice listed twice (a listing
// per kind overlaps) once.
function groupRank(voice: ElevenLabsVoice): number {
  return voice.own ? 0 : voice.category === "premade" ? 2 : 1;
}

export function sortElevenLabsVoices(voices: readonly ElevenLabsVoice[]): ElevenLabsVoice[] {
  const seen = new Set<string>();
  const unique = voices.filter((voice) => !seen.has(voice.id) && seen.add(voice.id));
  return unique.sort((a, b) => groupRank(a) - groupRank(b) || a.name.localeCompare(b.name));
}

export function elevenLabsVoiceGroup(voice: ElevenLabsVoice): string {
  return voice.own ? "Your voices" : voice.category === "premade" ? "ElevenLabs' own voices" : "Saved from the voice library";
}

function capitalised(phrase: string): string {
  return phrase.replace(/(^|\s)(\S)/g, (_, gap: string, first: string) => gap + first.toUpperCase());
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// "George - Warm, Captivating Storyteller — British, middle-aged, male,
// mature": the name the account knows it by, then what it sounds like, so a
// picker of three hundred voices can be read without auditioning each.
export function elevenLabsVoiceLabel(voice: ElevenLabsVoice): string {
  const accent = voice.accent && voice.accent !== "standard" ? capitalised(voice.accent) : "";
  const speech = voice.language === "en" ? accent : accent ? `${languageName(voice.language)} (${accent})` : languageName(voice.language);
  const traits = [speech, voice.age, voice.genderLabel, voice.descriptive].filter(Boolean);
  return traits.length ? `${voice.name} — ${traits.join(", ")}` : voice.name;
}

// The voice a server with no default named reads in: one of ElevenLabs' own
// storytellers in English, which every account has, before anything the
// account saved.
export function suggestedElevenLabsVoice(voices: readonly ElevenLabsVoice[]): string {
  const english = voices.filter((voice) => voice.language === "en");
  const premade = english.filter((voice) => voice.category === "premade");
  const storyteller = premade.find((voice) => voice.useCase === "narrative_story");
  return (storyteller ?? premade[0] ?? english[0] ?? voices[0])?.id ?? "";
}

// Which voices are cast first: those made for stories and characters,
// short of the bubbly ones. A test table on a real account cast a ship's
// officer in "Candy - Girly and Sweet"; the advert, podcast and cartoon
// voices stay castable, after the rest. Both lists are ElevenLabs' own label
// values.
const CHARACTER_USES = new Set(["characters_animation", "narrative_story", "entertainment_tv"]);
const BUBBLY = new Set(["cute", "sassy", "hyped", "excited", "upbeat"]);

export function elevenLabsTraits(voices: readonly ElevenLabsVoice[]): Map<string, VoiceTraits> {
  return new Map(
    voices.map((voice) => [
      voice.id,
      { gender: voice.gender, language: voice.language, preferred: CHARACTER_USES.has(voice.useCase) && !BUBBLY.has(voice.descriptive) },
    ]),
  );
}

export type ElevenLabsError = { code: string; message: string };

// What an ElevenLabs error body says: { detail: { status, code, message } }.
// `status` is the specific reason ("invalid_api_key"), `code` the family
// ("unauthorized"); some answers carry only one of them.
export function readElevenLabsError(body: string): ElevenLabsError {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const fields = detail as Record<string, unknown>;
      return { code: text(fields.status) || text(fields.code), message: text(fields.message).slice(0, 160) };
    }
    if (typeof detail === "string") {
      return { code: "", message: text(detail).slice(0, 160) };
    }
  } catch {
    // Not JSON: a gateway's page says nothing a table can use.
  }
  return { code: "", message: "" };
}

// Refusals that say the account cannot narrate right now, rather than that
// this one request was wrong: out of credits, a key turned down, too many
// requests. Narration then falls back to Kokoro for the rest of the passage
// when this server has one (src/lib/tts-backend.ts elevenLabsStandIn).
export function elevenLabsTurnedAway(status: number, code: string): boolean {
  return code === "quota_exceeded" || status === 401 || status === 402 || status === 429;
}

function sentence(line: string): string {
  return line.replace(/\.?$/, ".");
}

// Why ElevenLabs refused a passage, in words for the table. Never the key:
// ElevenLabs' own messages name a permission or an id, not the key.
export function describeElevenLabsRefusal(status: number, code: string, detail: string): string {
  if (code === "quota_exceeded") {
    return "ElevenLabs is out of credits for this account (quota exceeded). Add credits or usage-based billing in the ElevenLabs account, or choose another narration server in Admin > Speech.";
  }
  if (code === "missing_permissions") {
    return sentence(`The ElevenLabs API key is missing a permission narration needs${detail ? `: ${detail}` : ""}`);
  }
  if (code === "invalid_api_key" || status === 401 || status === 403) {
    return `ElevenLabs refused the API key (HTTP ${status}). An admin can check it in Admin > Speech.`;
  }
  if (code === "voice_not_found") {
    return "ElevenLabs has no voice with that id on this account. Choose one from the list in the campaign's narration settings.";
  }
  if (code === "model_not_found") {
    return sentence(`ElevenLabs does not know the narration model set in Admin > Speech${detail ? `: ${detail}` : ""}`);
  }
  if (status === 429) {
    return sentence(`ElevenLabs is turning requests away for now, more at once than the plan allows (HTTP 429${detail ? `: ${detail}` : ""})`);
  }
  return sentence(`ElevenLabs answered HTTP ${status}${detail ? `: ${detail}` : ""}`);
}
