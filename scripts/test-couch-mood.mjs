// A couch night's music follows its mood (src/lib/couch/mood-logic.ts and
// src/lib/couch/mood.ts):
//
//   the mood climbs at once and comes down only after it has played a while,
//   and the GM's own set_mood comes down after a short guard instead;
//   an attack that worked is a fight, a refused one is nothing;
//   a fight in the last act is the big one;
//   until the GM names a mood in an act, the act sets the floor;
//   set_mood and the tools put the mood's music on the TV, leave a held
//   music layer alone, and are refused at an ordinary table;
//   a couch fight's end no longer silences the music it started.
import assert from "node:assert/strict";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-mood");

const world = await openWorld({ gameSettings: { couchMode: true, ambienceEnabled: true, ambienceAuto: true } });
const { MOOD_DWELL_MS, MOOD_GUARD_MS, baseMood, moodCue, moodPromptLine, steerMood, toolMood } = await import("../src/lib/couch/mood-logic.ts");
const { noteCouchMoodTool, settleCouchMood } = await import("../src/lib/couch/mood.ts");
const { handleSetMood, couchTools } = await import("../src/lib/dm/couch-tools.ts");
const { followCombatAmbience, handleSetAmbience } = await import("../src/lib/dm/ambience-tools.ts");
const { getAmbience } = await import("../src/lib/db/ambience.ts");
const store = await import("../src/lib/couch/store.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");

store.beginCouchForge(world.campaignId, { players: 2, seed: "", offLimits: "" });
store.finishCouchForge(world.campaignId, { scenario: { acts: [{ title: "Boarding" }, { title: "The Hold" }, { title: "Last Shuttle" }] } }, []);

await test("the mood climbs at once and comes down only after the dwell", () => {
  const start = steerMood(null, "uneasy", { act: 0, now: 0 });
  const fight = steerMood(start, "fight", { act: 0, now: 1_000 });
  assert.equal(fight.mood, "fight", "rising is immediate");
  assert.equal(steerMood(fight, "uneasy", { act: 0, now: 1_000 + MOOD_DWELL_MS - 1 }).mood, "fight", "not before the dwell");
  assert.equal(steerMood(fight, "uneasy", { act: 0, now: 1_000 + MOOD_DWELL_MS }).mood, "uneasy");
});

await test("another blow restarts the dwell, so a long fight keeps its music", () => {
  const fight = steerMood(null, "fight", { act: 0, now: 0 });
  const blow = steerMood(fight, "fight", { act: 0, now: 80_000, renew: true });
  assert.equal(blow.since, 80_000);
  assert.equal(steerMood(blow, "uneasy", { act: 0, now: 80_000 + MOOD_DWELL_MS - 1 }).mood, "fight");
});

await test("the GM's word comes down after the short guard and becomes the act's base", () => {
  const fight = steerMood(null, "fight", { act: 1, now: 0 });
  assert.equal(steerMood(fight, "aftermath", { act: 1, now: MOOD_GUARD_MS - 1, stated: true }).mood, "fight");
  const after = steerMood(fight, "aftermath", { act: 1, now: MOOD_GUARD_MS, stated: true });
  assert.equal(after.mood, "aftermath");
  assert.equal(baseMood(after, 1), "aftermath");
  assert.equal(baseMood(after, 2), "dread", "a new act drops the old word for its own floor");
  assert.equal(baseMood(null, 0), "uneasy");
});

await test("only a tool that worked says something about the scene", () => {
  assert.equal(toolMood("pc_attack", "{}", { ok: true }), "fight");
  assert.equal(toolMood("pc_attack", "{}", { error: "No such enemy.", retry: true }), null);
  assert.equal(toolMood("apply_damage", "{}", { ok: true }), "danger");
  assert.equal(toolMood("start_scene", JSON.stringify({ kind: "chase" }), { ok: true }), "chase");
  assert.equal(toolMood("start_scene", JSON.stringify({ kind: "social" }), { ok: true }), null);
  assert.equal(toolMood("request_roll", "{}", { ok: true }), null);
});

await test("each mood has a music cue, and a last-act fight is the big one", () => {
  assert.equal(moodCue("dread", 0), "dread");
  assert.equal(moodCue("fight", 0), "battle");
  assert.equal(moodCue("fight", 2), "boss");
  assert.match(moodPromptLine(null), /set_mood/);
});

await test("set_mood puts the mood's music on the TV and an attack raises it", () => {
  const set = handleSetMood(world.campaign(), JSON.stringify({ mood: "dread" }));
  assert.equal(set.error, undefined, set.error);
  assert.equal(getAmbience(world.campaignId).music, "dread");
  noteCouchMoodTool(world.campaign(), "enemy_attack", "{}", { ok: true });
  assert.equal(store.getCouchMood(world.campaignId).mood, "fight");
  assert.equal(getAmbience(world.campaignId).music, "battle");
  // The turn ends straight after: too soon to drop the fight music.
  settleCouchMood(world.campaign());
  assert.equal(getAmbience(world.campaignId).music, "battle");
  // A couch fight's end no longer silences it (the mood owns the music).
  followCombatAmbience(world.campaign(), false);
  assert.equal(getAmbience(world.campaignId).music, "battle");
});

await test("a held music layer is left alone, and bad or out-of-place calls are refused", () => {
  assert.equal(handleSetAmbience(world.campaign(), JSON.stringify({ music: "sorrow", hold: true })).error, undefined);
  store.setCouchMood(world.campaignId, { mood: "calm", since: 0, stated: null, statedAct: 0 });
  noteCouchMoodTool(world.campaign(), "pc_attack", "{}", { ok: true });
  assert.equal(store.getCouchMood(world.campaignId).mood, "fight");
  assert.equal(getAmbience(world.campaignId).music, "sorrow", "held music stays");
  assert.equal(handleSetMood(world.campaign(), JSON.stringify({ mood: "jolly" })).retry, true);
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(handleSetMood(ordinary, JSON.stringify({ mood: "dread" })).refused, "rules");
});

await test("a couch table is offered set_mood and an ordinary one is not", () => {
  const names = (tools) => new Set(tools.map((tool) => tool.function.name));
  assert.ok(couchTools.some((tool) => tool.function.name === "set_mood"));
  assert.ok(names(dmTurnTools(world.campaign(), false, true, false)).has("set_mood"));
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.ok(!names(dmTurnTools(ordinary, false, true, false)).has("set_mood"));
});

finish();
