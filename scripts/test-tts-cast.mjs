// Casting voices (issue 97): which of the server's voices a speaker without
// one is given. Deterministic, of the right sort when that is known, and as
// different from the rest of the table as the server allows.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const { castingPool, pickVoice, voiceGender } = await import("../src/lib/tts-cast.ts");
const { genderMark } = await import("../src/lib/gender.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
}

const KOKORO = ["af_heart", "af_bella", "af_v0bella", "am_michael", "am_fenrir", "am_santa", "bf_emma", "bm_george", "jf_alpha", "ef_dora", "am_adam"];

test("the pool is the narrator's language, without the narrator, old takes and novelties", () => {
  const pool = castingPool(KOKORO, "af_heart");
  assert.ok(!pool.includes("af_heart"), "nobody shares the narrator's voice");
  assert.ok(!pool.includes("af_v0bella") && !pool.includes("am_santa"));
  assert.ok(!pool.includes("jf_alpha") && !pool.includes("ef_dora"), "an English table is not cast in Japanese");
  assert.ok(pool.indexOf("af_bella") < pool.indexOf("am_adam"), "the shipped voices come first");
  assert.deepEqual(castingPool(KOKORO, "ef_dora"), [], "a Spanish narrator is cast from Spanish voices only");
  assert.deepEqual(castingPool(["alloy", "nova", "onyx"], "alloy"), ["nova", "onyx"], "a server with its own names is taken as it is");
});

test("a voice says what it sounds like, and a gender field which voice it asks for", () => {
  assert.equal(voiceGender("af_heart"), "f");
  assert.equal(voiceGender("bm_george"), "m");
  assert.equal(voiceGender("onyx"), "m");
  assert.equal(voiceGender("af_heart(30)+af_bella(70)"), "");
  assert.equal(genderMark("Female"), "f");
  assert.equal(genderMark("Male"), "m");
  assert.equal(genderMark("Nonbinary"), "");
  assert.equal(genderMark(""), "");
});

test("a pick suits the speaker, is stable, and avoids voices already taken", () => {
  const pool = castingPool(KOKORO, "af_heart");
  const first = pickVoice("Old Pike", "m", pool, []);
  assert.equal(voiceGender(first), "m");
  assert.equal(pickVoice("Old Pike", "m", pool, []), first, "the same speaker is always cast the same way");
  const taken = [];
  for (const name of ["Pike", "Aldric", "Bram"]) {
    taken.push(pickVoice(name, "m", pool, taken));
  }
  assert.equal(new Set(taken).size, 3, "three men, three voices, while the server has them");
  assert.ok(taken.every((voice) => ["am_michael", "am_fenrir", "bm_george"].includes(voice)), "the named voices go first");
  assert.equal(voiceGender(pickVoice("Wren", "", pool, [])) !== "", true);
  assert.equal(pickVoice("Wren", "f", [], []), "", "a server with no voices casts no one");
  assert.equal(pickVoice("Wren", "f", ["onyx"], []), "onyx", "with nothing suitable, any voice beats none");
});

const { unvoicedSpeakers } = await import("../src/lib/tts.ts");

test("a voice is cast for whoever the stored lines say spoke, or the one the passage is spoken as", () => {
  const entry = (key, name) => ({ key, kind: "npc", name, aliases: [], portraitUrl: "", ownerUserId: "", gender: "", voice: null });
  const roster = [entry("npc:marla", "Marla"), entry("npc:pike", "Old Pike"), entry("monster:goblin", "Goblin")];
  const lines = [{ line: "We go,", speaker: { kind: "npc", id: "marla", name: "Marla" } }];
  assert.deepEqual([...unvoicedSpeakers(lines, roster, null)], ["npc:marla"], "Pike, only spoken to, has no line");
  assert.deepEqual([...unvoicedSpeakers([], roster, { kind: "monster", id: "e2", name: "Goblin 2" })], ["monster:goblin"]);
});

// ElevenLabs ids say nothing about the voice; its labels do.
const { elevenLabsTraits } = await import("../src/lib/tts-elevenlabs-logic.ts");
const { voiceFits } = await import("../src/lib/tts-backend.ts");
const described = (id, gender, language, useCase) => ({ id, name: id, category: "professional", own: false, gender, genderLabel: "", language, accent: "", age: "", descriptive: "", useCase });
const NARRATOR = "Narrator000000000000";
const ELEVEN = [
  described(NARRATOR, "m", "en", "narrative_story"),
  described("WomanStory0000000000", "f", "en", "narrative_story"),
  described("WomanAdvert000000000", "f", "en", "advertisement"),
  described("ManCharacter00000000", "m", "en", "characters_animation"),
  described("ManPodcast0000000000", "m", "en", "conversational"),
  described("ManSpanish0000000000", "m", "es", "narrative_story"),
  described("Experiment0000000000", "", "en", ""),
  { ...described("WomanCute00000000000", "f", "en", "characters_animation"), descriptive: "cute" },
];
const ids = ELEVEN.map((voice) => voice.id);
const traits = elevenLabsTraits(ELEVEN);

test("an ElevenLabs table is cast from labelled voices in the narrator's language, character voices first", () => {
  const pool = castingPool(ids, NARRATOR, traits);
  assert.ok(!pool.includes(NARRATOR), "nobody shares the narrator's voice");
  assert.ok(!pool.includes("ManSpanish0000000000"), "an English table is not cast in Spanish");
  assert.ok(!pool.includes("Experiment0000000000"), "a voice that does not say what it is is left out");
  assert.deepEqual(pool.slice(0, 2).sort(), ["ManCharacter00000000", "WomanStory0000000000"]);
  assert.equal(voiceGender("WomanAdvert000000000", traits), "f");
  assert.equal(voiceGender("WomanAdvert000000000"), "", "without the labels the id says nothing");
});

test("an ElevenLabs pick suits the speaker and prefers a voice made for characters", () => {
  const pool = castingPool(ids, NARRATOR, traits);
  assert.equal(pickVoice("Captain Reyes", "f", pool, [], traits), "WomanStory0000000000");
  const next = pickVoice("Captain Reyes", "f", pool, ["WomanStory0000000000"], traits);
  assert.ok(next !== "WomanStory0000000000" && voiceGender(next, traits) === "f", "another woman when the first is taken");
  assert.equal(pickVoice("Dawes", "m", pool, [], traits), "ManCharacter00000000");
  assert.equal(traits.get("WomanCute00000000000").preferred, false, "a bubbly cartoon voice is not cast first");
  assert.ok(pool.indexOf("WomanCute00000000000") > pool.indexOf("WomanStory0000000000"));
});

test("a voice saved on another kind of server is no voice, and its speaker is cast again", () => {
  assert.equal(voiceFits("af_heart", "elevenlabs"), false);
  assert.equal(voiceFits("JBFqnCBsd6RMkjVDRZzb", "elevenlabs"), true);
  assert.equal(voiceFits("JBFqnCBsd6RMkjVDRZzb", "kokoro"), false);
  assert.equal(voiceFits("af_heart(30)+af_bella(70)", "kokoro"), true);
  assert.equal(voiceFits("anything at all", "openai"), true);
  const entry = (key, name, voiceId) => ({ key, kind: "npc", name, aliases: [], portraitUrl: "", ownerUserId: "", gender: "", voice: voiceId ? { voiceId, speed: 1 } : null });
  const roster = [entry("npc:marla", "Marla", "bf_emma"), entry("npc:pike", "Old Pike", "JBFqnCBsd6RMkjVDRZzb")];
  const lines = [
    { line: "We go,", speaker: { kind: "npc", id: "marla", name: "Marla" } },
    { line: "Fine.", speaker: { kind: "npc", id: "pike", name: "Old Pike" } },
  ];
  assert.deepEqual([...unvoicedSpeakers(lines, roster, null)], [], "by default a saved voice is a voice");
  assert.deepEqual([...unvoicedSpeakers(lines, roster, null, (voiceId) => voiceFits(voiceId, "elevenlabs"))], ["npc:marla"]);
});

console.log(`test-tts-cast: ${passed} passed`);
