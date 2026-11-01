// A couch crew's stress and panic (src/lib/couch/stress*.ts, push.ts,
// docs/couch-mode-spec.md 2.3), the ALIEN layer over the 5e engine:
//
//   a crew member carries 0 to 10; one d6 per point joins a check or save,
//   each 6 adds +2 to the total (a modifier, so the stored roll, its success
//   and the readout agree), any 1 sets off a panic roll, d6 + stress;
//   attacks, damage and initiative throw no stress dice;
//   only the top of the panic table takes moves, and the GM's replies count
//   them off; a scream frightens the others; the TV gets a card;
//   a wound adds 1, a crewmate's fall adds 1 to the rest, the dead carry
//   none; adjust_stress moves it for horror or rest and refuses an ordinary
//   table;
//   a failed check can be pushed once, for +1 stress, while its window
//   holds: the new throw answers the GM's call; declining lets the GM go on;
//   a group check, a pass or a roll with no DC offers no push;
//   the GM reads STRESS, and a panicking crew member is named as sitting out.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-stress");

const logic = await import("../src/lib/couch/stress-logic.ts");
const { throwStressDice, panicEntry, rollPanic, couchStressLine, panicMovesLeft, stressThrowWords, STRESS_MAX } = logic;

// A die that answers from a list, in order.
const dice = (...faces) => {
  let index = 0;
  return () => faces[index++ % faces.length];
};

await test("each six adds two, any one sets off panic, and no stress throws nothing", () => {
  assert.equal(throwStressDice(0, dice(6)), null);
  assert.deepEqual(throwStressDice(3, dice(6, 6, 4)), { faces: [6, 6, 4], sixes: 2, bonus: 4, panic: false });
  assert.deepEqual(throwStressDice(2, dice(1, 6)), { faces: [1, 6], sixes: 1, bonus: 2, panic: true });
  assert.equal(throwStressDice(40, dice(3)).faces.length, STRESS_MAX, "never more than ten dice");
});

await test("only the top of the panic table takes moves, and the GM's replies count them off", () => {
  assert.equal(panicEntry(5).label, "Holds it together");
  assert.equal(panicEntry(10).othersStress, 1, "a scream frightens the others");
  assert.equal(panicEntry(10).lose, 0);
  assert.equal(panicEntry(11).lose, 1);
  assert.equal(panicEntry(20).label, "Catatonic");
  assert.equal(panicEntry(20).lose, 2);
  assert.deepEqual(rollPanic(7, dice(6)), { face: 6, total: 13, entry: panicEntry(13) });
  assert.equal(panicMovesLeft(2, 1), 1);
  assert.equal(panicMovesLeft(1, 3), 0);
  const line = couchStressLine([
    { name: "Kara", view: { stress: 3, panic: null } },
    { name: "Teddy", view: { stress: 6, panic: { label: "Bolts", left: 1 } } },
    { name: "Mara", view: { stress: 0, panic: null } },
  ]);
  assert.match(line, /^STRESS \(server-run/);
  assert.match(line, /Kara 3, Teddy 6 \(PANICKING: bolts, sits out 1 more move; ignore any move they send\)/);
  assert.doesNotMatch(line, /Mara/);
  assert.equal(couchStressLine([{ name: "Kara", view: { stress: 0, panic: null } }]), "");
  assert.match(stressThrowWords("Kara", { faces: [1, 6], sixes: 1, bonus: 2, panic: true }, rollPanic(5, dice(6))), /Kara's stress dice: 1, 6 \(\+2\)\. PANIC \(6 \+ stress = 11\): Kara they run/);
});

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const store = await import("../src/lib/couch/store.ts");
const messages = await import("../src/lib/db/messages.ts");
const stress = await import("../src/lib/couch/stress.ts");
const push = await import("../src/lib/couch/push.ts");
const { createDmTurn, createPendingRoll, resolvePendingRoll, getPendingRoll } = await import("../src/lib/db/dm-turns.ts");
const { insertRoll } = await import("../src/lib/db/rolls.ts");
const { rollExpression } = await import("../src/lib/dice.ts");
const { applyPcDamage } = await import("../src/lib/dm/pc-damage.ts");
const { handleAdjustStress } = await import("../src/lib/dm/couch-tools.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");
const { latestEventOfType } = await import("../src/lib/events.ts");
const { couchRollFeedback } = await import("../src/lib/couch/roll-feedback-logic.ts");

const kara = world.addUser("kara");
const teddy = world.addUser("teddy");
for (const user of [kara, teddy]) assert.ok(!("error" in campaigns.joinByInviteCode(user.id, world.campaign().inviteCode)));
const karaSheet = sheets.createSheet(world.campaignId, kara.id, 1, { ...heroInput({ name: "Kara Voss", class: "fighter" }), crewRole: "Colonial Marine" });
const teddySheet = sheets.createSheet(world.campaignId, teddy.id, 1, { ...heroInput({ name: "Teddy Malloy", class: "barbarian" }), crewRole: "Roughneck" });
campaigns.setCampaignStatus(world.campaignId, "active");
store.beginCouchForge(world.campaignId, { players: 2, seed: "", offLimits: "" });
store.finishCouchForge(world.campaignId, { scenario: { acts: [{ title: "Boarding" }, { title: "The Hold" }, { title: "Out" }] } }, []);
const turn = createDmTurn(world.campaignId, []);
const views = () => stress.couchStressViews(world.campaign());
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

await test("adjust_stress moves it within 0 to 10, skips the dead, and refuses an ordinary table", () => {
  const raised = handleAdjustStress(world.campaign(), JSON.stringify({ characterIds: [karaSheet.id], amount: 2, reason: "the captain's chest" }));
  assert.equal(raised.ok, true, JSON.stringify(raised));
  assert.equal(raised.stress, "Kara Voss 2");
  assert.equal(views()[karaSheet.id].stress, 2);
  assert.equal(latestEventOfType(world.campaignId, ["couch_stress"]).payload.stress[karaSheet.id].stress, 2, "every screen hears it");
  stress.adjustCouchStress(world.campaign(), [karaSheet.id], 20);
  assert.equal(views()[karaSheet.id].stress, 10);
  stress.adjustCouchStress(world.campaign(), [karaSheet.id], -30);
  assert.equal(views()[karaSheet.id].stress, 0);
  assert.equal(handleAdjustStress(world.campaign(), JSON.stringify({ characterIds: [karaSheet.id], amount: 0 })).retry, true);
  assert.equal(handleAdjustStress(world.campaign(), JSON.stringify({ characterIds: ["nobody"], amount: 1 })).retry, true);
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(handleAdjustStress(plain, JSON.stringify({ characterIds: [karaSheet.id], amount: 1 })).refused, "rules");
  assert.ok(dmTurnTools(world.campaign(), false, true, false).some((tool) => tool.function.name === "adjust_stress"));
});

await test("a wound adds one, and a fall adds one to everyone else", () => {
  applyPcDamage(world.campaign(), turn.id, sheets.getSheetById(karaSheet.id), { amount: 1, type: "slashing", reason: "a coolant line" });
  assert.equal(views()[karaSheet.id].stress, 1);
  const teddyNow = sheets.getSheetById(teddySheet.id);
  applyPcDamage(world.campaign(), turn.id, teddyNow, { amount: teddyNow.currentHp, type: "slashing", reason: "the vent" });
  assert.equal(views()[teddySheet.id].stress, 1, "the one who fell");
  assert.equal(views()[karaSheet.id].stress, 2, "and the one who saw it");
  sheets.patchSheet(teddySheet.id, { currentHp: 10, deathSaves: null, conditions: [] });
});

await test("stress dice join a check or save as a modifier, never an attack, and a panic at the top takes moves", async () => {
  const base = rollExpression("1d20+2");
  assert.equal(stress.applyCouchStressDice(world.campaign(), karaSheet.id, "attack", base, dice(6, 6)), null, "attacks stay 5e's");
  const boosted = stress.applyCouchStressDice(world.campaign(), karaSheet.id, "skill_check", base, dice(6, 6));
  assert.equal(boosted.outcome.total, base.total + 4);
  assert.deepEqual(boosted.outcome.terms.at(-1), { kind: "modifier", sign: 1, value: 4 });
  assert.equal(boosted.panic, null);
  stress.adjustCouchStress(world.campaign(), [karaSheet.id], 6); // 8
  const before = views()[teddySheet.id].stress;
  // Stress dice 1, then 7 more; the panic die 5: 5 + 8 = 13, catatonic.
  const cracked = stress.applyCouchStressDice(world.campaign(), karaSheet.id, "saving_throw", base, dice(1, 2, 2, 2, 2, 2, 2, 2, 5));
  assert.equal(cracked.panic.entry.label, "Catatonic");
  assert.match(cracked.words, /PANIC \(5 \+ stress = 13\)/);
  assert.deepEqual(views()[karaSheet.id].panic, { label: "Catatonic", left: 2 });
  assert.ok(stress.panickedCrewIds(world.campaign()).has(karaSheet.id));
  assert.equal(views()[teddySheet.id].stress, before, "only a scream frightens the others");
  const card = latestEventOfType(world.campaignId, ["title_card"]).payload;
  assert.deepEqual([card.title, card.subtitle], ["Kara Voss panics", "Catatonic"]);
  assert.match(stress.couchStressPrompt(world.campaign(), sheets.listSheets(world.campaignId)), /Kara Voss 8 \(PANICKING: catatonic, sits out 2 more moves/);
  await tick();
  const post = () => messages.insertCampaignMessage({ campaignId: world.campaignId, seq: campaigns.allocateSeq(world.campaignId), authorType: "dm", content: "The GM goes on.", speech: [] });
  post();
  assert.equal(views()[karaSheet.id].panic.left, 1);
  post();
  assert.equal(views()[karaSheet.id].panic, null, "two replies on, it has passed");
  assert.ok(!stress.panickedCrewIds(world.campaign()).has(karaSheet.id));
});

function failedRoll(characterId, userId, kind = "skill_check", dc = 30) {
  const pending = createPendingRoll({ campaignId: world.campaignId, turnId: turn.id, toolCallId: null, userId, characterId, kind, detail: "Athletics", expression: "1d20", advantage: "none", dc, reason: "Duck the line" });
  const roll = insertRoll({ campaignId: world.campaignId, characterId, requestedBy: "player", kind, detail: "Athletics", advantage: "none", dc, success: false, result: rollExpression("1d20"), attacker: null, visibility: "public" });
  resolvePendingRoll(pending.id, "fallback", roll.id);
  return { pending: getPendingRoll(pending.id), roll };
}

await test("a failed check can be pushed once for +1 stress; the new throw answers the GM's call", () => {
  stress.adjustCouchStress(world.campaign(), [teddySheet.id], -10);
  const { pending, roll } = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), pending, roll), true);
  assert.ok(push.couchPushHolds(turn.id), "the GM waits on it");
  assert.equal(push.couchPushOffers(world.campaignId)[0].characterId, teddySheet.id);
  assert.equal(push.pushCouchRoll(world.campaign(), kara.id, pending.id).status, 403, "only its thrower");
  const pushed = push.pushCouchRoll(world.campaign(), teddy.id, pending.id);
  assert.equal(pushed.ok, true, JSON.stringify(pushed));
  assert.equal(views()[teddySheet.id].stress, 1, "+1 for the push");
  assert.equal(getPendingRoll(pending.id).rollId, pushed.roll.id, "the GM reads the new throw");
  assert.match(getPendingRoll(pending.id).combatNote, /Pushed: Teddy Malloy threw it again for \+1 stress/);
  assert.match(pushed.roll.detail, /\(pushed\)/);
  assert.equal(push.couchPushHolds(turn.id), false);
  assert.equal(push.pushCouchRoll(world.campaign(), teddy.id, pending.id).status, 409, "once");
});

await test("declining lets the GM go on; a pass, an attack or a roll with no DC offers no push", () => {
  const { pending, roll } = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), pending, roll), true);
  assert.equal(push.declineCouchPush(world.campaign(), kara.id, pending.id), false, "only its thrower");
  assert.equal(push.declineCouchPush(world.campaign(), teddy.id, pending.id), true);
  assert.equal(push.couchPushHolds(turn.id), false);
  const passed = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), passed.pending, { success: true }), false);
  const attack = failedRoll(teddySheet.id, teddy.id, "attack");
  assert.equal(push.offerCouchPush(world.campaign(), attack.pending, attack.roll), false);
  const free = failedRoll(teddySheet.id, teddy.id, "skill_check", null);
  assert.equal(push.offerCouchPush(world.campaign(), free.pending, { success: false }), false);
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  const other = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(plain, other.pending, other.roll), false, "not at an ordinary table");
  assert.equal(stress.couchStressViews(plain), null);
});

await test("a story point makes a failed check succeed, with the same dice, and the GM is told", () => {
  stress.adjustCouchStress(world.campaign(), [teddySheet.id], -10);
  sheets.setSheetAgenda(teddySheet.id, { acts: ["Get out", "Get the sample", "Live"], act: 0, hiddenRole: "", storyPoints: 1 });
  const { pending, roll } = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), pending, roll), true);
  assert.deepEqual([push.couchPushOffers(world.campaignId)[0].push, push.couchPushOffers(world.campaignId)[0].storyPoints], [true, 1]);
  assert.equal(push.spendCouchStoryPoint(world.campaign(), kara.id, pending.id).status, 403, "only its thrower");
  const spent = push.spendCouchStoryPoint(world.campaign(), teddy.id, pending.id);
  assert.equal(spent.ok, true, JSON.stringify(spent));
  assert.equal(spent.roll.id, roll.id, "the same throw");
  assert.equal(spent.roll.total, roll.total, "the dice as they fell");
  assert.equal(spent.roll.success, true);
  assert.equal(sheets.getSheetById(teddySheet.id).agenda.storyPoints, 0, "the point is gone");
  assert.equal(views()[teddySheet.id].stress, 0, "and no stress for it");
  assert.match(getPendingRoll(pending.id).combatNote, /Teddy Malloy spent a story point, so this roll SUCCEEDS/);
  assert.equal(push.couchPushHolds(turn.id), false, "the GM goes on");
  const read = couchRollFeedback(spent.roll, "Teddy Malloy");
  assert.equal(read.verdict, "Success · story point");
  assert.match(read.result, /Teddy Malloy spent a story point: the roll succeeds/);
  assert.equal(push.spendCouchStoryPoint(world.campaign(), teddy.id, pending.id).status, 409, "once");
});

await test("with no points there is nothing to spend; at full stress a point is still offered, a push is not", () => {
  const broke = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), broke.pending, broke.roll), true);
  assert.equal(push.spendCouchStoryPoint(world.campaign(), teddy.id, broke.pending.id).status, 409);
  push.declineCouchPush(world.campaign(), teddy.id, broke.pending.id);
  stress.adjustCouchStress(world.campaign(), [teddySheet.id], 10);
  const spent = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), spent.pending, spent.roll), false, "full stress, no points: nothing to offer");
  sheets.setSheetAgenda(teddySheet.id, { ...sheets.getSheetById(teddySheet.id).agenda, storyPoints: 2 });
  const saved = failedRoll(teddySheet.id, teddy.id);
  assert.equal(push.offerCouchPush(world.campaign(), saved.pending, saved.roll), true);
  assert.deepEqual([push.couchPushOffers(world.campaignId)[0].push, push.couchPushOffers(world.campaignId)[0].storyPoints], [false, 2]);
  assert.equal(push.pushCouchRoll(world.campaign(), teddy.id, saved.pending.id).status, 409, "no push at full stress");
  assert.equal(push.spendCouchStoryPoint(world.campaign(), teddy.id, saved.pending.id).ok, true);
  assert.equal(sheets.getSheetById(teddySheet.id).agenda.storyPoints, 1);
});

finish();
