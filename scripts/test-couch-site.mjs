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
//   what the crew learns of is marked on every map: a person seen stays
//   where they were last seen, a person or thing they were told of shows in
//   its zone's bare outline (mark_on_map), a landmark the GM names too, and
//   a foe is never marked;
//   the TV's camera shows the whole found site while it is readable, and
//   follows the scene with an overview once it is not;
//   the map is HTML: labelled zones, named tokens, portraits, no picture;
//   no name covers another name, a token or a zone title: a name that
//   cannot sit beside its token stands off with a line back to it;
//   every other token wears its kind's drawn icon, or a picture the night
//   already has of it (a foe's fight art, an item's);
//   the map changes under the crew: fire spreads through open doors each
//   stealth turn and a shut door holds it, vacuum vents every zone open to
//   it at once and puts the fire out, smoke hides a zone, a wrecked zone
//   cannot be entered, a wall blown open is a way through, a lockdown sets
//   every door of a zone, and a docked ship can drift off (nothing crosses
//   to it, it is drawn moved away) or leave the map whole.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-site");
const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, mapsEnabled: false, ttsEnabled: false } });
const { checkSiteMap, lineOfSight, siteView, wallRuns, cameraFrame, stealthPath, borderStates, zoneByName, rememberSightings, tagPlaces, titleBoxes, boundsOf, floodVacuum, spreadHazards, blockedZones, liveMap } = await import("../src/lib/couch/site-map-logic.ts");
const { HADDON_OUTPOST: map } = await import("../src/lib/couch/sites/haddon-outpost.ts");
const { CouchSiteMap } = await import("../src/components/couch/CouchSiteMap.tsx");
const { writtenForge, WRITTEN_SCENARIOS } = await import("../src/lib/couch/scenarios/index.ts");
const { SITES, siteById } = await import("../src/lib/couch/sites/index.ts");
const { scenarioCard } = await import("../src/lib/couch/scenario-cards.ts");
const { beginCouchForge, setCouchAct } = await import("../src/lib/couch/store.ts");
const { couchSite, couchSitePrompt, handleSiteTool } = await import("../src/lib/couch/site.ts");
const { handleLocationCall, dmTurnTools } = await import("../src/lib/dm/turn.ts");
const campaigns = await import("../src/lib/db/campaigns.ts");
const { getDatabase } = await import("../src/lib/db/core.ts");
const { paintedFoes } = await import("../src/lib/couch/fight-art.ts");
const { fightArtKey } = await import("../src/lib/couch/fight-logic.ts");
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
  assert.deepEqual(onMap.map((scenario) => scenario.id).sort(), ["crew-expendable", "dead-air", "haddon-outpost"]);
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
  assert.deepEqual(start.zones.filter((zone) => zone.sight !== "unseen").map((zone) => zone.id), ["north-airlock"], "only the airlock: its door is shut");
  const corridor = start.zones.find((zone) => zone.id === "north-corridor");
  assert.equal(corridor?.sight, "unseen", "the room behind the shut door is a named outline");
  assert.deepEqual(corridor.features, [], "with nothing of what is inside");
  assert.equal(start.exits["north-airlock"].find((exit) => exit.zone === "north-corridor")?.name, corridor.name, "the phone names the way out");
  assert.ok(start.walls.every((wall) => wall.y <= 5 && wall.x >= 17 && wall.x <= 23), "only the airlock's walls are sent");
  const unrevealed = siteView(map, state({ borders: { [door("hypersleep", "spine-north")]: "open" } }), "players");
  assert.ok(!unrevealed.tokens.some((token) => token.name === "Dead technician"), "a body in sight waits for the GM to reveal it");
  const players = siteView(map, state({ borders: { [door("hypersleep", "spine-north")]: "open" }, found: ["tech-body"] }), "players");
  const names = players.tokens.map((token) => token.name);
  assert.ok(names.includes("Dead technician"), "a revealed body in a zone the crew can see is shown");
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
  assert.deepEqual(start.zones.filter((zone) => zone.sight !== "unseen").map((zone) => zone.id), ["cockpit"]);
  assert.deepEqual(start.zones.filter((zone) => zone.sight === "unseen").map((zone) => zone.id), ["hold"], "the room next door is named, nothing further");
});

await test("Dead Air: Marsh heard over comms is marked in the server room's outline, a person met stays where last seen", () => {
  const relay = siteById("dead-air");
  const base = { act: 1, crew: [{ id: "tove", name: "Tove", zone: "airlock" }], scene: "airlock", visited: ["cockpit", "hold", "collar", "airlock"], seen: [], borders: {}, moved: {}, found: [], pings: [] };
  const before = siteView(relay, base, "players");
  assert.ok(!before.zones.some((zone) => zone.id === "server"), "an unheard-of room stays black");
  const told = siteView(relay, { ...base, known: { marsh: "server" }, marks: [{ id: "mark-1", name: "Clamp release", zone: "cockpit" }] }, "players");
  const server = told.zones.find((zone) => zone.id === "server");
  assert.equal(server?.sight, "unseen", "the server room is drawn as an outline");
  assert.ok(!told.props.some((prop) => prop.label === "racks"), "its furniture stays unseen");
  assert.deepEqual(told.walls, before.walls, "and its walls");
  assert.ok(told.tokens.some((token) => token.id === "marsh" && token.zone === "server" && token.last), "Marsh is marked where the crew was told she is");
  assert.ok(told.tokens.some((token) => token.kind === "landmark" && token.name === "Clamp release" && token.zone === "cockpit"));
  // A person in sight is known there; once out of sight they stay, marked
  // as last seen, until the crew sees that zone without them.
  const inMain = { ...base, borders: { 3: "open" }, moved: { marsh: "main" }, found: ["marsh"] };
  const known = rememberSightings(relay, inMain);
  assert.equal(known.marsh, "main");
  assert.ok(!("tech" in known), "a foe is never remembered");
  const away = siteView(relay, { ...inMain, borders: {}, known }, "players");
  assert.ok(away.tokens.some((token) => token.id === "marsh" && token.zone === "main" && token.last));
  const gone = { ...inMain, moved: { marsh: "galley" }, known };
  assert.equal(rememberSightings(relay, gone).marsh, undefined, "the crew sees she is no longer there");
  assert.ok(!siteView(relay, gone, "players").tokens.some((token) => token.id === "marsh"));
  const html = renderToStaticMarkup(createElement(CouchSiteMap, { view: told, variant: "tv", tile: 32 }));
  assert.match(html, /aria-label="Odile Marsh, person, last known here"/);
  assert.match(html, /class="couch-site-tag" data-kind="landmark"[^>]*>Clamp release</);
});

await test("Dead Air, crowded: no name covers another name, a token or a zone's title, and a name that stands off has a line back", () => {
  const relay = siteById("dead-air");
  // The GM's view in act 3, everyone out: the crew packed into the hold
  // with Marsh and Benny, the trooper in the airlock beside a crew member.
  const crowd = [
    ...["Rhea", "Juno", "Kit"].map((name) => ({ id: name.toLowerCase(), name, zone: "hold" })),
    { id: "tam", name: "Tam", zone: "airlock" },
  ];
  const view = siteView(relay, { act: 3, crew: crowd, scene: "airlock", visited: [], seen: [], borders: {}, moved: { marsh: "hold", benny: "hold", tech: "main" }, found: ["batteries", "medkit", "benny"], pings: [] }, "gm");
  const tags = tagPlaces(view);
  const named = view.tokens.filter((token) => token.kind !== "crew");
  assert.deepEqual(tags.map((tag) => tag.id).sort(), named.map((token) => token.id).sort(), "every token but the crew's is named once");
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const titles = titleBoxes(view.zones);
  const drawn = boundsOf(view.zones.flatMap((zone) => zone.rects), 1);
  for (const [i, tag] of tags.entries()) {
    for (const other of tags.slice(i + 1)) assert.equal(overlap(tag, other), 0, `${tag.id} and ${other.id} overlap`);
    for (const title of titles) assert.equal(overlap(tag, title), 0, `${tag.id} covers a zone's title`);
    for (const token of view.tokens) {
      if (token.id === tag.id) continue;
      assert.equal(overlap(tag, { x: token.x - 0.5, y: token.y - 0.5, w: 1, h: 1 }), 0, `${tag.id} covers ${token.id}`);
    }
    assert.ok(tag.x >= drawn.x && tag.y >= drawn.y && tag.x + tag.w <= drawn.x + drawn.w && tag.y + tag.h <= drawn.y + drawn.h, `${tag.id} stays within a tile of the drawn map`);
  }
  const stoodOff = tags.filter((tag) => tag.leader);
  assert.ok(stoodOff.length > 0, "the packed hold pushes some name off its token");
  for (const tag of stoodOff) {
    const { x2, y2 } = tag.leader;
    assert.ok(x2 >= tag.x - 1e-9 && x2 <= tag.x + tag.w + 1e-9 && y2 >= tag.y - 1e-9 && y2 <= tag.y + tag.h + 1e-9, `${tag.id}'s line ends on its name`);
  }
  assert.deepEqual(tagPlaces(view), tags, "the same view places the same names on every screen");
  const html = renderToStaticMarkup(createElement(CouchSiteMap, { view, variant: "tv", tile: 32 }));
  assert.match(html, /class="couch-site-leaders"/);
  assert.match(html, /class="couch-site-tag" data-kind="foe"[^>]*>Aurex sterilisation/);
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

await test("the map changes: fire spreads through open doors, vacuum vents what is open to it, smoke hides, rubble stops", () => {
  const open = { [door("workshop", "west-corridor")]: "open" };
  const fire = spreadHazards(map, { borders: open, conditions: { workshop: ["fire"] } });
  assert.deepEqual(fire.burning, ["west-corridor"], "through the open door, not the shut one");
  assert.ok(fire.conditions.workshop.includes("smoke"), "a fire fills its zone with smoke");
  assert.deepEqual(spreadHazards(map, { borders: {}, conditions: { workshop: ["fire"] } }).burning, [], "a shut door holds the fire");
  const vented = floodVacuum(map, { borders: open, conditions: { workshop: ["vacuum", "fire"], "west-corridor": ["fire"] } });
  assert.ok(vented.vented.includes("west-corridor") && vented.vented.includes("hub"), "the air goes from every zone open to it");
  assert.ok(!vented.vented.includes("science-lab"), "a shut door holds the air");
  assert.ok(!vented.conditions["west-corridor"].includes("fire"), "vacuum puts the fire out");
  const smoky = siteView(map, state({ crew: [{ id: "kara", name: "Kara", zone: "hub" }], scene: "hub", conditions: { "west-corridor": ["smoke"] } }), "players");
  assert.notEqual(smoky.zones.find((zone) => zone.id === "west-corridor")?.sight, "visible", "nobody sees into smoke");
  assert.deepEqual(smoky.zones.find((zone) => zone.id === "west-corridor")?.hazards, ["smoke"], "but the alarms say what is there");
  const blocked = blockedZones(map, { conditions: { hub: ["wrecked"] } });
  assert.match(stealthPath(map, borderStates(map, { borders: {} }), "north-corridor", "hub", 2, false, blocked).error, /cannot be entered/);
  assert.deepEqual(stealthPath(map, borderStates(map, { borders: {} }), "north-corridor", "west-corridor", 2, false, blocked).path, ["workshop", "west-corridor"], "nor walked through: the way goes round");
  const breached = liveMap(map, { breaches: [{ a: "mess", b: "hub" }] });
  assert.equal(breached.borders.at(-1).kind, "breach");
  assert.deepEqual(checkSiteMap(breached), [], "a hole blown in a wall sits on the wall the zones share");
  assert.deepEqual(stealthPath(breached, borderStates(breached, { borders: {} }), "mess", "hub").path, ["hub"]);
});

await test("a ship can undock: it drifts off whole, nothing crosses to it, and absent it is off the map", () => {
  const relay = siteById("dead-air");
  assert.deepEqual(checkSiteMap(relay), []);
  const base = { act: 1, crew: [{ id: "tove", name: "Tove", zone: "airlock" }], scene: "airlock", visited: ["cockpit", "hold", "collar", "airlock"], seen: [], borders: {}, moved: {}, found: [], pings: [] };
  const docked = siteView(relay, base, "players");
  assert.deepEqual(docked.sections.map((section) => [section.id, section.state, section.dx]), [["cormorant", "docked", 0]]);
  assert.equal(docked.zones.find((zone) => zone.id === "hold").section, "cormorant");
  const drifting = siteView(relay, { ...base, sections: { cormorant: "adrift" }, alerts: ["section:cormorant"] }, "players");
  const tug = drifting.sections[0];
  assert.ok(tug.state === "adrift" && tug.dx === -6 && tug.fresh, "drawn drifted off, played on the TV");
  assert.equal(drifting.doors.find((mark) => mark.a === "collar" && mark.b === "airlock").state, "severed");
  assert.ok(drifting.walls.some((wall) => wall.section === "cormorant"), "it takes its own walls with it");
  const states = borderStates(relay, { borders: {}, sections: { cormorant: "adrift" } });
  assert.match(stealthPath(relay, states, "airlock", "collar").error, /severed/);
  assert.deepEqual(stealthPath(relay, states, "cockpit", "collar").path, ["hold", "collar"], "aboard, the crew still walks it");
  const gone = siteView(relay, { ...base, sections: { cormorant: "absent" }, moved: { marsh: "hold" } }, "gm");
  assert.ok(!gone.zones.some((zone) => zone.id === "hold") && !gone.tokens.some((token) => token.zone === "hold"), "absent: not sent at all");
  assert.ok(!gone.exits.airlock.some((exit) => exit.zone === "collar"));
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
  assert.match(prompt, /The Tenant \[threat\] \(threat, active, not on screens, enters in act 3\) in Freight Lift/);
  const names = dmTurnTools(world.campaign(), false, false, false).map((entry) => entry.function?.name);
  for (const name of ["set_border", "move_foe", "reveal", "take_item", "track", "mark_on_map"]) assert.ok(names.includes(name), `${name} is offered`);
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
  assert.ok(!view.tokens.some((token) => token.name === "Cutting torch"), "what is in the room waits for the GM's narration");
  assert.equal(tool("reveal", { what: "Cutting torch" }).ok, true);
  assert.ok(couchSite(world.campaign()).tokens.some((token) => token.name === "Cutting torch"));
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
});

await test("mark_on_map marks a person told of, a landmark, never a foe, and the GM reads the marks", () => {
  assert.ok(!couchSite(world.campaign()).tokens.some((token) => token.id === "cook"));
  const marked = tool("mark_on_map", { what: "Maro Tellis", where: "Workshop" });
  assert.equal(marked.ok, true);
  assert.match(marked.note, /in Galley/, "a person is marked where they really are, not where the GM said");
  let view = couchSite(world.campaign());
  assert.ok(view.tokens.some((token) => token.id === "cook" && token.zone === "galley"));
  assert.ok(view.zones.some((zone) => zone.id === "galley" && zone.sight === "unseen"), "the galley is a bare outline");
  assert.ok(!view.tokens.find((token) => token.id === "cook").portraitUrl, "no picture yet: the icon");
  // Someone the crew fought wears that fight's picture on the map, small.
  paintedFoes(world.campaignId);
  getDatabase()
    .prepare(`INSERT INTO couch_fight_art (campaign_id, art_key, name, whole_url, tries, updated_at) VALUES (?, ?, ?, ?, 1, ?)`)
    .run(world.campaignId, fightArtKey("Maro Tellis"), "Maro Tellis", "/uploads/maro.png", new Date().toISOString());
  assert.equal(couchSite(world.campaign()).tokens.find((token) => token.id === "cook").portraitUrl, "/uploads/maro.png?w=256");
  assert.equal(tool("mark_on_map", { what: "Feral Host" }).refused, "rules", "a foe is never marked");
  assert.equal(tool("mark_on_map", { what: "Blood trail", where: "Nowhere" }).retry, true);
  assert.equal(tool("mark_on_map", { what: "Blood trail" }).ok, true, "a landmark in the scene's zone by default");
  assert.equal(tool("mark_on_map", { what: "blood trail", where: "Workshop" }).ok, true, "the same name moves the mark");
  view = couchSite(world.campaign());
  assert.deepEqual(view.tokens.filter((token) => token.kind === "landmark").map((token) => token.zone), ["workshop"]);
  const prompt = couchSitePrompt(world.campaign());
  assert.match(prompt, /Maro Tellis \[cook\] \(npc, marked on the crew's map\)/);
  assert.match(prompt, /MARKED by you: blood trail in Workshop/);
  assert.equal(tool("mark_on_map", { what: "Blood trail", where: "gone" }).ok, true);
  assert.ok(!couchSite(world.campaign()).tokens.some((token) => token.kind === "landmark"));
  assert.match(couchSitePrompt(world.campaign()), /The Tenant \[threat\] \(threat, active, not on screens\) in Freight Lift/);
});

await test("the GM changes the map: fire, a lockdown, a wall blown open, a vent to space", () => {
  let result = tool("set_zone", { zone: "Workshop", condition: "fire" });
  assert.equal(result.ok, true);
  let view = couchSite(world.campaign());
  assert.deepEqual(view.zones.find((zone) => zone.id === "workshop").hazards, ["fire"]);
  assert.ok(view.alerts.some((alert) => alert.zone === "workshop"), "the TV sounds the alarm there");
  result = move("Mess Hall");
  assert.equal(result.ok, true);
  assert.match(result.note, /The fire spread to West Corridor/, "a stealth turn passes for the fire too");
  view = couchSite(world.campaign());
  assert.ok(view.alerts.every((alert) => alert.zone !== "workshop"), "the last turn's alarm is over");
  assert.equal(tool("set_zone", { zone: "Workshop", condition: "wrecked" }).ok, true);
  assert.equal(move("North Corridor").ok, true);
  assert.match(move("Workshop").error, /cannot be entered/);
  result = tool("set_zone", { zone: "West Corridor", condition: "vacuum" });
  assert.match(result.note, /Central Hub.*vent to vacuum/, "everything open to it vents");
  assert.match(result.note, /Ada, Bo are in it: play it/, "the GM is told who is caught");
  assert.equal(tool("set_zone", { zone: "West Corridor", condition: "fire" }).refused, "rules", "nothing burns in vacuum");
  result = tool("set_border", { from: "Mess Hall", to: "all", state: "locked" });
  assert.match(result.note, /Every door of Mess Hall is locked/);
  assert.equal(tool("set_border", { from: "Mess Hall", to: "Central Hub", state: "open" }).retry, true, "no door there to open");
  result = tool("set_border", { from: "Mess Hall", to: "Central Hub", state: "broken" });
  assert.equal(result.ok, true, "but a wall to blow open");
  assert.match(result.note, /Mess Hall vents to vacuum/, "into the vented hub: the mess loses its air");
  const prompt = couchSitePrompt(world.campaign());
  assert.match(prompt, /Central Hub \(breach, broken; vacuum there\)/);
  assert.match(prompt, /- Workshop \[cluttered, .*WRECKED/);
  assert.equal(tool("set_section", { section: "anything", state: "adrift" }).refused, "rules", "Haddon has nothing to undock");
  assert.ok(!dmTurnTools(world.campaign(), false, false, false).some((entry) => entry.function?.name === "set_section"), "nor is it offered");
  assert.equal(tool("set_zone", { zone: "Workshop", condition: "all", state: "off" }).ok, true);
  assert.deepEqual(couchSite(world.campaign()).zones.find((zone) => zone.id === "workshop").hazards, ["vacuum"], "open to the vacuum, the air goes again");
  assert.equal(tool("set_border", { from: "Workshop", to: "West Corridor", state: "sealed" }).ok, true);
  assert.equal(tool("set_zone", { zone: "Workshop", condition: "all", state: "off" }).ok, true);
  assert.equal(couchSite(world.campaign()).zones.find((zone) => zone.id === "workshop").hazards, undefined, "sealed off, it can be made good");
});

await test("the map is HTML: labelled zones, named tokens and portraits, no picture", () => {
  const view = siteView(map, state({ crew: [{ id: "kara", name: "Kara Okafor", zone: "spine-north", portraitUrl: "/p/kara.webp" }] }), "players");
  const html = renderToStaticMarkup(createElement(CouchSiteMap, { view, variant: "phone", tile: 24, youId: "kara", onZone: () => {} }));
  assert.match(html, /role="group" aria-label="Overhead map: \d+ places found\."/);
  assert.match(html, /<button[^>]*aria-label="Spine Corridor, you are here"/);
  assert.match(html, /aria-label="Kara Okafor, crew"[^>]*><img src="\/p\/kara.webp" alt=""/);
  assert.doesNotMatch(html.replace(/<svg class="couch-site-icon"[\s\S]*?<\/svg>/g, ""), /<svg|<canvas/, "the only drawings are the tokens' icons");
});

await test("every token shows what it is: its kind's icon, or the picture the night has of it", () => {
  const relay = siteById("dead-air");
  const view = siteView(relay, { act: 1, crew: [{ id: "tove", name: "Tove", zone: "airlock" }], scene: "airlock", visited: ["airlock"], seen: [], borders: { 3: "open" }, moved: { marsh: "main" }, found: ["marsh", "tech"], pings: [], marks: [{ id: "mark-1", name: "Clamp release", zone: "airlock" }] }, "players");
  const html = renderToStaticMarkup(createElement(CouchSiteMap, { view, variant: "tv", tile: 32 }));
  for (const kind of ["npc", "foe", "landmark"]) {
    assert.match(html, new RegExp(`data-kind="${kind}"[^>]*>(?:<span[^>]*>[^<]*</span>)?<svg class="couch-site-icon"`), `a ${kind} token draws its icon`);
  }
  assert.doesNotMatch(html, /data-kind="npc"[^>]*><span/, "a person shows an icon, not initials");
});

finish();
