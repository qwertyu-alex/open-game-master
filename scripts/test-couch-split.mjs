// A couch crew splitting up (docs/couch-navigation.md "Splitting up",
// src/lib/couch/whereabouts*.ts):
//
//   a group is everyone in one place: move_party naming some of the scene's
//   group splits it, the rest stay, and the scene follows those who went;
//   with no names it moves only the group in the scene;
//   never more than three groups, refused before anything is written;
//   someone off scene moves only into the scene's place, which is a reunion;
//   cut_to turns the scene to another group (the GM chooses when), never
//   while a fight holds it, and hands back that group's moves since;
//   only the scene is waited on, rolled for, fielded in a fight and painted;
//   the GM reads who is where, how long each group has waited and what it
//   sent; a split crew's messages carry their group for the phones;
//   every seat is told who stands where, the scene's group first, and the
//   turn line tells an off-scene player to write on;
//   an ordinary table is untouched.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-split");
const world = await openWorld({
  status: "lobby",
  gameSettings: { couchMode: true, mapsEnabled: false, ttsEnabled: false, waitForTable: true, waitForTableSeconds: 60 },
});
const campaigns = await import("../src/lib/db/campaigns.ts");
const locations = await import("../src/lib/db/locations.ts");
const messages = await import("../src/lib/db/messages.ts");
const { couchNavigation, couchWhereaboutsPrompt } = await import("../src/lib/couch/navigation.ts");
const where = await import("../src/lib/couch/whereabouts.ts");
const logic = await import("../src/lib/couch/whereabouts-logic.ts");
const { handleLocationCall } = await import("../src/lib/dm/turn.ts");
const { handleCutTo } = await import("../src/lib/dm/couch-tools.ts");
const { fieldedSheets } = await import("../src/lib/dm/roster.ts");
const { gateAiCall } = await import("../src/lib/dm/ai-gate.ts");
const { sceneShotCast } = await import("../src/lib/dm/scene-shot.ts");
const { currentTableWait } = await import("../src/lib/dm/table-wait.ts");
const { storyBeats } = await import("../src/components/couch/couch-logic.ts");
const { couchTurn } = await import("../src/components/couch/phone-logic.ts");
const { mapSplit, myGroup } = await import("../src/lib/couch/navigation-logic.ts");
const { CouchStory } = await import("../src/components/couch/CouchStory.tsx");

const crew = ["Ada", "Bo", "Cy", "Di"].map((name) => world.addHero({ name, user: world.addUser(name) }));
const [ada, bo, cy, di] = crew;
campaigns.setCampaignStatus(world.campaignId, "active");
const move = (name, characterIds, connections = []) =>
  handleLocationCall(world.campaign(), "move_party", JSON.stringify({ name, connections, visionClear: false, ...(characterIds ? { characterIds } : {}) }), false);
const groups = () => where.couchGroups(world.campaign());
const placesOf = () => Object.fromEntries(groups().map((group) => [group.placeName, group.members.map((member) => member.name).sort()]));
const scene = () => locations.getCurrentLocation(world.campaignId).name;
let seq = 1000;
const post = (sheet, content) =>
  messages.insertCampaignMessage({ campaignId: world.campaignId, seq: (seq += 1), authorType: "player", userId: sheet.userId, characterId: sheet.id, content });
const narrate = (content) => messages.insertCampaignMessage({ campaignId: world.campaignId, seq: (seq += 1), authorType: "dm", content });

await test("the pure rules: groups by place, the scene first, a split, a reunion and the cap", () => {
  const people = crew.map((sheet) => ({ id: sheet.id, name: sheet.name, userId: sheet.userId, portraitUrl: null }));
  const together = logic.crewGroups(people, new Map(), "Airlock");
  assert.equal(together.length, 1, "nobody placed yet stands where the scene is");
  const apart = logic.crewGroups(people, new Map([[ada.id, "Medbay"], [bo.id, "Lab"]]), "Lab");
  assert.deepEqual(apart.map((group) => [group.placeName, group.inScene, group.members.length]), [["Lab", true, 3], ["Medbay", false, 1]]);
  const plan = logic.planMove({ crew: people, groups: apart, destination: "Reactor", named: [bo.id] });
  assert.equal(plan.ok, true);
  const fourth = logic.planMove({ crew: people, groups: logic.crewGroups(people, new Map([[ada.id, "Medbay"], [bo.id, "Lab"], [cy.id, "Reactor"], [di.id, "Reactor"]]), "Reactor"), destination: "Bridge", named: [cy.id] });
  assert.equal(fourth.ok, false);
  assert.equal(fourth.refused, "rules");
  assert.match(fourth.error, /at most 3/);
});

await test("a move naming some of the crew splits it: the rest stay and the scene follows those who went", () => {
  assert.equal(move("Airlock", null, ["Medbay", "Lab", "Reactor"]).ok, true);
  assert.deepEqual(placesOf(), { Airlock: ["Ada", "Bo", "Cy", "Di"] });
  const split = move("Medbay", [ada.id, bo.id], ["Airlock"]);
  assert.equal(split.ok, true, split.error);
  assert.match(split.note, /off scene/);
  assert.deepEqual(placesOf(), { Medbay: ["Ada", "Bo"], Airlock: ["Cy", "Di"] });
  assert.equal(scene(), "Medbay");
  assert.equal(groups()[0].inScene, true);
  assert.equal(groups()[0].placeName, "Medbay");
});

await test("no names moves only the group in the scene, and a fourth group is refused before any write", () => {
  assert.equal(move("Lab", null, ["Medbay"]).ok, true);
  assert.deepEqual(placesOf(), { Lab: ["Ada", "Bo"], Airlock: ["Cy", "Di"] });
  assert.equal(move("Cold store", [bo.id]).ok, true, "a third group is fine");
  assert.deepEqual(placesOf(), { "Cold store": ["Bo"], Lab: ["Ada"], Airlock: ["Cy", "Di"] });
  const before = locations.listLocations(world.campaignId).length;
  handleCutTo(world.campaign(), JSON.stringify({ place: "Airlock" }));
  const fourth = move("Reactor", [cy.id]);
  assert.equal(fourth.refused, "rules");
  assert.match(fourth.error, /4 groups; at most 3/);
  assert.equal(locations.listLocations(world.campaignId).length, before, "nothing was written");
  assert.equal(scene(), "Airlock");
});

await test("someone off scene moves only into the scene's place, and walking in is the reunion", () => {
  const away = move("Reactor", [ada.id]);
  assert.equal(away.retry, true);
  assert.match(away.error, /Ada is in Lab, out of the scene/);
  const joined = move("Airlock", [ada.id]);
  assert.equal(joined.ok, true, joined.error);
  assert.deepEqual(placesOf(), { Airlock: ["Ada", "Cy", "Di"], "Cold store": ["Bo"] });
});

await test("cut_to turns the scene to a group, hands back its moves, and refuses what makes no sense", () => {
  narrate("The airlock groans.");
  post(bo, "I check the freezer lockers.");
  const cut = handleCutTo(world.campaign(), JSON.stringify({ characterIds: [bo.id] }));
  assert.equal(cut.ok, true, cut.error);
  assert.equal(scene(), "Cold store");
  assert.match(cut.note, /with Bo in Cold store/);
  assert.match(cut.note, /I check the freezer lockers/);
  const again = handleCutTo(world.campaign(), JSON.stringify({ characterIds: [bo.id] }));
  assert.equal(again.ok, true, "already there is no mistake: a question to them may have cut to them");
  assert.match(again.note, /already with Bo/);
  assert.equal(handleCutTo(world.campaign(), JSON.stringify({ characterIds: [bo.id, cy.id] })).retry, true, "two places at once");
  assert.equal(handleCutTo(world.campaign(), JSON.stringify({ place: "Nowhere" })).retry, true);
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(handleCutTo(ordinary, JSON.stringify({ place: "Airlock" })).refused, "rules");
});

await test("only the scene is fielded, rolled for, painted and waited on", () => {
  // The scene is with Bo in the cold store; Ada, Cy and Di are in the airlock.
  assert.deepEqual(fieldedSheets(world.campaign()).map((sheet) => sheet.name), ["Bo"]);
  const gate = (characterId) =>
    gateAiCall("request_roll", JSON.stringify({ characterId, kind: "check", detail: "perception" }), { campaign: world.campaign(), turn: { actor: "ai" }, sheetsById: new Map() });
  assert.match(gate(cy.id).result?.error ?? "", /Cy is in Airlock, off scene/);
  assert.equal(gate(bo.id).result, undefined);
  const cast = sceneShotCast(world.campaignId, "Bo and Cy");
  assert.ok(cast.some((member) => member.id === bo.id) && !cast.some((member) => member.id === cy.id), "nobody off scene is framed");
  narrate("Frost on the lockers.");
  where.markSceneSeen(world.campaign(), seq);
  post(cy, "I wave at the camera.");
  const wait = currentTableWait(world.campaignId);
  assert.ok(wait === null || !wait.waitingOn.some((seat) => seat.userId === cy.userId), "an off-scene seat is never waited on");
});

await test("the GM reads who is where, how long each group has waited, and what it sent", () => {
  narrate("Bo pries a locker open.");
  narrate("Something moves in the frost.");
  const prompt = couchWhereaboutsPrompt(world.campaign());
  assert.match(prompt, /split into 2 groups \(at most 3\)/);
  assert.match(prompt, /IN THE SCENE: Cold store: Bo/);
  assert.match(prompt, /Off scene: Airlock: .*Cy/);
  assert.match(prompt, /Off scene for \d+ of your turns/);
  assert.match(prompt, /I wave at the camera/);
  assert.match(prompt, /Cut to them soon/);
  assert.match(prompt, /cut_to/);
  const nav = couchNavigation(world.campaign());
  assert.equal(nav.groups.length, 2);
  assert.equal(nav.groups[0].inScene, true);
  assert.equal(nav.here.name, "Cold store");
});

await test("a split crew's messages carry their group, and an off-scene move shows to everyone at once", () => {
  const sent = post(cy, "We bar the inner door.");
  const tag = where.tagMessage(world.campaign(), sent.id, cy.id);
  assert.equal(tag.inScene, false);
  assert.equal(tag.placeName, "Airlock");
  assert.deepEqual([...tag.sheetIds].sort(), [ada.id, cy.id, di.id].sort());
  assert.ok(where.listSceneTags(world.campaignId).some((entry) => entry.messageId === sent.id));
  const list = messages.listRecentMessages(world.campaignId, 50);
  const blind = storyBeats(list, 8, bo.userId);
  assert.ok(!blind.after.some((entry) => entry.id === sent.id), "without the mark it would wait for the round");
  const open = storyBeats(list, 8, bo.userId, new Set([sent.id]));
  assert.ok(open.after.some((entry) => entry.id === sent.id));
  const phone = renderToStaticMarkup(
    createElement(CouchStory, {
      messages: list,
      sheets: crew.map((entry) => world.sheet(entry.id)),
      rolls: [],
      meUserId: ada.userId,
      active: false,
      whispers: [],
      onAsk: () => {},
      watchRef: () => () => {},
      sceneTags: [tag],
      mySheetId: ada.id,
    }),
  );
  assert.match(phone, /class="couch-group-tag" data-mine="" data-off="">/);
  assert.match(phone, /Your group/);
  assert.match(phone, /Off scene/);
});

await test("every seat is told who stands where: the scene's group first, each other group in its own place", () => {
  const nav = couchNavigation(world.campaign());
  assert.equal(nav.here.name, "Cold store");
  assert.equal(mapSplit(nav), true);
  assert.deepEqual(nav.groups.map((group) => [group.room.name, group.inScene, group.crew.map((member) => member.name)]), [
    ["Cold store", true, ["Bo"]],
    ["Airlock", false, ["Ada", "Cy", "Di"]],
  ]);
  assert.equal(myGroup(nav, new Set([cy.id])).room.name, "Airlock");
  assert.equal(myGroup(nav, new Set([bo.id])).inScene, true);
  assert.doesNotMatch(JSON.stringify(nav), /agenda|backstory/);
});

await test("an off-scene player's line says where the story is and to write on, with no Pass", () => {
  const line = couchTurn({
    ended: false,
    muted: false,
    myRolls: 0,
    dmStatus: "thinking",
    floor: { mode: "open" },
    meUserId: cy.userId,
    names: {},
    waitingOn: [],
    offScene: { place: "Airlock", scenePlace: "Cold store", sceneNames: ["Bo"] },
  });
  assert.equal(line.tone, "waiting");
  assert.equal(line.headline, "The story is with Bo in Cold store");
  assert.match(line.prompt, /You're in Airlock\. Send your next move any time/);
  assert.equal(line.canPass, false);
  // A question the GM put to them wins over where the map last said they stand.
  const asked = couchTurn({
    ended: false, muted: false, myRolls: 0, dmStatus: "idle",
    floor: { mode: "spotlight", userIds: [cy.userId], prompt: "What do you examine?", respondedUserIds: [] },
    meUserId: cy.userId, names: {}, waitingOn: [],
    offScene: { place: "Airlock", scenePlace: "Cold store", sceneNames: ["Bo"] },
  });
  assert.equal(asked.tone, "yours");
  assert.equal(asked.prompt, "What do you examine?");
});

await test("the turn follows the scene: a cut withdraws a question left with someone off scene, and a question to someone off scene cuts to them", async () => {
  const { couchSpotlight } = await import("../src/lib/couch/navigation.ts");
  const { tvTurnSeats } = await import("../src/components/couch/couch-logic.ts");
  // Pure: what survives a cut, and where a question goes.
  const ask = (userIds) => ({ mode: "spotlight", userIds, prompt: "What do you examine?", respondedUserIds: [] });
  assert.deepEqual(logic.floorAfterCut(ask([cy.userId]), new Set([bo.userId])), { mode: "open" });
  assert.equal(logic.floorAfterCut(ask([bo.userId]), new Set([bo.userId])), null, "a question to the new scene stands");
  assert.deepEqual(logic.floorAfterCut({ mode: "hold", next: ask([cy.userId, bo.userId]) }, new Set([bo.userId])).next.userIds, [bo.userId]);
  assert.equal(logic.floorAfterCut({ mode: "open" }, new Set()), null);
  // The live night's case: the scene is with Bo; a question waits on Cy
  // (off scene). Cutting to Cy's group keeps it; cutting back withdraws it.
  campaigns.setFloor(world.campaignId, ask([cy.userId]));
  assert.equal(handleCutTo(world.campaign(), JSON.stringify({ characterIds: [cy.id] })).ok, true);
  assert.deepEqual(campaigns.getFloor(world.campaignId).userIds, [cy.userId], "Cy's question goes with the cut to Cy");
  assert.equal(handleCutTo(world.campaign(), JSON.stringify({ characterIds: [bo.id] })).ok, true);
  assert.deepEqual(campaigns.getFloor(world.campaignId), { mode: "open" }, "a question left off scene no longer holds the scene's phones");
  // A question to someone off scene turns the scene to them.
  const asked = couchSpotlight(world.campaign(), { userIds: [cy.userId], prompt: "What do you examine?" });
  assert.deepEqual(asked.userIds, [cy.userId]);
  assert.equal(scene(), "Airlock", "the TV turns to whoever's turn it is");
  // Asking both groups asks only the scene's.
  assert.deepEqual(couchSpotlight(world.campaign(), { userIds: [bo.userId, ada.userId], prompt: "?" }).userIds, [ada.userId]);
  assert.equal(scene(), "Airlock");
  handleCutTo(world.campaign(), JSON.stringify({ characterIds: [bo.id] }));
  // The TV lights whoever was asked, and the open floor's waiting seats.
  const names = { [cy.userId]: "Cy", [bo.userId]: "Bo" };
  assert.deepEqual(tvTurnSeats({ floor: ask([cy.userId, bo.userId]), gmIdle: true, waitingOn: [], names }).map((seat) => seat.name), ["Cy", "Bo"]);
  assert.deepEqual(tvTurnSeats({ floor: { ...ask([cy.userId, bo.userId]), respondedUserIds: [cy.userId] }, gmIdle: true, waitingOn: [], names }).map((seat) => seat.name), ["Bo"]);
  assert.deepEqual(tvTurnSeats({ floor: { mode: "open" }, gmIdle: true, waitingOn: [{ userId: bo.userId, name: "Bo" }], names }).map((seat) => seat.name), ["Bo"]);
  assert.deepEqual(tvTurnSeats({ floor: ask([cy.userId]), gmIdle: false, waitingOn: [], names }), [], "nobody while the GM writes");
});

await test("a fight is the scene's: no cut away from it, and the others join it by walking in", async () => {
  const encounters = await import("../src/lib/db/encounters.ts");
  await world.beginFight([{ monster: "goblin", count: 1 }]);
  // A couch night's initiative is thrown from the phone; Bo's lands here.
  const { recordInitiativeRoll } = await import("../src/lib/dm/encounter-tools.ts");
  recordInitiativeRoll(world.campaignId, bo.id, 15);
  assert.equal(encounters.getActiveEncounter(world.campaignId).orderReady, true, "Bo alone was all the fight waited on");
  const order = () => encounters.getActiveEncounter(world.campaignId).order.filter((entry) => entry.kind === "pc").map((entry) => entry.name).sort();
  assert.deepEqual(order(), ["Bo"], "only the group in the scene is in the fight");
  const cut = handleCutTo(world.campaign(), JSON.stringify({ place: "Airlock" }));
  assert.equal(cut.refused, "rules");
  assert.match(cut.error, /fight holds the scene/);
  const ran = move("Cold store", [cy.id]);
  assert.equal(ran.ok, true, ran.error);
  assert.deepEqual(order(), ["Bo", "Cy"], "Cy ran into the fight and took a place in the order");
  assert.deepEqual(placesOf(), { "Cold store": ["Bo", "Cy"], Airlock: ["Ada", "Di"] });
});

await test("nothing the GM reads tells it to keep the crew together", async () => {
  // A leftover "SHARED ROUTE: never split the crew" in the couch rules beat
  // the map's split rules on the night: the GM kept the crew together.
  const { COUCH_RULES, COUCH_FIGHT_RULES } = await import("../src/lib/couch/prompt-logic.ts");
  for (const text of [COUCH_RULES, COUCH_FIGHT_RULES, logic.whereaboutsPrompt(groups().slice(0, 1).map((group) => ({ ...group, inScene: true })), [])]) {
    assert.doesNotMatch(text, /never split|no split scenes|move (there )?together|(?<!ask them to )stay together/i);
  }
  assert.match(COUCH_RULES, /split the crew with move_party naming who goes/);
  assert.match(logic.whereaboutsPrompt(groups().slice(0, 1).map((group) => ({ ...group, inScene: true })), []), /do not ask them to stay together: call move_party naming who goes/);
});

await test("an ordinary table is untouched", () => {
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(where.couchGroups(ordinary), null);
  assert.equal(where.inSceneIds(ordinary), null);
  assert.equal(couchWhereaboutsPrompt(ordinary), "");
});

world.close();
finish();
