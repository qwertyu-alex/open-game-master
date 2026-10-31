// The couch crew's map (docs/couch-navigation.md, src/lib/couch/
// navigation*.ts, src/components/couch/CouchNavigation.tsx):
//
//   the map shows only rooms the crew visited and the exits of the room it
//   stands in, never an unvisited room's own connections or description;
//   the trail runs from the first room to here, rooms off it sit beside the
//   trail room they open from, and the way back is not listed as an exit;
//   rooms with no recorded link still land on the trail in the order the
//   crew reached them;
//   nobody votes: any destination is the GM's to move to (splitting up is
//   scripts/test-couch-split.mjs);
//   the GM reads the map, is told to move when the crew goes together, and
//   is never told to wait for a majority;
//   a live couch_navigation event carries the same view a reload does;
//   the TV draws a rail that folds its oldest rooms, and the phone a Map
//   button that opens a labelled dialog with the whole plan;
//   an ordinary table has no map and moves as before.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-navigation");
const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, mapsEnabled: false, ttsEnabled: false } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const locations = await import("../src/lib/db/locations.ts");
const { couchNavigation } = await import("../src/lib/couch/navigation.ts");
const { crewMap, railTrail, navigationPrompt, picturedRooms } = await import("../src/lib/couch/navigation-logic.ts");
const { parseSeenReply, owesEstablishingShot, placePicture, establishingFallback } = await import("../src/lib/couch/place-shots-logic.ts");
const { handleLocationCall } = await import("../src/lib/dm/turn.ts");
const { subscribe } = await import("../src/lib/events.ts");
const { CouchMapRail, CouchMapButton, CouchPlaceTitle } = await import("../src/components/couch/CouchNavigation.tsx");
const { INITIAL_CAMPAIGN_STATE } = await import("../src/app/campaigns/[campaignId]/useCampaignStream.ts");

const crew = ["Ada", "Bo", "Cy"].map((name) => world.addHero({ name, user: world.addUser(name) }));
campaigns.setCampaignStatus(world.campaignId, "active");
const move = (name, connections = [], extra = {}) => handleLocationCall(world.campaign(), "move_party", JSON.stringify({ name, connections, visionClear: false, ...extra }), false);
const view = () => couchNavigation(world.campaign());
const names = (rooms) => rooms.map((room) => room.name);

await test("the map shows only visited rooms and the exits of the room the crew stands in", () => {
  assert.equal(move("Airlock", ["Engineering", "Medbay", "Crew deck", "engineering", "Airlock", ""]).ok, true);
  locations.insertKnownLocation({ campaignId: world.campaignId, name: "Secret laboratory", connections: ["Hidden tunnel"], layoutDescription: "The GM's secret." });
  const map = view();
  assert.equal(map.here.name, "Airlock");
  assert.deepEqual(names(map.trail), ["Airlock"]);
  assert.deepEqual(names(map.exits), ["Engineering", "Medbay", "Crew deck"], "one exit per name, the room itself left out");
  assert.ok(map.exits.every((exit) => !exit.visited));
  assert.doesNotMatch(JSON.stringify(map), /Secret laboratory|Hidden tunnel|GM's secret/);
});

await test("any exit can be taken without a vote, and a move naming nobody moves the whole crew", () => {
  const strange = move("Medbay", [], { characterIds: ["nobody at all"] });
  assert.equal(strange.retry, true, "a name that is not crew is a mistake in the call");
  assert.equal(locations.getCurrentLocation(world.campaignId).name, "Airlock", "nothing was written");
  assert.equal(move("Medbay", ["Airlock", "Lab"]).ok, true);
  assert.equal(move("Airlock").ok, true, "going back is the crew's call too");
  assert.equal(move("Engineering", ["Airlock", "Reactor"]).ok, true);
});

await test("the trail runs from the first room to here, side rooms sit beside it, and the way back is not an exit", () => {
  const map = view();
  assert.equal(map.here.name, "Engineering");
  assert.deepEqual(names(map.trail), ["Airlock", "Engineering"]);
  assert.deepEqual(map.side.map((room) => [room.name, room.at]), [["Medbay", map.trail[0].id]]);
  assert.deepEqual(names(map.exits), ["Reactor"], "Airlock is the trail behind, not an exit");
  assert.equal(map.exits[0].visited, false);
});

await test("a loop back to a visited room is an exit marked visited, and unlinked rooms keep the order they were reached", () => {
  const at = (name, minute) => `2026-10-30T00:${String(minute).padStart(2, "0")}:00.000Z`;
  const place = (name, minute, connections = [], extra = {}) => ({ id: name, name, connections, visited: true, isCurrent: false, createdAt: at(name, minute), ...extra });
  const linked = [place("Dock", 1, ["Hall"]), place("Hall", 2, ["Dock", "Lab", "Vault"]), place("Lab", 3, ["Hall", "Dock"])];
  const here = linked[2];
  const loop = crewMap(linked, here);
  assert.deepEqual(names(loop.trail), ["Dock", "Lab"], "the shortest recorded way from the first room");
  assert.deepEqual(loop.side.map((room) => room.name), ["Hall"]);
  assert.deepEqual(loop.exits.map((exit) => [exit.name, exit.visited]), [["Hall", true]]);
  const loose = [place("Bridge", 1), place("Galley", 2), place("Brig", 3, ["Shaft"])];
  const lost = crewMap(loose, loose[2]);
  assert.deepEqual(names(lost.trail), ["Bridge", "Galley", "Brig"]);
  assert.deepEqual(lost.side, []);
  assert.deepEqual(railTrail(lost.trail, 2), { earlier: 1, rooms: lost.trail.slice(1) });
});

await test("the GM reads the map, moves when the crew goes together, may split it, and is never told to wait for votes", () => {
  const prompt = navigationPrompt(view());
  assert.match(prompt, /the crew is in Engineering\. Exits: Reactor\./);
  assert.match(prompt, /Players choose where to go by saying it/);
  assert.match(prompt, /move_party with that exact name and no characterIds/);
  assert.doesNotMatch(prompt, /Never split the crew/);
  assert.equal(view().groups.length, 1, "one group while the crew is together");
  assert.doesNotMatch(prompt, /vote|majority|ballot/i);
  assert.match(navigationPrompt(null), /Record the opening room/);
});

await test("a live couch_navigation event carries the same map a reload does", () => {
  const chunks = [];
  const off = subscribe(world.campaignId, (chunk) => chunks.push(chunk), crew[0].userId);
  try {
    assert.equal(move("Reactor", ["Engineering", "Coolant shaft"]).ok, true);
    const chunk = chunks.find((entry) => entry.includes("event: couch_navigation"));
    assert.ok(chunk, "the table hears the move");
    const sent = JSON.parse(chunk.split("\n").find((line) => line.startsWith("data: ")).slice(6));
    assert.deepEqual(sent.payload?.navigation ?? sent.navigation, view());
    assert.doesNotMatch(chunk, /Secret laboratory|Hidden tunnel|agenda|backstory/);
  } finally {
    off();
  }
});

const stateWith = (map) => ({ ...INITIAL_CAMPAIGN_STATE, campaign: world.campaign(), me: { id: crew[0].userId }, couchNavigation: map });

await test("the TV's rail names the trail and the exits, folds its oldest rooms, and offers no buttons", () => {
  // The rail is what a night without any room on its plan still draws.
  const long = { ...view(), deck: undefined, trail: ["One", "Two", "Three", "Four", "Five", "Six", "Seven"].map((name) => ({ id: name.toLowerCase(), name })) };
  long.here = long.trail[6];
  const tv = renderToStaticMarkup(createElement(CouchMapRail, { state: stateWith(long) }));
  assert.match(tv, /aria-label="Map\. The crew is in Seven\."/);
  assert.match(tv, />2 earlier</);
  assert.doesNotMatch(tv, />One<|>Two</);
  assert.match(tv, /data-here=""/);
  assert.match(tv, />Coolant shaft</);
  assert.doesNotMatch(tv, /<button/);
  assert.equal(renderToStaticMarkup(createElement(CouchMapRail, { state: stateWith(null) })), "", "no room on record, no rail");
});

await test("with a deck plan the TV draws the whole ship in its corner: the walked way lit, here marked, no buttons", () => {
  const tv = renderToStaticMarkup(createElement(CouchMapRail, { state: stateWith(view()) }));
  assert.match(tv, /class="couch-deckmap couch-deckmap-tv" aria-label="Map\. The crew is in Reactor\."/);
  assert.match(tv, /data-state="visited" data-here="" data-room="reactor"/);
  assert.match(tv, /data-walked=""/, "the way the crew came is lit");
  assert.match(tv, /aria-label="Coolant shaft, not explored"/, "an exit's name shows from next door");
  assert.doesNotMatch(tv, /<button|role="button"/);
});

await test("the phone's Map button opens a labelled dialog with the whole plan, a key and how to move", () => {
  const phone = renderToStaticMarkup(createElement(CouchMapButton, { state: stateWith(view()) }));
  assert.match(phone, /<button type="button" class="couch-map-button" aria-haspopup="dialog" aria-expanded="false">/);
  assert.match(phone, /The crew is in Reactor/);
  assert.match(phone, /<dialog class="couch-map-sheet" aria-labelledby="[^"]+">/);
  assert.match(phone, />Done</);
  for (const room of ["Airlock", "Engineering", "Reactor", "Medbay", "Coolant shaft"]) {
    assert.match(phone, new RegExp(`>${room}<`), `${room} is on the plan`);
  }
  assert.match(phone, /You are here/);
  assert.match(phone, /Not explored/);
  assert.match(phone, /just say it/);
  assert.doesNotMatch(phone, /vote|majority/i);
});

const pictured = () => {
  const map = view();
  const picture = (name) => ({ url: `/generated/${name.toLowerCase()}.png`, seen: `${name}, as seen.`, placeId: name });
  const withPicture = (room) => (["Airlock", "Medbay"].includes(room.name) ? { ...room, picture: picture(room.name) } : room);
  return { ...map, trail: map.trail.map(withPicture), side: map.side.map(withPicture), here: withPicture(map.here) };
};

await test("each place's establishing shot rides on the map, and a place that owes one is painted next", () => {
  const places = [
    { id: "p1", name: "Galley", connections: ["Hold"], visited: true, isCurrent: false, createdAt: "1", picture: { url: "/generated/galley.png", seen: "Steel tables.", placeId: "p1" } },
    { id: "p2", name: "Hold", connections: ["Galley"], visited: true, isCurrent: true, createdAt: "2", picture: null },
  ];
  const map = crewMap(places, places[1]);
  assert.deepEqual(map.trail.map((room) => room.picture?.url ?? null), ["/generated/galley.png", null]);
  assert.equal(map.here.picture, undefined, "the hold has none yet");
  assert.equal(owesEstablishingShot(null), true);
  assert.equal(owesEstablishingShot({ stale: true }), true, "the GM asked for a repaint");
  assert.equal(owesEstablishingShot({ stale: false }), false);
  assert.deepEqual(placePicture({ locationId: "p1", url: "/g.png", frame: "Painted from.", seen: "", change: "", stale: false }), { url: "/g.png", seen: "Painted from.", placeId: "p1" }, "the frame stands in until the look lands");
  assert.equal(placePicture(null), null);
  assert.equal(establishingFallback("Hold", "A cold cargo hold.", "x"), "The whole of Hold: A cold cargo hold, empty of people.");
  assert.doesNotMatch(navigationPrompt(map), /WHAT THE CREW SAW/, "no picture of here, nothing to keep to");
});

await test("the look at a picture keeps a description, and nothing from a model that could not see it", () => {
  assert.equal(parseSeenReply("NO PICTURE"), null);
  assert.equal(parseSeenReply("I can't see it. [a picture was shared here]"), null);
  assert.equal(parseSeenReply("A room."), null, "too little to be a description");
  assert.equal(parseSeenReply("## Description\nA long ribbed corridor, frost on the ribs, a round hatch at the far end."), "A long ribbed corridor, frost on the ribs, a round hatch at the far end.");
  assert.ok(parseSeenReply("A corridor. ".repeat(200)).length <= 700);
});

await test("the phone's plan makes each pictured place a button, and the viewer pages through them in plan order", () => {
  const map = pictured();
  assert.deepEqual(picturedRooms(map).map((room) => room.name), ["Airlock", "Medbay"]);
  const withPictures = { ...map, deck: { ...map.deck, rooms: map.deck.rooms.map((room) => (["airlock", "medbay"].includes(room.id) ? { ...room, picture: { url: `/generated/${room.id}.png`, seen: "", placeId: room.id } } : room)) } };
  const phone = renderToStaticMarkup(createElement(CouchMapButton, { state: stateWith(withPictures) }));
  assert.match(phone, /data-room="airlock" transform="[^"]+" role="button" tabindex="0" aria-label="Airlock\. Show the picture"/);
  assert.match(phone, /data-room="medbay" transform="[^"]+" role="button"/, "a side room with a picture is a button too");
  assert.match(phone, /Tap a place to see it again\./);
  assert.doesNotMatch(phone, /data-room="engineering" transform="[^"]+" role="button"/, "a place with no picture stays a label");
  assert.match(phone, /From Reactor you can go to/);
  assert.match(phone, /aria-label="Exits from Reactor"/);
  const tv = renderToStaticMarkup(createElement(CouchMapRail, { state: stateWith(withPictures) }));
  assert.doesNotMatch(tv, /<button|role="button"/, "the TV's map stays a map");
  assert.doesNotMatch(renderToStaticMarkup(createElement(CouchMapButton, { state: stateWith(view()) })), /Tap a place/);
});

await test("the TV names a place only as the crew arrives, never on a reload", () => {
  assert.equal(renderToStaticMarkup(createElement(CouchPlaceTitle, { state: stateWith(view()) })), "");
});

await test("the vote is gone: no route takes ballots", () => {
  assert.equal(existsSync(new URL("../src/app/api/campaigns/[campaignId]/couch/vote/route.ts", import.meta.url)), false);
});

await test("an ordinary table has no map and moves as before", () => {
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(couchNavigation(ordinary), null);
  assert.equal(handleLocationCall(ordinary, "move_party", JSON.stringify({ name: "Anywhere", characterIds: [crew[0].id], visionClear: false }), false).refused, undefined);
});

world.close();
finish();
