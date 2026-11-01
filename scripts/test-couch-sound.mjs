// A couch night's sound pack (src/lib/couch/sound-catalog.ts and
// src/lib/couch/sound-logic.ts):
//
//   the pack's places, score and stings are offered to a couch night and
//   only to it, and an ordinary table's lists are the upstream library's;
//   the GM's tools name the pack's places, never the sailing ship;
//   a place filed under an upstream kind is heard as the nearest couch one,
//   and a place with no kind as the ship's corridor;
//   set_ambience and play_sting refuse a sound outside the pack;
//   every mood's score cue is in the pack, and every pack cue has a file.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-sound");

const world = await openWorld({ gameSettings: { couchMode: true, ambienceEnabled: true, ambienceAuto: true } });
const { AMBIENCE_CUES, cueIds, sceneIds } = await import("../src/lib/ambience/catalog.ts");
const { COUCH_SOUND_CUES, COUCH_SOUND_PACK_LIST } = await import("../src/lib/couch/sound-catalog.ts");
const { COUCH_DEFAULT_BED, couchBed, couchSoundPack, couchSoundTool } = await import("../src/lib/couch/sound-logic.ts");
const { COUCH_MOODS, moodCue } = await import("../src/lib/couch/mood-logic.ts");
const { followSceneAmbience, handlePlaySting, handleSetAmbience } = await import("../src/lib/dm/ambience-tools.ts");
const { getAmbience } = await import("../src/lib/db/ambience.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");
const { movePartyTool } = await import("../src/lib/dm/prompt.ts");

const pack = "scifi_horror";
// The test world moves the working directory; the library is the repo's.
const LIBRARY = fileURLToPath(new URL("../public/ambience/", import.meta.url));
const ordinary = () => ({ ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } });

await test("a couch night plays the pack, an ordinary table the upstream library", () => {
  assert.equal(couchSoundPack(world.campaign()), pack);
  assert.equal(couchSoundPack(ordinary()), null);
  const couchScenes = sceneIds(pack);
  for (const id of ["hull", "engineering", "medbay", "derelict", "seafloor"]) assert.ok(couchScenes.includes(id), id);
  for (const id of ["ship", "tavern", "dungeon", "coast"]) assert.ok(!couchScenes.includes(id), `${id} is offered to a couch night`);
  assert.ok(couchScenes.includes("plains"), "a colony's fields are shared");
  assert.ok(!sceneIds().includes("hull"), "the upstream list has no pack places");
  assert.ok(sceneIds().includes("ship"));
  assert.ok(!cueIds("music").some((id) => id.startsWith("score_")));
  assert.ok(cueIds("music", pack).every((id) => id.startsWith("score_")), "the couch score is all its own");
});

await test("every pack cue is complete, uniquely named and has a file", () => {
  const ids = AMBIENCE_CUES.map((cue) => cue.id);
  assert.equal(new Set(ids).size, ids.length, "two cues share an id");
  const manifest = JSON.parse(readFileSync(`${LIBRARY}manifest.json`, "utf8")).tracks;
  for (const cue of COUCH_SOUND_CUES) {
    assert.match(cue.id, /^[a-z][a-z_]*$/);
    assert.ok(COUCH_SOUND_PACK_LIST.some((entry) => entry.id === cue.pack), `${cue.id} names no pack`);
    assert.ok(cue.prompt && cue.label && cue.blurb && cue.keywords.length, `${cue.id} is incomplete`);
    assert.ok(manifest[cue.id]?.length, `${cue.id} has no file in the manifest`);
    for (const entry of manifest[cue.id]) assert.ok(existsSync(`${LIBRARY}${entry.file}`), entry.file);
  }
});

await test("every pack scores every mood, and plays its own places and the ones it shares", () => {
  assert.equal(moodCue("fight", 2), "score_finale");
  for (const entry of COUCH_SOUND_PACK_LIST) {
    const music = new Set(cueIds("music", entry.id));
    for (const mood of COUCH_MOODS) {
      const cue = moodCue(mood, 0, entry.scorePrefix);
      assert.ok(music.has(cue), `${entry.id}: ${mood} plays ${cue}, which it does not have`);
    }
    assert.ok(music.has(moodCue("fight", 2, entry.scorePrefix)), `${entry.id} has no finale`);
    assert.ok(sceneIds(entry.id).length >= 6, `${entry.id} has few places`);
    assert.ok(cueIds("sting", entry.id).length >= 7, `${entry.id} has few stings`);
    for (const id of entry.shared) assert.ok(AMBIENCE_CUES.some((cue) => cue.id === id), `${entry.id} shares unknown ${id}`);
  }
  for (const entry of COUCH_SOUND_PACK_LIST) {
    assert.ok(sceneIds(entry.id).includes(entry.defaultBed), `${entry.id}'s default place is not its own`);
    assert.equal(couchBed("ship", entry.id), entry.id === pack ? "hull" : entry.id === "cosmic_horror" ? "ship" : entry.defaultBed);
    assert.equal(couchBed(null, entry.id), entry.defaultBed);
  }
  // A thriller borrows nothing it did not ask for.
  assert.ok(!sceneIds("thriller").includes("hull"));
  assert.ok(sceneIds("survival_horror").includes("parking_garage"), "a pack can share another pack's place");
});

await test("the GM's tools name the pack's places on a couch night", () => {
  const tool = (tools, name) => tools.find((entry) => entry.function?.name === name);
  const couch = dmTurnTools(world.campaign(), false, false, false);
  for (const name of ["update_location", "set_ambience", "play_sting"]) assert.ok(tool(couch, name), `${name} is offered`);
  assert.deepEqual(tool(couch, "update_location").function.parameters.properties.scene.enum, sceneIds(pack));
  assert.match(tool(couch, "update_location").function.parameters.properties.scene.description, /hull/);
  assert.ok(!tool(couch, "set_ambience").function.parameters.properties.bed.enum.includes("ship"));
  assert.ok(tool(couch, "play_sting").function.parameters.properties.cue.enum.includes("tracker_ping"));
  const moved = couchSoundTool(movePartyTool, pack);
  assert.deepEqual(moved.function.parameters.properties.scene.enum, sceneIds(pack));
  assert.ok(movePartyTool.function.parameters.properties.scene.enum.includes("ship"), "the upstream tool is untouched");
  const plain = dmTurnTools(ordinary(), false, false, false);
  assert.ok(tool(plain, "update_location").function.parameters.properties.scene.enum.includes("ship"));
});

await test("an upstream place is heard as the nearest couch one", () => {
  assert.equal(couchBed("ship", pack), "hull");
  assert.equal(couchBed("forge", pack), "engineering");
  assert.equal(couchBed("medbay", pack), "medbay");
  assert.equal(couchBed("plains", pack), "plains");
  assert.equal(couchBed(null, pack), COUCH_DEFAULT_BED);
  assert.equal(couchBed("no_such_place", pack), COUCH_DEFAULT_BED);
  followSceneAmbience(world.campaign(), "ship");
  assert.equal(getAmbience(world.campaignId).bed, "hull");
  followSceneAmbience(world.campaign(), null);
  assert.equal(getAmbience(world.campaignId).bed, "hull");
  followSceneAmbience(world.campaign(), "cryo");
  assert.equal(getAmbience(world.campaignId).bed, "cryo");
});

await test("set_ambience and play_sting refuse a sound outside the pack", () => {
  assert.equal(handleSetAmbience(world.campaign(), JSON.stringify({ bed: "ship" })).retry, true);
  assert.equal(handleSetAmbience(world.campaign(), JSON.stringify({ music: "battle" })).retry, true);
  assert.equal(handleSetAmbience(world.campaign(), JSON.stringify({ bed: "engineering" })).error, undefined);
  assert.equal(getAmbience(world.campaignId).bed, "engineering");
  assert.equal(handlePlaySting(world.campaign(), JSON.stringify({ cue: "wolf_howl" })).retry, true);
  assert.equal(handlePlaySting(world.campaign(), JSON.stringify({ cue: "tracker_ping" })).error, undefined);
  assert.equal(handlePlaySting(world.campaign(), JSON.stringify({ cue: "heartbeat" })).error, undefined, "shared stings play");
  assert.equal(handleSetAmbience(ordinary(), JSON.stringify({ bed: "ship" })).error, undefined, "an ordinary table keeps its ship");
});

finish();
