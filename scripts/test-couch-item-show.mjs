// The TV's pictures of the things the crew carries (src/lib/couch/
// item-show*.ts): the weapon on the card of the roll it swings, and an item
// used in the open beside the scene for the turn that used it, named under
// it. Before, the pictures lived only in each phone's Gear section and the
// room never saw what anyone held.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { call, fakeModel, reply, settleQueue } from "./lib/enforce-narrator.mjs";

const world = await openWorld({ gameSettings: { couchMode: true, ttsEnabled: false } });
const { itemShowCaption, itemUseFromTool, rollItemTerm, rollWielderId, tvItemShow } = await import("../src/lib/couch/item-show-logic.ts");
const { publishCouchItemUse } = await import("../src/lib/couch/item-show.ts");
const { publishCouchRollFeedback } = await import("../src/lib/couch/roll-feedback.ts");
const { itemArtKey } = await import("../src/lib/couch/item-art-logic.ts");
const { recordItemArtTry, setItemArt } = await import("../src/lib/couch/store.ts");
const { rollExpression } = await import("../src/lib/dice.ts");
const { insertRoll } = await import("../src/lib/db/rolls.ts");
const { updateGameSettings } = await import("../src/lib/db/campaigns.ts");
const { subscribe } = await import("../src/lib/events.ts");
const { EVENT_AUDIENCE } = await import("../src/lib/event-audience.ts");
const { CouchRollCard } = await import("../src/components/couch/CouchRolls.tsx");
const { TvPictures } = await import("../src/components/couch/CouchTvPictures.tsx");
const { campaignReducer, INITIAL_CAMPAIGN_STATE, STREAMED_EVENTS } = await import("../src/app/campaigns/[campaignId]/useCampaignStream.ts");

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`ok: ${name}`); }

await test("a weapon roll names its weapon; other rolls and an enemy's claw name none", () => {
  assert.equal(rollItemTerm("attack", "Rapier vs Bellweld Bladder"), "Rapier");
  assert.equal(rollItemTerm("damage", "Rapier (half on a miss) vs Bellweld Bladder"), "Rapier");
  assert.equal(rollItemTerm("damage", "Pulse rifle damage vs Drone"), "Pulse rifle");
  assert.equal(rollItemTerm("ability_check", "Rapier vs Bellweld Bladder"), null);
  assert.equal(rollWielderId({ characterId: "pc", attacker: null }), "pc");
  assert.equal(rollWielderId({ characterId: "pc", attacker: { kind: "sheet", id: "pc2" } }), "pc2");
  assert.equal(rollWielderId({ characterId: "pc", attacker: { kind: "enemy", id: "e1" } }), null);
});

await test("a use_item is read from the call and its answer; a refusal is nothing", () => {
  const sheets = [{ id: "s1", name: "Renn Calder" }, { id: "s2", name: "Vasquez" }];
  const use = itemUseFromTool(JSON.stringify({ characterId: "Renn Calder", item: "stim", targetCharacterId: "s2" }), { ok: true, used: "Stim injector", remaining: 1 }, sheets);
  assert.deepEqual(use, { sheet: sheets[0], item: "Stim injector", target: sheets[1], remaining: 1 });
  assert.equal(itemUseFromTool(JSON.stringify({ characterId: "s1", item: "stim" }), { error: "Not carried.", refused: "rules" }, sheets), null);
  assert.equal(itemUseFromTool("{", { ok: true }, sheets), null);
  assert.equal(itemUseFromTool(JSON.stringify({ characterId: "nobody", item: "stim" }), { ok: true }, sheets), null);
  // Used on oneself is not "on" anyone.
  assert.equal(itemUseFromTool(JSON.stringify({ characterId: "s1", item: "stim", targetCharacterId: "s1" }), { ok: true }, sheets).target, undefined);
});

await test("the caption says who used it, on whom, and when it was the last one", () => {
  assert.deepEqual(itemShowCaption({ name: "Stim injector", characterName: "Renn", remaining: 1 }), { title: "Stim injector", line: "Renn uses it · 1 left" });
  assert.deepEqual(itemShowCaption({ name: "a flare", characterName: "Renn", targetName: "Vasquez", remaining: 0 }), { title: "Flare", line: "Renn uses it on Vasquez · the last one" });
  assert.equal(itemShowCaption({ name: "Cutting torch", characterName: "Renn" }).line, "Renn uses it");
});

await test("the item holds the column for its own turn, and gives way to the next turn or the same turn's close-up", () => {
  const show = { id: "i1", turnId: "t1", characterId: "s1", characterName: "Renn", name: "Stim injector", art: "/a.png", seq: 10 };
  const own = { seq: 11, authorType: "dm", dmTurnId: "t1" };
  assert.equal(tvItemShow([show], [own]), show);
  assert.equal(tvItemShow([show], [own, { seq: 14, authorType: "dm", dmTurnId: "t2" }]), null);
  assert.equal(tvItemShow([show], [{ ...own, generatedImage: { url: "/insert.png", shot: { kind: "insert" } } }]), null);
  assert.equal(tvItemShow([show], [{ ...own, generatedImage: { url: "/wide.png", shot: { kind: "wide" } } }]), show);
  assert.equal(tvItemShow([], [own]), null);
});

const events = [];
const off = subscribe(world.campaignId, (chunk) => {
  const type = /^event: (.+)$/m.exec(chunk)?.[1];
  const data = /^data: (.+)$/m.exec(chunk)?.[1];
  if (type && data) events.push({ type, payload: JSON.parse(data) });
});
const hero = world.addHero({ name: "Renn Calder", class: "fighter" });
world.patch(hero.id, {
  equipment: [
    { name: "Longsword", qty: 1 },
    { name: "Stim injector", qty: 2 },
    { name: "Signal flare", qty: 1 },
  ],
});
// Painted earlier in the night, as the phone's Gear section asked for it.
recordItemArtTry(world.campaignId, itemArtKey("Stim injector"));
setItemArt(world.campaignId, itemArtKey("Stim injector"), "/uploads/stim.png");
const model = await fakeModel();
try {
  await test("a crew member's weapon roll carries the weapon's picture to the TV; an enemy's does not", () => {
    const attack = insertRoll({
      campaignId: world.campaignId, characterId: hero.id, requestedBy: "dm", kind: "attack", detail: "Longsword vs Bellweld Bladder",
      dc: 13, result: rollExpression("1d20+5", () => 14), attacker: { kind: "sheet", id: hero.id, name: hero.name },
    });
    const claw = insertRoll({
      campaignId: world.campaignId, characterId: hero.id, requestedBy: "dm", kind: "attack", detail: "Longsword vs Renn Calder",
      dc: 13, result: rollExpression("1d20+3", () => 9), attacker: { kind: "enemy", id: "e1", name: "Bellweld" },
    });
    const start = events.length;
    publishCouchRollFeedback(world.campaign(), [attack.id, claw.id]);
    const landed = events.slice(start).filter((event) => event.type === "couch_roll");
    assert.equal(landed.length, 2);
    assert.equal(landed[0].payload.item.name, "Longsword");
    assert.match(landed[0].payload.item.art, /\.(webp|png)$/);
    assert.equal(landed[1].payload.item, undefined);
    const html = renderToStaticMarkup(createElement(CouchRollCard, { feedback: landed[0].payload, phase: "result" }));
    assert.match(html, /data-item=""/);
    assert.match(html, /class="couch-tv-roll-item" data-good=""/);
    assert.ok(html.includes(landed[0].payload.item.art));
    assert.doesNotMatch(renderToStaticMarkup(createElement(CouchRollCard, { feedback: landed[1].payload, phase: "result" })), /couch-tv-roll-item/);
  });

  await test("an item the GM uses in a turn is shown to the whole table, named under its picture", async () => {
    model.pointAt(world);
    model.script([
      reply({ calls: [call("use_item", { characterId: hero.id, item: "Stim injector", reason: "Renn jabs the stim into their thigh." })] }),
      reply({ text: "The stim hits like cold water. Your hands stop shaking." }),
    ]);
    const start = events.length;
    await model.turn(world, "I use my stim injector.", hero.id);
    await settleQueue(world.campaignId);
    const shown = events.slice(start).filter((event) => event.type === "couch_item");
    assert.equal(shown.length, 1, JSON.stringify(events.slice(start).map((event) => event.type)));
    assert.equal(shown[0].payload.name, "Stim injector");
    assert.equal(shown[0].payload.art, "/uploads/stim.png");
    assert.equal(shown[0].payload.characterName, "Renn Calder");
    assert.equal(shown[0].payload.remaining, 1);
    assert.ok(shown[0].payload.turnId);
    assert.deepEqual(EVENT_AUDIENCE.couch_item, { kind: "table" });

    assert.ok(STREAMED_EVENTS.includes("couch_item"));
    const state = campaignReducer(INITIAL_CAMPAIGN_STATE, { type: "event", eventType: "couch_item", payload: shown[0].payload, seq: 40 });
    assert.equal(state.couchItems.length, 1);
    assert.deepEqual(campaignReducer(state, { type: "snapshot", payload: { lastSeq: 41 } }).couchItems, []);
    const caption = itemShowCaption(shown[0].payload);
    const html = renderToStaticMarkup(createElement(TvPictures, { scene: "/scene.png", insert: shown[0].payload.art, item: caption }));
    assert.match(html, /couch-tv-insert" data-item=""/);
    assert.match(html, /couch-tv-item[^>]*role="status"[^>]*><strong>Stim injector<\/strong><span>Renn Calder uses it · 1 left<\/span>/);
  });

  await test("an item without a picture yet, a refused use, or a table that is not a couch night shows nothing", () => {
    const start = events.length;
    const turnId = "turn-x";
    publishCouchItemUse(world.campaign(), turnId, "use_item", JSON.stringify({ characterId: hero.id, item: "Signal flare" }), { ok: true, used: "Signal flare", remaining: 0 });
    publishCouchItemUse(world.campaign(), turnId, "use_item", JSON.stringify({ characterId: hero.id, item: "Stim injector" }), { error: "Not now.", refused: "rules" });
    publishCouchItemUse(world.campaign(), turnId, "grant_item", JSON.stringify({ characterId: hero.id, item: "Stim injector" }), { ok: true });
    updateGameSettings(world.campaignId, { couchMode: false });
    publishCouchItemUse(world.campaign(), turnId, "use_item", JSON.stringify({ characterId: hero.id, item: "Stim injector" }), { ok: true, used: "Stim injector" });
    updateGameSettings(world.campaignId, { couchMode: true });
    assert.equal(events.slice(start).filter((event) => event.type === "couch_item").length, 0);
  });
} finally {
  off();
  model.close();
  world.close();
}
console.log(`test-couch-item-show: ${passed} passed`);
