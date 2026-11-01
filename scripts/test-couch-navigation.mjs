// Getting around a couch night (docs/couch-navigation.md, src/lib/couch/
// navigation*.ts, src/components/couch/CouchNavigation.tsx). The map itself
// is the site's (scripts/test-couch-site.mjs); this holds what rides beside
// it:
//
//   the scene's place is where the crew stands, with its establishing shot,
//   and nothing the crew has not reached ever leaks;
//   nobody votes: any destination is the GM's to move to (splitting up is
//   scripts/test-couch-split.mjs);
//   the GM is told to move when the crew goes together and is never told to
//   wait for a majority, and reads what the arrival picture showed;
//   a live couch_navigation event carries the same view a reload does;
//   a phone has no Map button until the night has a site;
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
const { crewMap, navigationPrompt } = await import("../src/lib/couch/navigation-logic.ts");
const { parseSeenReply, owesEstablishingShot, placePicture, establishingFallback } = await import("../src/lib/couch/place-shots-logic.ts");
const { handleLocationCall } = await import("../src/lib/dm/turn.ts");
const { subscribe } = await import("../src/lib/events.ts");
const { CouchMapButton, CouchPlaceTitle } = await import("../src/components/couch/CouchNavigation.tsx");
const { INITIAL_CAMPAIGN_STATE } = await import("../src/app/campaigns/[campaignId]/useCampaignStream.ts");

const crew = ["Ada", "Bo", "Cy"].map((name) => world.addHero({ name, user: world.addUser(name) }));
campaigns.setCampaignStatus(world.campaignId, "active");
const move = (name, connections = [], extra = {}) => handleLocationCall(world.campaign(), "move_party", JSON.stringify({ name, connections, visionClear: false, ...extra }), false);
const view = () => couchNavigation(world.campaign());

await test("the scene's place is where the crew stands, and nothing it has not reached leaks", () => {
  assert.equal(move("Airlock", ["Engineering", "Medbay"]).ok, true);
  locations.insertKnownLocation({ campaignId: world.campaignId, name: "Secret laboratory", connections: ["Hidden tunnel"], layoutDescription: "The GM's secret." });
  const map = view();
  assert.equal(map.here.name, "Airlock");
  assert.deepEqual(Object.keys(map).sort(), ["groups", "here"]);
  assert.equal(map.groups.length, 1, "one group while the crew is together");
  assert.equal(map.groups[0].room.name, "Airlock");
  assert.doesNotMatch(JSON.stringify(map), /Secret laboratory|Hidden tunnel|GM's secret|Engineering|Medbay/);
});

await test("any destination can be taken without a vote, and a move naming nobody moves the whole crew", () => {
  const strange = move("Medbay", [], { characterIds: ["nobody at all"] });
  assert.equal(strange.retry, true, "a name that is not crew is a mistake in the call");
  assert.equal(locations.getCurrentLocation(world.campaignId).name, "Airlock", "nothing was written");
  assert.equal(move("Medbay").ok, true);
  assert.equal(move("Airlock").ok, true, "going back is the crew's call too");
  assert.equal(move("Engineering").ok, true);
  assert.equal(view().here.name, "Engineering");
});

await test("the GM moves when the crew goes together, may split it, and is never told to wait for votes", () => {
  const prompt = navigationPrompt(view(), "SITE MAP: the site.");
  assert.match(prompt, /Players choose where to go by saying it/);
  assert.match(prompt, /move_party with that zone's name and no characterIds/);
  assert.match(prompt, /SITE MAP: the site\./);
  assert.doesNotMatch(prompt, /Never split the crew/);
  assert.doesNotMatch(prompt, /vote|majority|ballot/i);
  assert.doesNotMatch(prompt, /CREW MAP|update_location|Exits:/, "the site holds the ways out");
  assert.match(navigationPrompt(null, "SITE MAP: the site."), /moving the crew to its start zone with move_party/);
  assert.equal(navigationPrompt(null), "");
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

const stateWith = (map, site = null) => ({ ...INITIAL_CAMPAIGN_STATE, campaign: world.campaign(), me: { id: crew[0].userId }, couchNavigation: map, couchSite: site });

await test("a phone has no Map button until the night has a site", () => {
  assert.equal(renderToStaticMarkup(createElement(CouchMapButton, { state: stateWith(view()) })), "");
});

await test("each place's establishing shot rides on the scene's place, and a place that owes one is painted next", () => {
  const places = [
    { name: "Galley", picture: { url: "/generated/galley.png", seen: "Steel tables.", placeId: "p1" } },
    { name: "Hold", picture: null },
  ];
  assert.equal(crewMap(places, places[0]).here.picture.url, "/generated/galley.png");
  const map = crewMap(places, places[1]);
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
