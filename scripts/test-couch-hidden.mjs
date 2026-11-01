// A couch crew's hidden effects and the harm the ship does
// (src/lib/couch/hidden-effects*.ts, src/lib/couch/dying.ts,
// docs/couch-mode-spec.md 2.13):
//
//   the GM's block shows each effect's truth, stage and symptom, and says
//   when the next symptom, then the payoff, is due; the dead carry none;
//   hidden_effect plants an effect unseen (no card, nothing on the phones),
//   advances it stage by stage, reveals it on the TV once, cures it, and
//   pays it off only at its last stage;
//   a payoff hurts through the damage rules: it drops a crew member to
//   dying, and kills only as damage kills (massive damage), never by fiat;
//   outside a fight a dying crew member rolls a death save each GM turn, in
//   a fight the initiative does it;
//   a couch turn is offered hidden_effect and apply_hazard every turn; an
//   ordinary table refuses hidden_effect;
//   the GM is told to ambush and to let the ship hurt the crew.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-hidden");

const { hiddenEffectsBlock, hiddenDue, isPayoffStage, cleanStages } = await import("../src/lib/couch/hidden-effects-logic.ts");

const effect = {
  id: "e1",
  characterId: "c1",
  name: "Parasite",
  truth: "A larva from the face-hugger, hatching by act III.",
  stages: ["a dry cough", "fever and a bulge under the ribs", "it tears out of the chest"],
  stage: 0,
  everyReplies: 3,
  revealed: false,
  status: "active",
};

await test("the GM's block says the truth, the stage, and when the next symptom and the payoff are due", () => {
  const names = new Map([["c1", "Kara Voss"]]);
  const early = hiddenEffectsBlock([effect], new Map([["e1", 1]]), names);
  assert.match(early, /^HIDDEN EFFECTS \(secret: show them only as symptoms/);
  assert.match(early, /Parasite in Kara Voss \(effectId=e1, nobody knows\): A larva/);
  assert.match(early, /stage 1 of 3, 1 reply in: "a dry cough"\. Next: "fever and a bulge under the ribs"\./);
  const due = hiddenEffectsBlock([effect], new Map([["e1", 3]]), names);
  assert.match(due, /NEXT SYMPTOM DUE: show "fever and a bulge under the ribs", then hidden_effect advance\./);
  const last = { ...effect, stage: 2, revealed: true };
  assert.match(hiddenEffectsBlock([last], new Map([["e1", 0]]), names), /revealed.*At the payoff: hold it for the worst moment/);
  assert.match(hiddenEffectsBlock([last], new Map([["e1", 5]]), names), /PAYOFF DUE/);
  assert.equal(hiddenEffectsBlock([effect], new Map(), new Map()), "", "a host no longer at the table carries nothing");
  assert.equal(hiddenEffectsBlock([{ ...effect, status: "cured" }], new Map(), names), "");
  assert.equal(isPayoffStage(last), true);
  assert.equal(hiddenDue(effect, 2), false);
  assert.deepEqual(cleanStages(["  a  ", "", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
});

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const store = await import("../src/lib/couch/store.ts");
const { handleHiddenEffect } = await import("../src/lib/dm/couch-tools.ts");
const { couchHiddenEffectsPrompt, listHiddenEffects } = await import("../src/lib/couch/hidden-effects.ts");
const { rollCouchDeathSaves, dyingCrewIds } = await import("../src/lib/couch/dying.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");
const { autoGroups } = await import("../src/lib/dm/tool-profiles.ts");
const { latestEventOfType } = await import("../src/lib/events.ts");
const { COUCH_RULES, COUCH_DEATH_RULE } = await import("../src/lib/couch/prompt-logic.ts");
const { couchTensionLine } = await import("../src/lib/couch/tension-logic.ts");

const kara = world.addUser("kara");
const brakk = world.addUser("brakk");
for (const user of [kara, brakk]) assert.ok(!("error" in campaigns.joinByInviteCode(user.id, world.campaign().inviteCode)));
const karaSheet = sheets.createSheet(world.campaignId, kara.id, 1, { ...heroInput({ name: "Kara Voss", class: "fighter" }), crewRole: "Colonial Marine" });
const brakkSheet = sheets.createSheet(world.campaignId, brakk.id, 1, { ...heroInput({ name: "Brakk Oduya", class: "barbarian" }), crewRole: "Roughneck" });
campaigns.setCampaignStatus(world.campaignId, "active");
store.beginCouchForge(world.campaignId, { players: 2, seed: "", offLimits: "" });
store.finishCouchForge(world.campaignId, { scenario: { acts: [{ title: "Boarding" }, { title: "The Hold" }, { title: "Out" }] } }, []);

// A turn row for the damage engine's audit.
const { createDmTurn } = await import("../src/lib/db/dm-turns.ts");
const turnId = createDmTurn(world.campaignId, []).id;
const call = (args) => handleHiddenEffect(world.campaign(), turnId, JSON.stringify(args));
const cards = () => latestEventOfType(world.campaignId, ["title_card"]);

let planted;
await test("hidden_effect plants unseen, advances stage by stage, and pays off only at its last stage", () => {
  const before = cards()?.seq ?? 0;
  planted = call({ action: "plant", characterId: karaSheet.id, name: "Parasite", truth: effect.truth, stages: effect.stages, everyReplies: 3 });
  assert.equal(planted.ok, true, JSON.stringify(planted));
  assert.equal(cards()?.seq ?? 0, before, "planting shows the room nothing");
  const block = couchHiddenEffectsPrompt(world.campaign(), sheets.listSheets(world.campaignId));
  assert.match(block, /Parasite in Kara Voss .*stage 1 of 3/);
  assert.equal(call({ action: "payoff", effectId: planted.effectId }).retry, true, "not before its last stage");
  assert.equal(call({ action: "advance", effectId: planted.effectId }).ok, true);
  const second = call({ action: "advance", effectId: planted.effectId });
  assert.match(second.note, /Next is the payoff/);
  assert.equal(call({ action: "advance", effectId: planted.effectId }).retry, true, "nothing past the payoff");
  assert.equal(call({ action: "plant", characterId: karaSheet.id, name: "X", stages: ["only one"] }).retry, true, "two stages at least");
  assert.equal(call({ action: "plant", characterId: "nobody", name: "X", stages: ["a", "b"] }).retry, true);
  assert.equal(call({ action: "advance", effectId: "nope" }).retry, true);
});

await test("reveal puts it on the TV once; cure ends it", () => {
  const spores = call({ action: "plant", characterId: brakkSheet.id, name: "Spores", stages: ["a rash", "black veins"] });
  assert.equal(call({ action: "reveal", effectId: spores.effectId }).ok, true);
  assert.deepEqual([cards().payload.title, cards().payload.subtitle], ["Spores", "Brakk Oduya"]);
  assert.equal(call({ action: "reveal", effectId: spores.effectId }).retry, true, "the room already knows");
  assert.equal(call({ action: "cure", effectId: spores.effectId }).ok, true);
  assert.equal(listHiddenEffects(world.campaignId).length, 1, "only the parasite is still growing");
});

await test("a payoff hurts through the damage rules and kills only as massive damage does", () => {
  const paid = call({ action: "payoff", effectId: planted.effectId, damage: "200", damageType: "piercing" });
  assert.equal(paid.error, undefined, JSON.stringify(paid));
  assert.equal(paid.dead, true, "200 against a level-1 crew member is massive damage");
  assert.match(paid.note, /massive damage/);
  assert.equal(sheets.getSheetById(karaSheet.id).deathSaves.dead, true);
  assert.equal(cards().payload.title, "Kara Voss is dead", "the death card follows the reveal");
  assert.equal(listHiddenEffects(world.campaignId).length, 0);
  assert.equal(call({ action: "plant", characterId: karaSheet.id, name: "X", stages: ["a", "b"] }).retry, true, "nothing grows in the dead");
});

await test("a payoff that does not kill outright leaves its host dying, and outside a fight they roll a save each GM turn", () => {
  const worm = call({ action: "plant", characterId: brakkSheet.id, name: "Worm", stages: ["itching", "it bursts"] });
  call({ action: "advance", effectId: worm.effectId });
  const hp = sheets.getSheetById(brakkSheet.id).currentHp;
  const paid = call({ action: "payoff", effectId: worm.effectId, damage: String(hp + 1) });
  assert.equal(paid.dying, true, JSON.stringify(paid));
  assert.deepEqual(dyingCrewIds(sheets.listSheets(world.campaignId)), [brakkSheet.id]);
  const before = sheets.getSheetById(brakkSheet.id).deathSaves;
  assert.equal(rollCouchDeathSaves(world.campaign()), 1);
  const { deathSaves: after, currentHp } = sheets.getSheetById(brakkSheet.id);
  // A natural 20 brings them back at 1 HP and clears the track.
  const rolled = currentHp > 0 || after.stable || after.dead || after.successes + after.failures > before.successes + before.failures;
  assert.ok(rolled, "a save was rolled");
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(rollCouchDeathSaves(plain), 0, "not at an ordinary table");
});

await test("a couch turn is offered hidden_effect and the hazards every turn; an ordinary table refuses it", () => {
  assert.ok(dmTurnTools(world.campaign(), false, true, false).some((tool) => tool.function.name === "hidden_effect"));
  assert.ok(autoGroups({ inEncounter: false, couch: true }).has("hazards"));
  assert.ok(!autoGroups({ inEncounter: false }).has("hazards"));
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(handleHiddenEffect(plain, turnId, JSON.stringify({ action: "cure", effectId: "x" })).refused, "rules");
});

await test("the GM is told to ambush and to let the ship hurt the crew, and how death works outside a fight", () => {
  assert.match(COUCH_RULES, /NPCs may ambush without warning/);
  const strike = couchTensionLine({ act: 0, replies: 4, beats: [], used: new Set(), quiet: false });
  assert.match(strike, /an NPC turning on them without warning \(start_encounter, surprised: party\)/);
  assert.match(strike, /apply_hazard/);
  assert.match(strike, /a hidden effect paying off/);
  assert.match(couchTensionLine({ act: 0, replies: 2, beats: [], used: new Set(), quiet: false }), /a hidden effect shows a symptom/);
  assert.match(COUCH_DEATH_RULE, /Outside a fight the server rolls their death save each reply/);
});

finish();
