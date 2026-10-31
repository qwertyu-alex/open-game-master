// The night's deck plan under the fog of war (docs/couch-navigation.md
// "The deck plan", src/lib/couch/deck-plan*.ts,
// src/components/couch/CouchDeckMap.tsx):
//
//   the planner's reply is read and mended: one room per cell, links only
//   between its rooms, every room reachable, too few rooms refused;
//   what the GM recorded since joins the plan, never removing anything, and
//   a room the GM wrote down ahead of time is never set beside the crew;
//   every screen gets the whole plan: a room's outline and its corridors
//   always, its name once the crew has been next to it, its picture once
//   inside; no unexplored room's name ever reaches a phone;
//   the GM reads every room and corridor and where the crew can go;
//   a drawn plan rides on the map every screen gets.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-deck");
const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, mapsEnabled: false, ttsEnabled: false } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const core = await import("../src/lib/db/core.ts");
const logic = await import("../src/lib/couch/deck-plan-logic.ts");
const { currentDeckPlan } = await import("../src/lib/couch/deck-plan.ts");
const { couchNavigation, couchWhereaboutsPrompt } = await import("../src/lib/couch/navigation.ts");
const { handleLocationCall } = await import("../src/lib/dm/turn.ts");
const { CouchDeckMap } = await import("../src/components/couch/CouchDeckMap.tsx");

const crew = ["Ada", "Bo"].map((name) => world.addHero({ name, user: world.addUser(name) }));
campaigns.setCampaignStatus(world.campaignId, "active");
const move = (name, connections = []) => handleLocationCall(world.campaign(), "move_party", JSON.stringify({ name, connections, visionClear: false }), false);

const DRAWN = {
  rooms: [
    { name: "Cockpit", col: 0, row: 1 },
    { name: "Mess", col: 1, row: 1 },
    { name: "Medical Bay", col: 2, row: 0 },
    { name: "Airlock", col: 2, row: 2 },
    { name: "Cargo Hold", col: 3, row: 1 },
    { name: "Engine Room", col: 4, row: 1 },
    { name: "Crawlspace", col: 4, row: 1 },
    { name: "Specimen Lab", col: 9, row: 9 },
  ],
  links: [["Cockpit", "Mess"], ["Mess", "Medical Bay"], ["Mess", "Airlock"], ["Mess", "Cargo Hold"], ["Cargo Hold", "Engine Room"], ["Engine Room", "Nowhere"], ["Mess", "mess"]],
};

await test("the planner's reply is read and mended, and a plan with too few rooms is refused", () => {
  const plan = logic.readDeckPlan(DRAWN);
  assert.ok(plan);
  const cells = plan.rooms.map((room) => `${room.col},${room.row}`);
  assert.equal(new Set(cells).size, cells.length, "one room per cell: the clash moved");
  assert.ok(plan.rooms.every((room) => room.col < logic.PLAN_COLS && room.row < logic.PLAN_ROWS), "a cell off the grid comes back onto it");
  assert.ok(!plan.links.some(([a, b]) => a === "Nowhere" || b === "Nowhere" || a === b), "links only between two of its rooms");
  for (const room of ["Crawlspace", "Specimen Lab"]) {
    assert.ok(plan.links.some(([a, b]) => a === room || b === room), `${room}, left unlinked, is joined to the plan`);
  }
  assert.equal(logic.readDeckPlan({ rooms: DRAWN.rooms.slice(0, 3), links: [] }), null);
  assert.equal(logic.readDeckPlan("no"), null);
});

await test("what the GM recorded joins the plan, and a room written down ahead of time is not set beside the crew", () => {
  const plan = logic.readDeckPlan(DRAWN);
  const merged = logic.mergeKnown(plan, [
    { name: "Cockpit", connections: ["Mess", "Escape Pod"], visited: true, createdAt: "1" },
    { name: "Vault", connections: [], visited: false, createdAt: "2" },
  ]);
  assert.ok(merged.rooms.length >= plan.rooms.length, "nothing removed");
  assert.ok(merged.rooms.some((room) => room.name === "Escape Pod"), "a recorded exit to somewhere new is a room");
  assert.ok(merged.links.some(([a, b]) => [a, b].includes("Cockpit") && [a, b].includes("Escape Pod")));
  assert.ok(!merged.rooms.some((room) => room.name === "Vault"), "a place nothing leads to waits off the map");
});

await test("the fog: outlines and corridors always, a name from next door, a picture from inside, no hidden name ever sent", () => {
  const plan = logic.readDeckPlan(DRAWN);
  const view = logic.deckView({
    plan,
    visited: new Set(["cockpit", "mess"]),
    here: "Mess",
    trail: ["cockpit", "mess"],
    pictures: new Map([["mess", { url: "/g/mess.png", seen: "Steel tables.", placeId: "m" }], ["engine room", { url: "/g/engine.png", seen: "", placeId: "e" }]]),
    crewAt: new Map([["mess", [{ id: "a", name: "Ada", portraitUrl: null }]]]),
  });
  const state = Object.fromEntries(view.rooms.map((room) => [room.name ?? room.id, room.state]));
  assert.equal(state.Mess, "visited");
  assert.equal(state["Medical Bay"], "seen", "next to where they have been: named");
  assert.equal(view.rooms.filter((room) => room.state === "unknown").length > 0, true);
  const sent = JSON.stringify(view);
  for (const hidden of ["Engine Room", "Crawlspace", "Specimen Lab", "engine room", "/g/engine.png"]) {
    assert.ok(!sent.includes(hidden), `${hidden} never leaves the server`);
  }
  assert.equal(view.rooms.find((room) => room.name === "Mess").picture.url, "/g/mess.png");
  assert.ok(view.links.some((link) => link.walked), "the way they came is lit");
  assert.equal(view.links.length, plan.links.length, "every corridor is drawn, fogged or not");
  assert.deepEqual(logic.deckExits(view, "mess").map((room) => room.name).sort(), ["Airlock", "Cargo Hold", "Cockpit", "Medical Bay"]);
  const tv = renderToStaticMarkup(createElement(CouchDeckMap, { deck: view, variant: "tv" }));
  assert.match(tv, /aria-label="Unexplored"/);
  assert.doesNotMatch(tv, /Engine Room|Crawlspace/);
});

await test("the GM reads every room and corridor and where the crew can go from here", () => {
  const plan = logic.readDeckPlan(DRAWN);
  const prompt = logic.deckPlanPrompt(plan, "Mess");
  assert.match(prompt, /DECK PLAN/);
  assert.match(prompt, /Engine Room/, "the GM sees the whole ship");
  assert.match(prompt, /From Mess the crew can go to: Cockpit, Medical Bay, Airlock, Cargo Hold/);
  assert.match(prompt, /only along corridors/);
});

await test("a drawn plan rides on the map every screen gets, with the crew's faces, and in the GM's prompt", () => {
  assert.equal(move("Cockpit", ["Mess"]).ok, true);
  currentDeckPlan(world.campaign());
  core.getDatabase()
    .prepare(`INSERT OR REPLACE INTO couch_deck_plans (campaign_id, plan_json, status, updated_at) VALUES (?, ?, 'ready', ?)`)
    .run(world.campaignId, JSON.stringify(logic.readDeckPlan(DRAWN)), new Date().toISOString());
  assert.equal(move("Mess", ["Cockpit"]).ok, true);
  const map = couchNavigation(world.campaign());
  assert.ok(map.deck);
  assert.equal(map.deck.here, "mess");
  assert.ok(map.deck.rooms.find((room) => room.id === "mess").crew.some((member) => member.name === "Ada"));
  assert.doesNotMatch(JSON.stringify(map), /Engine Room|Crawlspace|Specimen Lab/);
  assert.match(couchWhereaboutsPrompt(world.campaign()), /DECK PLAN[\s\S]*Engine Room/);
  void crew;
});

world.close();
finish();
