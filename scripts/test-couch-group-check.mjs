// A couch night's group check (docs/couch-mode-spec.md 2.10): the GM calls
// it once, every crew member throws on their own phone, the TV fills one
// card, and the resumed GM turn reads one answer for its one call. The pure
// tally and wording first (src/lib/couch/group-check-logic.ts), then a whole
// turn through the fake model and the pending-rolls route.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { call, fakeModel, reply, settleQueue } from "./lib/enforce-narrator.mjs";
import { call as callRoute } from "./lib/enforce-campaign.mjs";

const world = await openWorld({ gameSettings: { couchMode: true, ttsEnabled: false } });
const {
  couchGroupAnswer,
  couchGroupCall,
  couchGroupResult,
  groupCheckWhat,
  groupNeeded,
  groupTally,
  landGroupThrow,
} = await import("../src/lib/couch/group-check-logic.ts");
const { latestCouchGroup } = await import("../src/lib/couch/group-check.ts");
const { getDmTurn } = await import("../src/lib/db/dm-turns.ts");
const { listRecentMessages } = await import("../src/lib/db/messages.ts");
const { subscribe } = await import("../src/lib/events.ts");
const { CouchRolls } = await import("../src/components/couch/CouchRolls.tsx");
const { CouchRollPrompt } = await import("../src/components/couch/CouchRollPrompt.tsx");
const { campaignReducer, INITIAL_CAMPAIGN_STATE, STREAMED_EVENTS } = await import("../src/app/campaigns/[campaignId]/useCampaignStream.ts");
const throwRoute = await world.route("campaigns/[campaignId]/pending-rolls/[pendingRollId]");

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`ok: ${name}`); }

const member = (name, pendingId, state = "waiting", total = null) => ({ characterId: `c-${name}`, name, pendingId, state, total, rollId: total === null ? null : `r-${name}` });
const group = (members, overrides = {}) => ({
  id: "g1", turnId: "t1", toolCallId: "call_1", check: "stealth", what: "Stealth", dc: 15, difficulty: "moderate",
  reason: "Slip past the thing in the vents.", members, decidedBy: null, status: "open", answered: false, createdAt: new Date().toISOString(), ...overrides,
});

await test("at least half must make it, and the outcome is known as soon as the dice left cannot change it", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(groupNeeded), [1, 1, 2, 2, 3]);
  let five = group(["Ash", "Bea", "Cy", "Dov", "Eli"].map((name) => member(name, `p-${name}`)));
  assert.equal(groupTally(five).passed, null);
  five = landGroupThrow(five, "p-Ash", { id: "r1", total: 18 });
  five = landGroupThrow(five, "p-Bea", { id: "r2", total: 4 });
  five = landGroupThrow(five, "p-Cy", { id: "r3", total: 3 });
  assert.equal(groupTally(five).passed, null, "two of five still to come");
  five = landGroupThrow(five, "p-Dov", { id: "r4", total: 15 });
  assert.equal(groupTally(five).passed, null, "a target met exactly passes, but three are needed");
  assert.equal(five.status, "open");
  five = landGroupThrow(five, "p-Eli", { id: "r5", total: 20 });
  assert.equal(groupTally(five).passed, true);
  assert.equal(five.decidedBy, "c-Eli", "the last die decided it");
  assert.equal(five.status, "done");
  assert.equal(landGroupThrow(five, "p-Eli", { id: "r6", total: 1 }), five, "a throw already in changes nothing");

  let three = group(["Ash", "Bea", "Cy"].map((name) => member(name, `p-${name}`)));
  three = landGroupThrow(three, "p-Ash", { id: "r1", total: 2 });
  three = landGroupThrow(three, "p-Bea", { id: "r2", total: 9 });
  assert.equal(groupTally(three).passed, false, "two misses of three put it out of reach");
  assert.equal(three.decidedBy, "c-Bea");
  assert.equal(three.status, "open", "the last crew member still throws");
  three = landGroupThrow(three, "p-Cy", { id: "r3", total: 19 });
  assert.equal(three.decidedBy, "c-Bea", "a later throw does not take the decision");
});

await test("the narrator reads one call and one verdict, never a crew member's dice", () => {
  const four = group(["Ash", "Bea", "Cy", "Dov"].map((name) => member(name, `p-${name}`)));
  assert.equal(couchGroupCall(four), "Group check · Stealth. Slip past the thing in the vents. Everyone, take your phone and roll. Target 15; meet or beat it. 2 of 4 of you must make it.");
  const done = ["Ash", "Bea", "Cy", "Dov"].reduce((at, name, index) => landGroupThrow(at, `p-${name}`, { id: `r${index}`, total: [16, 3, 17, 2][index] }), four);
  assert.equal(couchGroupResult(done), "2 of 4 made it. The group succeeds. Cy's roll decided it.");
  assert.equal(couchGroupResult(landGroupThrow(group([member("Ash", "p-Ash")]), "p-Ash", { id: "r", total: 3 })), "0 of 1 made it. The group fails.");
  assert.equal(groupCheckWhat("sleight_of_hand"), "Sleight of Hand");
  assert.equal(groupCheckWhat("str"), "Strength check");
});

await test("the GM's answer has group_check's shape and says the room already heard it", () => {
  const done = landGroupThrow(group([member("Ash", "p-Ash"), member("Bea", null, "fail")]), "p-Ash", { id: "r", total: 15 });
  const answer = couchGroupAnswer(done);
  assert.equal(answer.passed, true);
  assert.equal(answer.successes, 1);
  assert.equal(answer.total, 2);
  assert.deepEqual(answer.results, [{ name: "Ash", total: 15, success: true }, { name: "Bea", total: 0, success: false }]);
  assert.match(answer.note, /already read the dice and the verdict aloud/);
});

const heroes = [
  world.addHero({ name: "Ripley Vance", class: "rogue" }),
  world.addHero({ name: "Dallas Okoro", class: "fighter" }),
  world.addHero({ name: "Lambert Shaw", class: "wizard" }),
];
const narration = { volume: 1, muted: false, unlocked: true, playingMessageId: null, playbackFailure: null, skip: () => {} };

const events = [];
const off = subscribe(world.campaignId, (chunk) => {
  const type = /^event: (.+)$/m.exec(chunk)?.[1];
  const data = /^data: (.+)$/m.exec(chunk)?.[1];
  const seq = Number(/^id: (\d+)$/m.exec(chunk)?.[1] ?? 0);
  if (type && data) events.push({ type, payload: JSON.parse(data), seq });
});
const model = await fakeModel();
try {
  model.pointAt(world);
  const groupCall = call("group_check", { skill: "stealth", difficulty: "moderate", reason: "Slip past the thing in the vents; failure wakes it.", about: "none", by: "none", terrain: "none" });
  model.script([
    reply({ calls: [groupCall] }),
    reply({ text: "You ease past the vent. Something inside shifts, then settles." }),
  ]);
  await model.turn(world, "We sneak past the vent together.", heroes[0].id);
  const parkedAt = events.length;
  const parked = events.filter((event) => event.type === "roll_pending");
  const announced = events.filter((event) => event.type === "couch_group");

  await test("one call parks a roll on every crew member's phone and one card for the TV", () => {
    assert.equal(parked.length, 3, JSON.stringify(events.map((event) => event.type)));
    assert.deepEqual(new Set(parked.map((event) => event.payload.pendingRoll.characterId)), new Set(heroes.map((hero) => hero.id)));
    assert.equal(announced.length, 1);
    const card = announced[0].payload.group;
    assert.equal(card.what, "Stealth");
    assert.equal(card.members.length, 3);
    assert.ok(card.members.every((entry) => entry.state === "waiting" && entry.pendingId));
    assert.ok(announced[0].seq < parked[0].seq, "the card is published before its rolls, so no screen calls them one by one");
    assert.equal(events.filter((event) => event.type === "couch_roll").length, 0, "nothing lands before the throws");
    assert.equal(getDmTurn(card.turnId).status, "awaiting_rolls");
    assert.equal(latestCouchGroup(world.campaignId).id, card.id, "a TV that reloads finds it");
  });

  // The stream as a TV and a phone hold it once the call is in.
  let state = { ...INITIAL_CAMPAIGN_STATE, campaign: world.campaign(), sheets: world.sheets(), caps: { ...INITIAL_CAMPAIGN_STATE.caps, steersStory: true } };
  for (const event of events) state = campaignReducer(state, { type: "event", eventType: event.type, payload: event.payload, seq: event.seq });

  await test("the TV shows one group card, not three separate calls", () => {
    assert.ok(STREAMED_EVENTS.includes("couch_group"));
    const html = renderToStaticMarkup(createElement(CouchRolls, { state: { ...state, lastSeq: 0 }, narration }));
    for (const text of ["Group check", "Stealth", "Slip past the thing in the vents", "2 of 3 must make it", ...heroes.map((hero) => hero.name)]) assert.ok(html.includes(text), text);
    assert.ok(html.includes("Everyone throws from their phone"), "the card's own wait line");
    assert.ok(!html.includes("couch-tv-call-card"), "no single-roll call cards");
    assert.ok(!html.includes("Roll for"), "the host's stand-in throw waits for phones that went quiet");
  });

  await test("each phone shows its own die and says it is a group check", () => {
    const html = renderToStaticMarkup(createElement(CouchRollPrompt, { state: { ...state, me: { id: heroes[1].userId } }, sheet: world.sheet(heroes[1].id) }));
    assert.match(html, /Group check · Dallas Okoro, your roll/);
    assert.match(html, /Everyone rolls\. 2 of 3 of you must make it\./);
    assert.match(html, /need 15 or more/);
  });

  world.signIn(world.owner);
  const throwFor = async (pending) => {
    const thrown = await callRoute(throwRoute, "POST", { fallback: "digital" }, { campaignId: world.campaignId, pendingRollId: pending.id });
    assert.equal(thrown.status, 200, JSON.stringify(thrown.json));
    return thrown.json.roll;
  };
  const rolls = [];
  rolls.push(await throwFor(parked[0].payload.pendingRoll));
  rolls.push(await throwFor(parked[1].payload.pendingRoll));
  await settleQueue(world.campaignId);

  await test("the turn waits until the last crew member throws, and each throw fills the card", () => {
    assert.equal(model.served(), 1, "the GM is not resumed on a partial group");
    const updates = events.slice(parkedAt).filter((event) => event.type === "couch_group");
    assert.equal(updates.length, 2);
    assert.equal(updates.at(-1).payload.group.members.filter((entry) => entry.state !== "waiting").length, 2);
    const landed = events.slice(parkedAt).filter((event) => event.type === "couch_roll");
    assert.equal(landed.length, 2, "each phone still gets its own result");
    assert.ok(landed.every((event) => event.payload.groupId === updates[0].payload.group.id), "marked as the group's, so the TV shows them in the card");
  });

  rolls.push(await throwFor(parked[2].payload.pendingRoll));
  await settleQueue(world.campaignId);

  await test("the last throw finishes the group and the GM reads one answer for its one call", () => {
    const final = events.filter((event) => event.type === "couch_group").at(-1).payload.group;
    assert.equal(final.status, "done");
    assert.equal(model.served(), 2);
    const tools = model.requests[1].messages.filter((message) => message.role === "tool");
    const answers = tools.filter((message) => message.tool_call_id === groupCall.id);
    assert.equal(answers.length, 1, JSON.stringify(tools));
    const answer = JSON.parse(answers[0].content);
    const made = rolls.filter((roll) => roll.total >= 15).length;
    assert.equal(answer.successes, made);
    assert.equal(answer.total, 3);
    assert.equal(answer.passed, made >= 2);
    assert.equal(answer.rolledBy, "each crew member, from their phone");
    assert.equal(latestCouchGroup(world.campaignId), null, "no open group is left for a reload");
    assert.ok(listRecentMessages(world.campaignId, 4).some((message) => message.content.includes("ease past the vent")), "the GM narrates once the dice are in");
  });
} finally {
  off();
  model.close();
  world.close();
}
console.log(`test-couch-group-check: ${passed} passed`);
