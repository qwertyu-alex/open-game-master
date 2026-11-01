// A couch night's tension clock (src/lib/couch/tension-logic.ts and
// tension.ts, docs/couch-mode-spec.md 2.2 "Pressure"), the ALIEN Game
// Mother's rhythm of dread, strike and breather:
//
//   the phase follows the GM's replies since dice last threatened the crew,
//   tighter each act, with no breather in act III, and insists once overdue;
//   only a tool that worked is a strike (a refused attack came at nobody),
//   a chase and a condition on a crew member are, naming a mood is not;
//   a table that passed, or an act over time, gets its strike now;
//   a failed check or save costs the crew member, an attack roll does not;
//   TENSION names the next unplayed deck beat the phase wants, and says so
//   when the deck is spent;
//   spring_beat marks a deck beat or an improvised one and never restarts
//   the clock (on 2026-10-31 eleven logged "strikes", each an alarm, kept
//   it at a breather while the crew lost no hit points); it refuses a
//   number past the deck and an ordinary table;
//   the GM reads TENSION outside a fight only;
//   the forge reads an act's deck, and the ready-made test night has one;
//   a room silent three minutes after the GM spoke gets a table note and the
//   GM, at most twice in a row, never while busy, never a room long gone.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-tension");

const logic = await import("../src/lib/couch/tension-logic.ts");
const { tensionPhase, isStrikeTool, nextBeat, couchTensionLine, decideQuiet, readBeats, couchFailedCheckCost, QUIET_MS, QUIET_NOTE, QUIET_STALE_MS } = logic;

await test("the phase tightens act by act, and act III has no breather", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map((n) => tensionPhase(0, n)), ["breather", "breather", "build", "build", "strike", "strike", "overdue", "overdue"]);
  assert.deepEqual([1, 2, 3, 5].map((n) => tensionPhase(1, n)), ["breather", "build", "strike", "overdue"]);
  assert.deepEqual([0, 1, 2, 4].map((n) => tensionPhase(2, n)), ["build", "build", "strike", "overdue"]);
});

await test("only a tool that worked is a strike, and a chase is one", () => {
  assert.equal(isStrikeTool("enemy_attack", "{}", { ok: true }), true);
  assert.equal(isStrikeTool("apply_damage", "{}", { ok: true }), true);
  assert.equal(isStrikeTool("pc_attack", "{}", { error: "No such target.", retry: true }), false);
  assert.equal(isStrikeTool("start_encounter", "{}", { refused: "rules" }), false);
  assert.equal(isStrikeTool("start_scene", JSON.stringify({ kind: "chase" }), { ok: true }), true);
  assert.equal(isStrikeTool("start_scene", JSON.stringify({ kind: "heist" }), { ok: true }), false);
  assert.equal(isStrikeTool("set_mood", JSON.stringify({ mood: "danger" }), { ok: true }), false, "naming a mood is not a strike");
  assert.equal(isStrikeTool("set_condition", JSON.stringify({ characterId: "c1", condition: "poisoned" }), { ok: true }), true);
  assert.equal(isStrikeTool("set_condition", JSON.stringify({ enemyId: "e1", condition: "prone" }), { ok: true }), false, "only a condition on the crew");
  assert.equal(isStrikeTool("spring_beat", JSON.stringify({ kind: "strike" }), { ok: true }), false, "a logged strike is not dice");
});

const deck = readBeats([
  { kind: "sign", what: "A scratching in the vents." },
  { kind: "human", what: "The Company wants a report now." },
  { kind: "strike", what: "The hatch blows." },
  { kind: "monster", what: "not a kind" },
  { kind: "strike", what: "  " },
]);

await test("TENSION names the next unplayed beat the phase wants", () => {
  assert.equal(deck.length, 3, "unknown kinds and empty beats are dropped");
  assert.equal(nextBeat(deck, new Set(), 0, "breather").number, 1);
  assert.equal(nextBeat(deck, new Set(["0.0"]), 0, "build").number, 2, "a played sign gives way to a demand");
  assert.equal(nextBeat(deck, new Set(), 0, "strike").number, 3);
  assert.equal(nextBeat(deck, new Set(["0.2", "0.1"]), 0, "strike"), null);
  const due = couchTensionLine({ act: 0, replies: 5, beats: deck, used: new Set(), quiet: false });
  assert.match(due, /^TENSION: 5 replies since dice last threatened the crew\./);
  assert.match(due, /STRIKE DUE: this reply dice that can hurt land on a named crew member: apply_hazard/);
  assert.match(due, /One strike, one clear choice/);
  assert.match(due, /Ready: beat 3 \(strike\): The hatch blows\./);
  assert.match(due, /Only dice reset this clock.*a warning or a logged beat does not/);
  const overdue = couchTensionLine({ act: 0, replies: 7, beats: deck, used: new Set(), quiet: false });
  assert.match(overdue, /OVERDUE: you have warned enough\. Stop describing alarms and sounds/);
  assert.match(overdue, /It can wound, drop or kill/);
  const build = couchTensionLine({ act: 0, replies: 2, beats: deck, used: new Set(), quiet: false });
  assert.match(build, /Never repeat a warning: a threat announced twice lands/);
  assert.match(build, /An unexplored room is where it waits/);
  const passed = couchTensionLine({ act: 0, replies: 1, beats: deck, used: new Set(), quiet: "passed" });
  assert.match(passed, /THE TABLE PASSED: nobody chose\. Never ask the same question again/);
  assert.match(passed, /STRIKE DUE/, "a passing table gets its strike now");
  const late = couchTensionLine({ act: 0, replies: 1, beats: deck, used: new Set(), quiet: false, overTime: true });
  assert.match(late, /THE ACT IS OVER TIME: its escalation hits now, with dice/);
  assert.match(late, /STRIKE DUE/);
  const breather = couchTensionLine({ act: 0, replies: 1, beats: deck, used: new Set(), quiet: false });
  assert.match(breather, /^TENSION: 1 reply since/);
  assert.match(breather, /Breather: let them catch their breath/);
  const spent = couchTensionLine({ act: 0, replies: 4, beats: deck, used: new Set(["0.0", "0.1", "0.2"]), quiet: false });
  assert.match(spent, /deck is spent: improvise/);
  const none = couchTensionLine({ act: 0, replies: 4, beats: [], used: new Set(), quiet: false });
  assert.doesNotMatch(none, /act.s deck|Ready:/, "a night without a deck is not told about one");
  const quiet = couchTensionLine({ act: 0, replies: 0, beats: deck, used: new Set(), quiet: "silent" });
  assert.match(quiet, /THE ROOM WENT QUIET/);
  assert.match(quiet, /Build:/, "a quiet room is never left to breathe");
});

await test("a failed check or save costs the crew member; a pass, an attack roll or no target does not", () => {
  assert.match(couchFailedCheckCost("skill_check", 12, false), /FAILED: the cost lands now.*apply_hazard or apply_damage/);
  assert.equal(couchFailedCheckCost("saving_throw", 12, true), null);
  assert.equal(couchFailedCheckCost("attack", 12, false), null);
  assert.equal(couchFailedCheckCost("skill_check", undefined, false), null);
});

await test("the quiet room fires after the GM spoke, three minutes on, twice at most, never while busy or long gone", () => {
  const at = 1_000_000;
  const facts = { newest: { authorType: "dm", at }, quietInARow: 0, busy: false, now: at + QUIET_MS };
  assert.deepEqual(decideQuiet(facts), { fire: true });
  assert.deepEqual(decideQuiet({ ...facts, now: at + 1000 }), { fire: false, retryAt: at + QUIET_MS });
  assert.deepEqual(decideQuiet({ ...facts, quietInARow: 1 }), { fire: true });
  assert.deepEqual(decideQuiet({ ...facts, quietInARow: 2 }), { fire: false, retryAt: null });
  assert.deepEqual(decideQuiet({ ...facts, busy: true }), { fire: false, retryAt: null });
  assert.deepEqual(decideQuiet({ ...facts, newest: { authorType: "player", at } }), { fire: false, retryAt: null }, "a post has its own turn");
  assert.deepEqual(decideQuiet({ ...facts, newest: { authorType: "system", at } }), { fire: false, retryAt: null }, "a note has its turn coming");
  assert.deepEqual(decideQuiet({ ...facts, now: at + QUIET_MS + QUIET_STALE_MS + 1 }), { fire: false, retryAt: null });
});

await test("the forge reads an act's deck, and the written test night has one in every act", async () => {
  const { writtenForge } = await import("../src/lib/couch/scenarios/index.ts");
  const forged = writtenForge("dead-air", 2);
  assert.ok("forge" in forged, JSON.stringify(forged));
  for (const act of forged.forge.scenario.acts) {
    const beats = act.beats ?? [];
    assert.ok(beats.length >= 4, `${act.title}: ${beats.length} beats`);
    for (const kind of ["sign", "human", "strike"]) assert.ok(beats.some((beat) => beat.kind === kind), `${act.title} has a ${kind}`);
  }
});

// ---- the rim, at a couch table ----

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const store = await import("../src/lib/couch/store.ts");
const messages = await import("../src/lib/db/messages.ts");
const { couchTensionPrompt, armCouchQuiet, noteCouchTensionTool } = await import("../src/lib/couch/tension.ts");
const { handleSpringBeat } = await import("../src/lib/dm/couch-tools.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");

const kara = world.addUser("kara");
assert.ok(!("error" in campaigns.joinByInviteCode(kara.id, world.campaign().inviteCode)));
sheets.createSheet(world.campaignId, kara.id, 1, {
  ...heroInput({ name: "Kara Voss", class: "fighter" }),
  agenda: { acts: ["Get the sample case off the ship.", "Keep the radio dead.", "Leave alone."], act: 0, hiddenRole: "", storyPoints: 0 },
  crewRole: "Colonial Marine",
});
campaigns.setCampaignStatus(world.campaignId, "active");
store.beginCouchForge(world.campaignId, { players: 1, seed: "", offLimits: "" });
store.finishCouchForge(world.campaignId, { scenario: { acts: [{ title: "Boarding", beats: deck }, { title: "The Hold Opens" }, { title: "Last Shuttle" }] } }, []);

// The clock compares timestamps: a message written in the same millisecond
// as the strike is neither before nor after it.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function post(authorType, content) {
  const seq = campaigns.allocateSeq(world.campaignId);
  return authorType === "dm"
    ? messages.insertCampaignMessage({ campaignId: world.campaignId, seq, authorType, content, speech: [] })
    : authorType === "system"
      ? messages.insertCampaignMessage({ campaignId: world.campaignId, seq, authorType, content, glyph: "cue-bell" })
      : messages.insertCampaignMessage({ campaignId: world.campaignId, seq, authorType, content, userId: kara.id });
}

await test("the GM reads TENSION outside a fight, and the replies count up from the last strike", async () => {
  const campaign = world.campaign();
  assert.match(couchTensionPrompt(campaign, false), /^TENSION: 0 replies since/);
  assert.equal(couchTensionPrompt(campaign, true), "", "a fight is the strike itself");
  await tick();
  post("player", "We cycle the airlock.");
  for (let i = 0; i < 4; i += 1) post("dm", `Quiet corridor ${i}.`);
  assert.match(couchTensionPrompt(campaign, false), /^TENSION: 4 replies.*STRIKE DUE.*Ready: beat 3 \(strike\)/);
  noteCouchTensionTool(campaign, "pc_attack", "{}", { refused: "rules" });
  assert.match(couchTensionPrompt(campaign, false), /^TENSION: 4 replies/, "a refused attack restarts nothing");
  await tick();
  noteCouchTensionTool(campaign, "enemy_attack", "{}", { ok: true });
  assert.match(couchTensionPrompt(campaign, false), /^TENSION: 0 replies.*Breather/);
  const plain = { ...campaign, gameSettings: { ...campaign.gameSettings, couchMode: false } };
  assert.equal(couchTensionPrompt(plain, false), "");
});

await test("spring_beat marks a deck beat or an improvised one, and never restarts the clock", async () => {
  const campaign = world.campaign();
  await tick();
  post("dm", "One.");
  post("dm", "Two.");
  const sign = handleSpringBeat(campaign, JSON.stringify({ beat: 1 }));
  assert.equal(sign.ok, true);
  assert.equal(sign.kind, "sign");
  assert.match(sign.note, /keeps running/);
  assert.deepEqual(store.getCouchForge(world.campaignId).beatsUsed, ["0.0"]);
  assert.match(couchTensionPrompt(campaign, false), /^TENSION: 2 replies.*Ready: beat 2 \(human\)/, "a sign does not restart it; the next beat is the demand");
  await tick();
  const improvised = handleSpringBeat(campaign, JSON.stringify({ kind: "strike" }));
  assert.equal(improvised.ok, true);
  assert.match(improvised.note, /A strike lands only with dice/);
  assert.match(couchTensionPrompt(campaign, false), /^TENSION: 2 replies/, "a logged strike restarts nothing");
  handleSpringBeat(campaign, JSON.stringify({ beat: 1 }));
  assert.deepEqual(store.getCouchForge(world.campaignId).beatsUsed, ["0.0"], "a beat played twice is played once");
  const past = handleSpringBeat(campaign, JSON.stringify({ beat: 5 }));
  assert.equal(past.retry, true);
  assert.match(past.error, /beats 1 to 3/);
  assert.equal(handleSpringBeat(campaign, "{}").retry, true);
  const plain = { ...campaign, gameSettings: { ...campaign.gameSettings, couchMode: false } };
  assert.equal(handleSpringBeat(plain, JSON.stringify({ kind: "strike" })).refused, "rules");
  assert.ok(dmTurnTools(campaign, false, true, false).some((tool) => tool.function.name === "spring_beat"), "a couch table is offered it");
  assert.ok(!dmTurnTools(plain, false, true, false).some((tool) => tool.function.name === "spring_beat"), "an ordinary table is not");
});

await test("a quiet room gets a table note and wakes the GM, twice in a row at most", () => {
  const woken = [];
  globalThis.__odmDmWaker = (id) => woken.push(id);
  const later = () => Date.now() + QUIET_MS + 1000;
  post("dm", "The lights flicker.");
  assert.equal(armCouchQuiet(world.campaignId), false, "not yet");
  assert.equal(armCouchQuiet(world.campaignId, later()), true);
  assert.deepEqual(woken, [world.campaignId]);
  const newest = messages.listRecentMessages(world.campaignId, 1).at(-1);
  assert.equal(newest.authorType, "system");
  assert.equal(newest.content, QUIET_NOTE);
  assert.match(couchTensionPrompt(world.campaign(), false), /THE ROOM WENT QUIET/);
  assert.equal(armCouchQuiet(world.campaignId, later()), false, "the note's own turn is coming");
  post("dm", "Something knocks on the hull.");
  assert.equal(armCouchQuiet(world.campaignId, later()), true, "a second beat");
  post("dm", "The knocking stops.");
  assert.equal(armCouchQuiet(world.campaignId, later()), false, "then it waits for the room");
  post("player", "We go and look.");
  post("dm", "The corridor is empty.");
  assert.equal(armCouchQuiet(world.campaignId, later()), true, "a post starts the count again");
  post("dm", "Still empty.");
  store.beginCouchForge(world.campaignId, { players: 1, seed: "", offLimits: "" });
  assert.equal(armCouchQuiet(world.campaignId, later()), false, "a night being forged is busy");
  assert.equal(woken.length, 3);
  globalThis.__odmDmWaker = undefined;
});

await test("a table whose every answer since the GM spoke was a pass gets its strike now", async () => {
  // The quiet-room test left the night re-forging.
  store.finishCouchForge(world.campaignId, { scenario: { acts: [{ title: "Boarding", beats: deck }, { title: "The Hold Opens" }, { title: "Last Shuttle" }] } }, []);
  await tick();
  post("dm", "The umbilical groans.");
  post("player", "Pass");
  post("player", "pass.");
  assert.match(couchTensionPrompt(world.campaign(), false), /THE TABLE PASSED.*STRIKE DUE/);
  post("player", "We run for the hatch.");
  assert.doesNotMatch(couchTensionPrompt(world.campaign(), false), /THE TABLE PASSED/, "a real move is not a pass");
});

finish();
