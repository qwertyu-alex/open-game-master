import { createHash } from "node:crypto";
import { configValue, getGlobalConfig } from "@/lib/app-config";
import { soleListedModel } from "@/lib/model-registry/discovery";
import { openAiSpeechConfig } from "@/lib/openai-images";
import { serverEnv } from "@/lib/server-env";
import { castingPool, isKokoroVoiceId, pickVoice } from "@/lib/tts-cast";
import {
  ELEVENLABS_DEFAULT_URL,
  describeElevenLabsRefusal,
  elevenLabsHeaders,
  elevenLabsSpeechRequest,
  elevenLabsSpeechUrl,
  elevenLabsTraits,
  elevenLabsTurnedAway,
  elevenLabsVoicesUrl,
  isElevenLabsVoiceId,
  parseElevenLabsVoices,
  readElevenLabsError,
  sortElevenLabsVoices,
  suggestedElevenLabsVoice,
  elevenLabsVoiceGroup,
  elevenLabsVoiceLabel,
  type ElevenLabsVoice,
  type ElevenLabsVoiceType,
} from "@/lib/tts-elevenlabs-logic";
import { bareMp3Frames } from "@/lib/mp3-join-logic";
import { stripAudioTags } from "@/lib/tts-tags-logic";
import { TTS_VOICES } from "@/lib/tts-voices";

// Where narration is rendered (issue 89). One setting names the kind of
// speech server, the way the text model's does, and everything else follows
// from it:
//
//   kokoro  a Kokoro-FastAPI service, the shipped default at 127.0.0.1:8880.
//   openai  any server that speaks OpenAI's /v1/audio/speech: OpenAI itself,
//           or a local one (Kokoro-FastAPI, Speaches, openedai-speech, ...)
//           with its own address, model and key.
//   elevenlabs  ElevenLabs' hosted voices (docs/couch-mode-spec.md 2.5), on
//           the admin's key (speech.ttsApiKey, else ELEVENLABS_API_KEY) and
//           model; its request and voice list are its own
//           (src/lib/tts-elevenlabs-logic.ts).
//   off     no narration on this server.
//
// Kokoro and openai are the same request on the wire; the kind only picks
// the defaults, so a server set up before this existed keeps working
// untouched.
// An "openai" server's model has no default: it is the admin's pick from
// what the server lists. With none picked, a server of the host's own that
// lists exactly one model runs that one (narrationModel below); otherwise
// nothing is sent.
// The decision logic is pure and exported so scripts/test-tts-backend.mjs can
// drive it without a network.

export type TtsProvider = "kokoro" | "openai" | "elevenlabs" | "off";

const PROVIDERS: readonly TtsProvider[] = ["kokoro", "openai", "elevenlabs", "off"];

export type TtsBackend = {
  provider: TtsProvider;
  // The /v1 root: speech is POSTed to `${v1}/audio/speech` (ElevenLabs:
  // `${v1}/text-to-speech/{voice}`).
  v1: string;
  model: string;
  apiKey: string;
  // The voice used when a campaign names one this server does not have.
  defaultVoice: string;
};

export const KOKORO_DEFAULT_URL = "http://127.0.0.1:8880";
export const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";

// OpenAI publishes no voice list endpoint; these are the documented voices.
export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
];

// A bare host, a /v1 base, or a trailing slash all land on the same root,
// the same forgiveness the text model's address gets.
export function v1Root(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

export function isOpenAiHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
}

export type TtsBackendInput = {
  provider: string;
  // Admin value, then env, for each kind of server.
  kokoroUrl: string;
  openaiUrl: string;
  model: string;
  apiKey: string;
  voice: string;
  // The server's shared OpenAI key (images, dictation), lent only to
  // api.openai.com itself.
  sharedOpenAiKey: string;
  // ElevenLabs' address, for its regional hosts (ELEVENLABS_BASE_URL);
  // blank is api.elevenlabs.io. Not the openai kind's address: a server
  // switched from one kind to the other never sends one's requests, or its
  // key, to the other's host.
  elevenLabsUrl?: string;
};

export function resolveTtsBackend(input: TtsBackendInput): TtsBackend {
  const provider: TtsProvider = PROVIDERS.find((kind) => kind === input.provider) ?? "kokoro";
  if (provider === "elevenlabs") {
    // No model and no voice are named here: a blank model reads nothing
    // aloud (synthesizeSpeech says where to set one), and a blank voice is
    // one of the account's own storytellers (listedDefaultVoice).
    return {
      provider,
      v1: v1Root(input.elevenLabsUrl?.trim() || ELEVENLABS_DEFAULT_URL),
      model: input.model.trim(),
      apiKey: input.apiKey.trim(),
      defaultVoice: input.voice.trim(),
    };
  }
  if (provider === "openai") {
    const base = input.openaiUrl.trim() || OPENAI_DEFAULT_URL;
    const official = isOpenAiHost(base);
    return {
      provider,
      v1: v1Root(base),
      model: input.model.trim(),
      apiKey: input.apiKey.trim() || (official ? input.sharedOpenAiKey.trim() : ""),
      defaultVoice: input.voice.trim() || (official ? "alloy" : ""),
    };
  }
  return {
    provider,
    v1: v1Root(input.kokoroUrl.trim() || KOKORO_DEFAULT_URL),
    model: input.model.trim() || "kokoro",
    apiKey: input.apiKey.trim(),
    defaultVoice: input.voice.trim() || "af_heart",
  };
}

// The server's saved narration backend. `override` carries the admin form's
// unsaved values so "Test" tries what is typed, not what was last saved.
export function ttsBackend(override: Partial<Pick<TtsBackendInput, "provider" | "kokoroUrl" | "openaiUrl" | "model" | "voice">> & { apiKey?: string } = {}): TtsBackend {
  const speech = getGlobalConfig().speech;
  const provider = override.provider ?? configValue(speech.ttsProvider, "TTS_PROVIDER");
  // ElevenLabs' own variable comes before the generic one, which may hold
  // another speech server's key.
  const savedKey =
    provider.trim() === "elevenlabs"
      ? configValue(speech.ttsApiKey, "ELEVENLABS_API_KEY") || serverEnv("TTS_API_KEY")
      : configValue(speech.ttsApiKey, "TTS_API_KEY");
  return resolveTtsBackend({
    provider,
    kokoroUrl: override.kokoroUrl?.trim() || configValue(speech.kokoroUrl, "KOKORO_URL"),
    openaiUrl: override.openaiUrl?.trim() || configValue(speech.ttsBaseUrl, "TTS_BASE_URL"),
    model: override.model?.trim() || configValue(speech.ttsModel, "TTS_MODEL"),
    apiKey: override.apiKey?.trim() || savedKey,
    voice: override.voice?.trim() || configValue(speech.ttsVoice, "TTS_VOICE"),
    sharedOpenAiKey: openAiSpeechConfig().apiKey,
    elevenLabsUrl: serverEnv("ELEVENLABS_BASE_URL"),
  });
}

// The Kokoro service this server would narrate with, whatever is chosen:
// the stand-in when ElevenLabs turns a passage away. Nothing of the chosen
// server is lent to it, its key and model least of all.
export function kokoroBackend(): TtsBackend {
  return resolveTtsBackend({
    provider: "kokoro",
    kokoroUrl: configValue(getGlobalConfig().speech.kokoroUrl, "KOKORO_URL"),
    openaiUrl: "",
    model: "",
    apiKey: "",
    voice: "",
    sharedOpenAiKey: "",
  });
}

// How a request proves who it is from: a bearer key, or ElevenLabs' own
// header.
export function speechAuthHeaders(backend: Pick<TtsBackend, "provider" | "apiKey">): Record<string, string> {
  if (backend.provider === "elevenlabs") {
    return elevenLabsHeaders(backend.apiKey);
  }
  return backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {};
}

// Where a passage is sent, for the admin's test to show.
export function speechEndpoint(backend: Pick<TtsBackend, "provider" | "v1">, voice: string): string {
  return backend.provider === "elevenlabs" ? elevenLabsSpeechUrl(backend.v1, voice || "{voice}") : `${backend.v1}/audio/speech`;
}

// `group` heads a run of voices in the picker (ElevenLabs: the account's
// own, the library's, ElevenLabs' set).
export type TtsVoice = { id: string; label: string; group?: string };

// A voice list as servers answer it: Kokoro-FastAPI sends { voices: [ids] },
// others send objects, or OpenAI's { data: [...] } envelope.
export function parseVoiceList(payload: unknown): string[] {
  const root = payload as { voices?: unknown; data?: unknown } | unknown[] | null;
  const list = Array.isArray(root) ? root : Array.isArray(root?.voices) ? root.voices : Array.isArray(root?.data) ? root.data : [];
  const ids: string[] = [];
  for (const entry of list) {
    const id =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? ((entry as Record<string, unknown>).id ?? (entry as Record<string, unknown>).voice_id ?? (entry as Record<string, unknown>).name)
          : null;
    if (typeof id === "string" && id.trim() && id.length <= 120 && !ids.includes(id.trim())) {
      ids.push(id.trim());
    }
  }
  return ids.slice(0, 400);
}

// The picker's list: the curated voices this server really has first, under
// their friendly names, then everything else it reports by id. A server
// that describes its voices (ElevenLabs) is listed as it describes them.
export function labelVoices(ids: string[], details: readonly ElevenLabsVoice[] = []): TtsVoice[] {
  if (details.length) {
    return details.map((voice) => ({ id: voice.id, label: elevenLabsVoiceLabel(voice), group: elevenLabsVoiceGroup(voice) }));
  }
  const curated: TtsVoice[] = TTS_VOICES.filter((voice) => ids.includes(voice.id)).map((voice) => ({ id: voice.id, label: voice.label }));
  const known = new Set(curated.map((voice) => voice.id));
  return [...curated, ...ids.filter((id) => !known.has(id)).map((id) => ({ id, label: id }))];
}

// What a server offers when it will not say: Kokoro's shipped voices, or
// OpenAI's documented ones. An unknown compatible server offers nothing and
// the picker falls back to typing a voice.
export function fallbackVoices(backend: Pick<TtsBackend, "provider" | "v1">): string[] {
  if (backend.provider === "kokoro") {
    return TTS_VOICES.map((voice) => voice.id);
  }
  return isOpenAiHost(backend.v1) ? OPENAI_TTS_VOICES : [];
}

// The voice actually asked for. Campaigns, personalities and NPCs made on a
// Kokoro server carry Kokoro voice ids; on a server that has no such voice
// they would fail every passage, so a Kokoro id the server does not list
// becomes the server's default voice. Anything else is sent as written: a
// custom voice string is the server's to understand.
//
// ElevenLabs takes nothing but its own ids, so anything else it is asked
// for (af_heart, alloy, a blend) is its default voice. An id of its shape is
// sent even when unlisted: the list stops at a few hundred of an account's
// voices (serverVoices), and one it lacks after all is answered with
// voice_not_found, which synthesizeSpeech reads in the default voice.
export function effectiveVoice(voice: string, backend: Pick<TtsBackend, "provider" | "defaultVoice">, serverVoices: string[]): string {
  const asked = voice.trim() || backend.defaultVoice;
  if (backend.provider === "elevenlabs") {
    return serverVoices.includes(asked) || isElevenLabsVoiceId(asked) || !backend.defaultVoice ? asked : backend.defaultVoice;
  }
  if (!backend.defaultVoice || backend.provider === "off") {
    return asked;
  }
  // A voice cast while the server was ElevenLabs, after it went back.
  if (backend.provider === "kokoro") {
    return isElevenLabsVoiceId(asked) ? backend.defaultVoice : asked;
  }
  const foreign = TTS_VOICES.some((entry) => entry.id === asked) || isElevenLabsVoiceId(asked);
  return foreign && !serverVoices.includes(asked) ? backend.defaultVoice : asked;
}

// Whether a saved voice is one this kind of server can speak at all: an
// ElevenLabs account has no af_heart, and Kokoro no ElevenLabs id. A table
// cast on one kind is cast again on the other (src/lib/tts-roster.ts)
// instead of every character being read in the narrator's voice. An
// OpenAI-kind server takes custom voices no rule can tell apart.
export function voiceFits(voiceId: string, provider: TtsProvider): boolean {
  if (provider === "elevenlabs") {
    return isElevenLabsVoiceId(voiceId);
  }
  return provider !== "kokoro" || !isElevenLabsVoiceId(voiceId);
}

// Why a render failed, in words for the table (issue 88). Never the key, and
// never more of an upstream body than a sentence.
export function describeSpeechFailure(error: unknown, backend: Pick<TtsBackend, "provider" | "v1">): string {
  const where = backend.provider === "kokoro" ? "The Kokoro speech server" : backend.provider === "elevenlabs" ? "ElevenLabs" : "The speech server";
  if (error instanceof SpeechHttpError && backend.provider === "elevenlabs") {
    return describeElevenLabsRefusal(error.status, error.code, error.detail);
  }
  if (error instanceof SpeechHttpError) {
    if (error.status === 401 || error.status === 403) {
      return `${where} refused the API key (HTTP ${error.status}).`;
    }
    if (error.status === 404) {
      return `${where} has no speech endpoint at ${backend.v1}/audio/speech (HTTP 404).`;
    }
    const detail = error.detail ? `: ${error.detail}` : "";
    return `${where} answered HTTP ${error.status}${detail}`.replace(/\.?$/, ".");
  }
  if (isSpeechTimeout(error)) {
    return `${where} took too long to answer.`;
  }
  if (error instanceof SpeechEmptyError) {
    return `${where} answered without any audio.`;
  }
  if (error instanceof SpeechSetupError) {
    return error.message;
  }
  return `${where} could not be reached at ${hostOf(backend.v1)}.`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Plain fields, not parameter properties: the test scripts load this file
// through Node's type stripping, which has no such syntax.
export class SpeechHttpError extends Error {
  status: number;
  detail: string;
  // The server's own name for the refusal, when it gives one (ElevenLabs'
  // detail.status: "quota_exceeded", "voice_not_found").
  code: string;
  constructor(status: number, detail: string, code = "") {
    super(`Speech request failed: HTTP ${status}${code ? ` ${code}` : ""}${detail ? ` ${detail}` : ""}`);
    this.name = "SpeechHttpError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export class SpeechEmptyError extends Error {
  constructor() {
    super("Speech request returned no audio.");
    this.name = "SpeechEmptyError";
  }
}

// A server that is not set up far enough to be asked, refused before any
// request in words that say what to set and where.
export class SpeechSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechSetupError";
  }
}

// An OpenAI-compatible server with no model picked. ElevenLabs lists no
// models to a key without that permission, so its model is typed.
export class SpeechModelMissingError extends SpeechSetupError {
  constructor(provider: TtsProvider = "openai") {
    super(
      provider === "elevenlabs"
        ? "No ElevenLabs model is set for narration. Type the model's id in Admin > Speech."
        : "No narration model is picked for this server. Choose one from its list in Admin > Speech.",
    );
    this.name = "SpeechModelMissingError";
  }
}

// The one sentence of an upstream error body worth repeating.
export function upstreamDetail(body: string): string {
  let text = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string; detail?: unknown; message?: unknown };
    const found =
      (typeof parsed.error === "object" && parsed.error ? parsed.error.message : parsed.error) ?? parsed.detail ?? parsed.message;
    if (typeof found === "string") {
      text = found;
    } else if (found !== undefined) {
      text = JSON.stringify(found);
    }
  } catch {
    // Not JSON: an HTML error page says nothing a table can use.
    if (/<\s*(html|!doctype)/i.test(body)) {
      return "";
    }
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

// How long one speech request may take before it is given up on. A stalled
// provider used to hold a table's narration lane for three minutes per
// passage, so the voice fell further behind the text with every turn. The
// wait now grows with the passage, from a short floor to a modest ceiling:
// OpenAI's gpt-4o-mini-tts reads 950 characters in about 9 s, and Kokoro on a
// CPU is slower still, so the floor leaves room for both.
export const SPEECH_TIMEOUT_FLOOR_MS = 30_000;
export const SPEECH_TIMEOUT_CEILING_MS = 60_000;
const SPEECH_TIMEOUT_MS_PER_CHAR = 25;

export function speechTimeoutMs(characters: number): number {
  const scaled = SPEECH_TIMEOUT_FLOOR_MS + Math.max(0, characters) * SPEECH_TIMEOUT_MS_PER_CHAR;
  return Math.min(SPEECH_TIMEOUT_CEILING_MS, scaled);
}

export function isSpeechTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export type SpeechRequestOptions = { timeoutMs?: number };

async function requestElevenLabsOnce(backend: TtsBackend, input: string, voice: string, speed: number, timeoutMs: number): Promise<Buffer> {
  const request = elevenLabsSpeechRequest(backend, input, voice, speed);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const refusal = readElevenLabsError(await response.text().catch(() => ""));
    throw new SpeechHttpError(response.status, refusal.message, refusal.code);
  }
  // Each clip's own tags would make a passage of several read as its first.
  const audio = bareMp3Frames(Buffer.from(await response.arrayBuffer()));
  if (!audio.length) {
    throw new SpeechEmptyError();
  }
  return audio;
}

async function requestSpeechOnce(backend: TtsBackend, input: string, voice: string, speed: number, timeoutMs: number): Promise<Buffer> {
  if (backend.provider === "elevenlabs") {
    return requestElevenLabsOnce(backend, input, voice, speed, timeoutMs);
  }
  const response = await fetch(`${backend.v1}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: backend.model, voice, input, response_format: "mp3", ...(speed !== 1 ? { speed } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new SpeechHttpError(response.status, upstreamDetail(await response.text().catch(() => "")));
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) {
    throw new SpeechEmptyError();
  }
  return audio;
}

// How long ElevenLabs is given to free a slot before a 429 is asked again.
const RATE_LIMIT_PAUSE_MS = 1_000;

// A request that timed out is asked once more: a provider that stalls on one
// request usually answers the next in seconds. So is one ElevenLabs answered
// with 429, after a pause: its plans cap how many requests run at once, and
// a passage's clips run two at a time beside every other table's. Any other
// failure is final.
async function requestSpeech(
  backend: TtsBackend,
  input: string,
  voice: string,
  speed: number,
  options: SpeechRequestOptions = {},
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? speechTimeoutMs(input.length);
  try {
    return await requestSpeechOnce(backend, input, voice, speed, timeoutMs);
  } catch (error) {
    if (backend.provider === "elevenlabs" && error instanceof SpeechHttpError && error.status === 429) {
      console.warn(`[tts] ElevenLabs answered 429 (${error.code || "rate limited"}); asking once more`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
      return requestSpeechOnce(backend, input, voice, speed, timeoutMs);
    }
    if (!isSpeechTimeout(error)) {
      throw error;
    }
    console.warn(`[tts] speech request timed out after ${timeoutMs} ms; asking once more`);
    return requestSpeechOnce(backend, input, voice, speed, timeoutMs);
  }
}

// The model a passage is asked for: the one picked (or TTS_MODEL), else, on
// an OpenAI-compatible server that is not OpenAI itself, the only model it
// lists, the way dictation's Whisper service runs its one (src/lib/stt.ts).
// OpenAI lists dozens, so nothing is taken from its list. "" when there is
// none: nothing is sent, and the readiness checks say narration is not
// ready (src/lib/capabilities.ts).
export async function narrationModel(backend: TtsBackend): Promise<string> {
  if (backend.model || backend.provider !== "openai" || isOpenAiHost(backend.v1)) {
    return backend.model;
  }
  return soleListedModel({ provider: "speech", baseUrl: backend.v1, apiKey: backend.apiKey });
}

// The backend with its model settled, for a caller that sends several clips
// or names the model (the usage ledger, the render cache, the admin's test).
export async function withNarrationModel(backend: TtsBackend): Promise<TtsBackend> {
  const model = await narrationModel(backend);
  return model === backend.model ? backend : { ...backend, model };
}

// One clip of speech from the configured server.
export async function synthesizeSpeech(
  input: string,
  voice: string,
  speed = 1,
  configured: TtsBackend = ttsBackend(),
  options: SpeechRequestOptions = {},
): Promise<Buffer> {
  if (configured.provider === "off") {
    throw new Error("Narration is switched off on this server.");
  }
  const backend = await withNarrationModel(configured);
  if (!backend.model) {
    throw new SpeechModelMissingError(backend.provider);
  }
  const listing =
    backend.provider === "elevenlabs" && backend.defaultVoice
      ? voicesAtHand(backend)
      : backend.provider === "openai" || backend.provider === "elevenlabs"
        ? await serverVoices(backend)
        : NO_VOICES;
  const defaultVoice = backend.defaultVoice || listedDefaultVoice(listing);
  const chosen = effectiveVoice(voice, { ...backend, defaultVoice }, listing.ids);
  if (backend.provider !== "elevenlabs") {
    // Only ElevenLabs reads audio tags; any other server would say them.
    return requestSpeech(backend, stripAudioTags(input) || input, chosen, speed, options);
  }
  if (!chosen) {
    throw new SpeechSetupError("No ElevenLabs voice is set for narration. Choose a default voice in Admin > Speech.");
  }
  try {
    return await requestSpeech(backend, input, chosen, speed, options);
  } catch (error) {
    // A voice removed from the account, or an id typed by hand that it never
    // had: the line is read in the default voice rather than lost with the
    // rest of its passage.
    if (error instanceof SpeechHttpError && error.code === "voice_not_found" && defaultVoice && chosen !== defaultVoice) {
      console.warn(`[tts] ElevenLabs has no voice ${chosen}; reading the line in the default voice`);
      return requestSpeech(backend, input, defaultVoice, speed, options);
    }
    throw error;
  }
}

// What a server lists: its voice ids, whether it listed them itself, and,
// from a server that describes its voices (ElevenLabs), what each sounds
// like, for the pickers' labels and for casting.
export type VoiceListing = { ids: string[]; listed: boolean; details: ElevenLabsVoice[] };

const NO_VOICES: VoiceListing = { ids: [], listed: false, details: [] };

// The voice a server with no default named reads in: on ElevenLabs one of
// its own storytellers, elsewhere the first voice the server lists, as the
// admin form says.
export function listedDefaultVoice(listing: VoiceListing): string {
  return listing.details.length ? suggestedElevenLabsVoice(listing.details) : (listing.ids[0] ?? "");
}

type VoiceCacheEntry = VoiceListing & { at: number };

declare global {
  var __odmTtsVoices: Map<string, VoiceCacheEntry> | undefined;
  var __odmTtsVoicesInFlight: Map<string, Promise<VoiceListing>> | undefined;
}

const VOICE_CACHE_MS = 60_000;
// ElevenLabs' list takes a few seconds to page through and changes only
// when someone saves a voice, so it is kept half an hour, and an old one is
// served while the next is fetched behind it.
const ELEVENLABS_VOICE_CACHE_MS = 30 * 60_000;
// An account can hold thousands of library voices; the picker and casting
// need a few hundred. The account's own voices and ElevenLabs' set are
// listed whole beside them.
const ELEVENLABS_LIBRARY_CAP = 300;

// The voices the server lists, with whether it listed them itself. Kept a
// minute per address: every passage asks on an OpenAI-kind server, and the
// picker asks whenever a settings panel opens.
export async function serverVoices(backend: TtsBackend = ttsBackend(), fresh = false): Promise<VoiceListing> {
  if (backend.provider === "off") {
    return NO_VOICES;
  }
  const cache = (globalThis.__odmTtsVoices ??= new Map());
  const key = voiceCacheKey(backend);
  const hit = cache.get(key);
  const keep = backend.provider === "elevenlabs" && hit?.listed ? ELEVENLABS_VOICE_CACHE_MS : VOICE_CACHE_MS;
  if (!fresh && hit && Date.now() - hit.at < keep) {
    return hit;
  }
  if (!fresh && hit?.listed && backend.provider === "elevenlabs") {
    void listVoicesOnce(backend, key);
    return hit;
  }
  return listVoicesOnce(backend, key);
}

// Two ElevenLabs keys are two accounts with different voices.
function voiceCacheKey(backend: TtsBackend): string {
  const account = backend.provider === "elevenlabs" ? `|${createHash("sha256").update(backend.apiKey).digest("hex").slice(0, 12)}` : "";
  return `${backend.provider}|${backend.v1}${account}`;
}

// The voices already listed, without waiting for a listing: ElevenLabs'
// takes seconds to page through, and a clip with a default voice set needs
// the list only to swap a voice the account cannot have, which the id's
// shape already tells (effectiveVoice). The list is fetched behind it for
// the next clip and for casting.
function voicesAtHand(backend: TtsBackend): VoiceListing {
  const hit = globalThis.__odmTtsVoices?.get(voiceCacheKey(backend));
  void serverVoices(backend).catch(() => undefined);
  return hit ?? NO_VOICES;
}

// Fetches ElevenLabs' voices ahead of the first passage, for a caller that
// sees the server is set up (src/lib/capabilities.ts), so the first table to
// cast a voice does not wait the seconds a cold listing takes.
export function warmVoices(backend: TtsBackend): void {
  if (backend.provider === "elevenlabs" && backend.apiKey) {
    voicesAtHand(backend);
  }
}

// One listing per server at a time: a passage's clips ask together.
function listVoicesOnce(backend: TtsBackend, key: string): Promise<VoiceListing> {
  const inFlight = (globalThis.__odmTtsVoicesInFlight ??= new Map());
  const running = inFlight.get(key);
  if (running) {
    return running;
  }
  const listing = listVoices(backend, key).finally(() => inFlight.delete(key));
  inFlight.set(key, listing);
  return listing;
}

async function listVoices(backend: TtsBackend, key: string): Promise<VoiceListing> {
  const cache = (globalThis.__odmTtsVoices ??= new Map());
  if (backend.provider === "elevenlabs") {
    const details = await listElevenLabsVoices(backend);
    const previous = cache.get(key);
    if (!details.length && previous?.listed) {
      // A blip keeps the voices already known, and is asked again in a
      // minute rather than in half an hour.
      cache.set(key, { ...previous, at: Date.now() - ELEVENLABS_VOICE_CACHE_MS + VOICE_CACHE_MS });
      return previous;
    }
    const listing: VoiceListing = { ids: details.map((voice) => voice.id), listed: details.length > 0, details };
    cache.set(key, { ...listing, at: Date.now() });
    return listing;
  }
  let ids: string[] = [];
  let listed = false;
  // OpenAI itself has no such endpoint; asking only spends a round trip.
  if (!isOpenAiHost(backend.v1)) {
    try {
      const response = await fetch(`${backend.v1}/audio/voices`, {
        cache: "no-store",
        headers: speechAuthHeaders(backend),
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        ids = parseVoiceList(await response.json().catch(() => null));
        listed = ids.length > 0;
      }
    } catch {
      // Unreachable or not a server that lists voices: the fallback below.
    }
  }
  if (!listed) {
    ids = fallbackVoices(backend);
  }
  const listing: VoiceListing = { ids, listed, details: [] };
  cache.set(key, { ...listing, at: Date.now() });
  return listing;
}

// The account's voices from /v2/voices, a kind at a time and all kinds at
// once: the default listing is newest first, so a cap on it alone would
// drop the account's own voices and ElevenLabs' set behind three hundred
// library saves. [] when nothing answered.
async function listElevenLabsVoices(backend: TtsBackend): Promise<ElevenLabsVoice[]> {
  const headers = speechAuthHeaders(backend);
  const pages = async (voiceType: ElevenLabsVoiceType, cap: number): Promise<ElevenLabsVoice[]> => {
    const found: ElevenLabsVoice[] = [];
    let token = "";
    do {
      const response = await fetch(elevenLabsVoicesUrl(backend.v1, voiceType, cap - found.length, token), {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        const refusal = readElevenLabsError(await response.text().catch(() => ""));
        throw new SpeechHttpError(response.status, refusal.message, refusal.code);
      }
      const page = parseElevenLabsVoices(await response.json().catch(() => null));
      found.push(...page.voices);
      token = page.voices.length ? page.next : "";
    } while (token && found.length < cap);
    return found;
  };
  const kinds = await Promise.allSettled([
    pages("personal", 100),
    pages("workspace", 100),
    pages("default", 100),
    pages("non-default", ELEVENLABS_LIBRARY_CAP),
  ]);
  const listed = kinds.flatMap((kind) => (kind.status === "fulfilled" ? kind.value : []));
  if (!listed.length) {
    const reason = kinds.find((kind) => kind.status === "rejected");
    console.warn(`[tts] ElevenLabs listed no voices${reason?.status === "rejected" ? `: ${(reason.reason as Error)?.message ?? reason.reason}` : ""}`);
  }
  return sortElevenLabsVoices(listed);
}

// The Kokoro service that reads the rest of a passage ElevenLabs turned
// away, with a voice for each ElevenLabs one, or null: the refusal was not
// that kind, or no Kokoro answers here (then the passage fails as before).
// Each ElevenLabs voice keeps its gender, from the account's labels, so the
// women at the table are still read by women.
export type StandIn = { backend: TtsBackend; voice: (voice: string) => string };

const KOKORO_PROBE_MS = 1_500;

export async function elevenLabsStandIn(error: unknown, primary: TtsBackend): Promise<StandIn | null> {
  if (primary.provider !== "elevenlabs" || !(error instanceof SpeechHttpError) || !elevenLabsTurnedAway(error.status, error.code)) {
    return null;
  }
  const kokoro = kokoroBackend();
  try {
    const response = await fetch(`${kokoro.v1.replace(/\/v\d+$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(KOKORO_PROBE_MS) });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      return null;
    }
  } catch {
    return null;
  }
  console.warn(`[tts] ElevenLabs turned narration away (HTTP ${error.status}${error.code ? ` ${error.code}` : ""}); reading the rest of the passage with Kokoro`);
  // The voices already listed: a passage that has just been turned away is
  // not kept waiting on a listing.
  const traits = elevenLabsTraits(voicesAtHand(primary).details);
  const pool = castingPool(TTS_VOICES.map((entry) => entry.id), kokoro.defaultVoice);
  return {
    backend: kokoro,
    voice: (voice) => {
      if (isKokoroVoiceId(voice)) {
        return voice;
      }
      const gender = traits.get(voice)?.gender ?? "";
      return gender ? pickVoice(voice, gender, pool, []) : kokoro.defaultVoice;
    },
  };
}
