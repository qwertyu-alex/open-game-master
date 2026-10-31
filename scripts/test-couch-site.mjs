// The overhead night's map (docs/couch-overhead-spec.md, src/lib/couch/
// site-map-logic.ts, src/lib/couch/site.ts, src/components/couch/
// CouchSiteMap.tsx):
//
//   a written site is checked whole: zones that overlap, a door off its
//   wall, a room nobody can reach are each named; the written scenario that
//   plays on it is seated by the forge's own reader;
//   walls are drawn on every edge between zones except an open border;
//   the night starts black: only zones the crew has seen are sent, with
//   only their walls, and a hidden item, a foe behind a closed door or a
//   later act's threat never reach the players' view; the GM's has them;
//   a closed door blocks line of sight, an open one does not;
//   move_party walks a zone at a time through doors that open, at most two
//   zones a stealth turn, and the first move is to the crew's start;
//   set_border, move_foe, reveal, take_item and track change the map every
//   screen gets, and the GM reads all of it as SITE MAP;
//   the TV's camera shows the whole found site while it is readable, and
//   follows the scene with an overview once it is not;
//   the map is HTML: labelled zones, named tokens, portraits, no picture.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-site");
const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, mapsEnabled: false, ttsEnabled: false } });
const { checkSiteMap, lineOfSight, siteView, wallRuns, cameraFrame, stealthPath, borderStates, zoneByName } = await import("../src/lib/couch/site-map-logic.ts");
const { HADDON_OUTPOST: map } = await import("../src/lib/couch/sites/haddon-outpost.ts");
const { CouchSiteMap } = await import("../src/components/couch/CouchSiteMap.tsx");
const { writtenForge, WRITTEN_SCENARIOS } = await import("../src/lib/couch/scenarios/index.ts");
const { SITES, siteById } = await import("../src/lib/couch/sites/index.ts");
const { scenarioCard } = await import("../src/lib/couch/scenario-cards.ts");
const { beginCouchForge, setCouchAct } = await import("../src/lib/couch/store.ts");
const { couchSite, couchSitePrompt, handleSiteTool } = await import("../src/lib/couch/site.ts");
const { handleLocationCall, dmTurnTools } = await import("../src/lib/dm/turn.ts");
const campaigns = await import("../src/lib/db/campaigns.ts");
const { subscribe } = await import("../src/lib/events.ts");

const door = (a, b) => map.borders.findIndex((border) => (border.a === a && border.b === b) || (border.a === b && border.b === a));
const state = (extra = {}) => ({ act: 1, crew: [{ id: "kara", name: "Kara Okafor", zone: "spine-north" }], scene: "spine-north", visited: ["north-airlock", "north-corridor", "hub"], seen: [], borders: {}, moved: {}, found: [], pings: [], ...extra });

await test("the written site checks clean, a broken one names each mistake, and its scenario seats", () => {
  assert.deepEqual(checkSiteMap(map), []);
  const broken = {
    ...map,
    zones: [...map.zones, { id: "annex", name: "Annex", kind: "room", rects: [{ x: 18, y: 6, w: 2, h: 2 }], look: "" }, { id: "island", name: "Island", kind: "room", rects: [{ x: 37, y: 30, w: 2, h: 2 }], look: "" }],
    borders: [...map.borders, { a: "workshop", b: "mess", kind: "door", at: { x: 20, y: 8 } }],
  };
  const problems = checkSiteMap(broken).join("\n");
  assert.match(problems, /overlap/);
  assert.match(problems, /door workshop–mess: the zones do not touch/);
  assert.match(problems, /Island cannot be reached/);
  for (const site of SITES) assert.deepEqual(checkSiteMap(site), [], `${site.id} checks clean`);
  // Every night written for a site: its card says so, it seats every
  // player count it offers, and each of its places is one of the site's
  // zones, so the pictures, the sound and the whereabouts follow the map.
  const onMap = WRITTEN_SCENARIOS.filter((scenario) => scenario.site);
  assert.deepEqual(onMap.map((scenario) => scenario.id).sort(), ["dead-air", "haddon-outpost"]);
  for (const scenario of onMap) {
    const site = siteById(scenario.site);
    const card = scenarioCard(scenario.id);
    assert.ok(site, `${scenario.id}'s site exists`);
    assert.equal(card.onMap, true);
    assert.equal(card.mood[0], "Played on a map");
    for (const players of [card.players.min, card.players.max]) {
      const forge = writtenForge(scenario.id, players);
      assert.ok("forge" in forge, `${scenario.id} seats ${players}: ${forge.error ?? ""}`);
      for (const place of forge.forge.scenario.locations) assert.ok(zoneByName(site, place.name), `${scenario.id}: "${place.name}" is a zone`);
    }
  }
});

await test("walls stop at open borders, and a closed door blocks the view", () => {
  const walls = wallRuns(map);
  assert.equal(walls.some((wall) => wall.axis === "v" && wall.x === 16 && wall.y < 19 && wall.y + wall.length > 12), false);
  assert.equal(walls.some((wall) => wall.axis === "v" && wall.x === 17 && wall.y <= 9 && wall.y + wall.length >= 9), true);
  assert.equal(lineOfSight(map, "spine-north").has("hypersleep"), false);
  assert.equal(lineOfSight(map, "spine-north", new Map([[map.borders[door("hypersleep", "spine-north")], "open"]])).has("hypersleep"), true);
});

await test("the night starts black and the fog is applied before the view leaves the server", () => {
  const start = siteView(map, state({ crew: [{ id: "kara", name: "Kara", zone: "north-airlock" }], scene: "north-airlock", visited: [] }), "players");
  assert.deepEqual(start.zones.map((zone) => zone.id), ["north-airlock"], "only the airlock: its door is shut");
  assert.ok(start.walls.every((wall) => wall.y <= 5 && wall.x >= 17 && wall.x <= 23), "only the airlock's walls are sent");
  const players = siteView(map, state({ borders: { [door("hypersleep", "spine-north")]: "open" } }), "players");
  const names = players.tokens.map((token) => token.name);
  assert.ok(names.includes("Dead technician"), "a body in a zone the crew can see is shown");
  assert.ok(!names.includes("Lift keycard"), "a hidden item stays hidden until found");
  assert.ok(!names.includes("Feral Host"), "a foe behind a closed door is not sent");
  assert.ok(!names.includes("The Tenant"), "a later act's threat is not on the map");
  assert.ok(!players.zones.some((zone) => zone.id === "control-room"), "an unseen zone is not sent at all");
  assert.ok(players.tokens.every((token) => token.stance === undefined), "players are never told who is passive");
  const gm = siteView(map, state({ act: 3 }), "gm");
  assert.ok(gm.tokens.some((token) => token.name === "The Tenant" && token.stance === "active"));
  assert.equal(gm.zones.length, map.zones.length);
});

await test("a stealth turn walks two zones at most, never through a locked door", () => {
  const open = borderStates(map, { borders: {} });
  assert.deepEqual(stealthPath(map, open, "north-airlock", "hub").path, ["north-corridor", "hub"]);
  assert.match(stealthPath(map, open, "north-airlock", "spine-north").error, /3 zones away .* at most 2/);
  assert.match(stealthPath(map, open, "lower-landing", "lift").error, /locked or sealed/);
});

await test("Dead Air's relay: the tug to the station in two turns, the server room barred, the Chorus only in the cables", () => {
  const relay = siteById("dead-air");
  const shut = borderStates(relay, { borders: {} });
  assert.deepEqual(stealthPath(relay, shut, "cockpit", "collar").path, ["hold", "collar"]);
  assert.deepEqual(stealthPath(relay, shut, "collar", "main").path, ["airlock", "main"]);
  assert.match(stealthPath(relay, shut, "main", "server").error, /locked or sealed/);
  assert.equal(zoneByName(relay, "The Cormorant's cockpit").id, "cockpit");
  const start = siteView(relay, { act: 1, crew: [{ id: "tove", name: "Tove", zone: "cockpit" }], scene: "cockpit", visited: [], seen: [], borders: {}, moved: {}, found: [], pings: [] }, "players");
  assert.deepEqual(start.zones.map((zone) => zone.id), ["cockpit"]);
});

await test("the TV shows the whole found site while it reads, then follows the scene with an overview", () => {
  const small = siteView(map, state({ crew: [{ id: "kara", name: "Kara", zone: "north-corridor" }], scene: "north-corridor", visited: ["north-airlock"] }), "players");
  const tv = { width: 1920, height: 1080 };
  assert.equal(cameraFrame(small, tv).overview, false);
  const few = siteView(map, state({ crew: [{ id: "kara", name: "Kara", zone: "north-airlock" }], scene: "north-airlock", visited: [] }), "players");
  const close = cameraFrame(few, tv).frame;
  assert.ok(close.w >= 22 && close.h >= 14, "a few rooms found are never framed closer than 22 by 14 tiles");
  const big = siteView(map, state({ seen: map.zones.map((zone) => zone.id) }), "players");
  const camera = cameraFrame(big, tv);
  assert.equal(camera.overview, true);
  assert.ok(camera.frame.h < camera.whole.h && camera.frame.y <= 19 && camera.frame.y + camera.frame.h >= 31, "the frame holds the scene's zone");
});

// The live night, through the GM's own calls.
const crew = ["Ada", "Bo"].map((name) => world.addHero({ name, user: world.addUser(name) }));
beginCouchForge(world.campaignId, { players: 2, seed: "", offLimits: "", scenarioId: "haddon-outpost" });
campaigns.setCampaignStatus(world.campaignId, "active");
const move = (name, extra = {}) => handleLocationCall(world.campaign(), "move_party", JSON.stringify({ name, connections: [], visionClear: false, ...extra }), false);
const tool = (name, args = {}) => handleSiteTool(world.campaign(), name, JSON.stringify(args));

await test("before the first move the crew stands at the start, and the GM reads the site", () => {
  const view = couchSite(world.campaign());
  assert.ok(view.tokens.filter((token) => token.kind === "crew").every((token) => token.zone === "north-airlock"));
  const prompt = couchSitePrompt(world.campaign());
  assert.match(prompt, /SITE MAP/);
  assert.match(prompt, /The Tenant \[threat\] \(threat, active, enters in act 3\) in Freight Lift/);
  const names = dmTurnTools(world.campaign(), false, false, false).map((entry) => entry.function?.name);
  for (const name of ["set_border", "move_foe", "reveal", "take_item", "track"]) assert.ok(names.includes(name), `${name} is offered`);
});

await test("move_party walks zone to zone and every screen gets the new map", () => {
  assert.equal(move("Mess Hall").retry, true, "the first move is to the start");
  assert.equal(move("North Airlock").ok, true);
  const chunks = [];
  const off = subscribe(world.campaignId, (chunk) => chunks.push(chunk), crew[0].userId);
  assert.equal(move("north corridor").ok, true, "a zone by name, any case");
  off();
  assert.ok(chunks.some((chunk) => String(chunk).includes("couch_site")), "couch_site is published");
  const refused = move("South Spine");
  assert.equal(refused.refused, "rules");
  assert.match(refused.error, /2 zones away|stealth turn/);
  assert.equal(move("Workshop").ok, true, "through a closed door");
  const view = couchSite(world.campaign());
  assert.ok(view.zones.some((zone) => zone.id === "workshop" && zone.sight === "here"));
  assert.ok(view.zones.some((zone) => zone.id === "north-corridor" && zone.sight === "seen"), "a zone left stays drawn");
  assert.ok(view.tokens.some((token) => token.name === "Cutting torch"));
});

await test("the map tools open doors, move foes in secret, reveal, take and track", () => {
  assert.equal(tool("set_border", { from: "Workshop", to: "West Corridor", state: "open" }).ok, true);
  let view = couchSite(world.campaign());
  assert.ok(view.zones.some((zone) => zone.id === "west-corridor" && zone.sight === "visible"), "the open door lets them see through");
  assert.equal(tool("set_border", { from: "Workshop", to: "Mess Hall", state: "open" }).retry, true, "no such door");
  assert.equal(tool("take_item", { what: "torch" }).ok, true);
  assert.ok(!couchSite(world.campaign()).tokens.some((token) => token.name === "Cutting torch"));
  assert.equal(tool("move_foe", { who: "host-1", to: "Science Lab" }).ok, true);
  assert.equal(tool("move_foe", { who: "host-1", to: "Mess Hall" }).refused, "rules", "too far in one turn");
  assert.equal(tool("move_foe", { who: "host-1", to: "West Corridor", stance: "active" }).ok, true);
  view = couchSite(world.campaign());
  assert.ok(view.tokens.some((token) => token.name === "Feral Host" && token.zone === "west-corridor"), "a foe in sight shows");
  const tracked = tool("track");
  assert.equal(tracked.ok, true);
  assert.ok(couchSite(world.campaign()).pings.some((ping) => ping.zone === "west-corridor"), "an active foe pings");
  assert.equal(move("North Corridor").ok, true);
  assert.equal(couchSite(world.campaign()).pings.length, 0, "a move clears the pings");
  assert.equal(tool("reveal", { what: "Lift keycard" }).ok, true);
  setCouchAct(world.campaignId, 2);
  assert.match(couchSitePrompt(world.campaign()), /The Tenant \[threat\] \(threat, active\) in Freight Lift/);
});

await test("the map is HTML: labelled zones, named tokens and portraits, no picture", () => {
  const view = siteView(map, state({ crew: [{ id: "kara", name: "Kara Okafor", zone: "spine-north", portraitUrl: "/p/kara.webp" }] }), "players");
  const html = renderToStaticMarkup(createElement(CouchSiteMap, { view, variant: "phone", tile: 24, youId: "kara", onZone: () => {} }));
  assert.match(html, /role="group" aria-label="Overhead map: \d+ places found\."/);
  assert.match(html, /<button[^>]*aria-label="Spine Corridor, you are here"/);
  assert.match(html, /aria-label="Kara Okafor, crew"[^>]*><img src="\/p\/kara.webp" alt=""/);
  assert.doesNotMatch(html, /<svg/);
});

finish();
