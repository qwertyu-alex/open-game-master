// A couch one-shot's GM tools (src/lib/dm/couch-tools.ts) and the tools a
// couch table is offered (src/lib/dm/turn.ts dmTurnTools):
//
//   set_objective puts what the crew must do now on every screen, for the
//   act in force, and the GM's NIGHT PACE line reads it back;
//   advance_act turns every crew sheet to the next act's agenda, whispers it
//   to its owner alone, clears the old act's objective, and refuses past the
//   third act; its recap goes to the TV before the act's title card and into
//   the GM's every later turn as the story so far;
//   its earned list is the act's story points, ALIEN's way: one each for
//   whoever the GM judged chased the ended act's agenda, three held at most,
//   and an id that is not crew is a mistake in the call, before the act turns;
//   award_story_point (the host's, never offered to the GM) adds one to a
//   crew member's agenda and refuses a sheet that is not crew;
//   both refuse at an ordinary table, as the game saying no;
//   a couch table is offered the act tools and none of the fantasy bookkeeping
//   (pass_time once posted "Greening 1, year 1" to the TV), and an ordinary
//   table is offered neither and keeps its calendar.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-tools");

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const store = await import("../src/lib/couch/store.ts");
const whispers = await import("../src/lib/db/dm-whispers.ts");
const { handleAdvanceAct, handleAwardStoryPoint, handleSetObjective } = await import("../src/lib/dm/couch-tools.ts");
const { couchObjective, couchPacingPrompt } = await import("../src/lib/couch/pacing.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");
const { latestEventOfType } = await import("../src/lib/events.ts");
const { getDatabase } = await import("../src/lib/db/core.ts");

const kara = world.addUser("kara");
const brakk = world.addUser("brakk");
for (const user of [kara, brakk]) {
  const joined = campaigns.joinByInviteCode(user.id, world.campaign().inviteCode);
  assert.ok(!("error" in joined), JSON.stringify(joined));
}
const karaSheet = sheets.createSheet(world.campaignId, kara.id, 1, {
  ...heroInput({ name: "Kara Voss", class: "fighter" }),
  agenda: { acts: ["Get the sample case off the ship.", "Keep Brakk from the radio.", "Leave alone."], act: 0, hiddenRole: "", storyPoints: 0 },
  crewRole: "Colonial Marine",
});
const brakkSheet = sheets.createSheet(world.campaignId, brakk.id, 1, {
  ...heroInput({ name: "Brakk Oduya", class: "barbarian" }),
  agenda: { acts: ["Find your brother.", "Get him to the shuttle."], act: 0, hiddenRole: "", storyPoints: 0 },
  crewRole: "Roughneck",
});
campaigns.setCampaignStatus(world.campaignId, "active");
store.beginCouchForge(world.campaignId, { players: 2, seed: "", offLimits: "" });
store.finishCouchForge(world.campaignId, { scenario: { acts: [{ title: "Boarding" }, { title: "The Hold Opens" }, { title: "Last Shuttle" }] } }, []);

const names = (tools) => new Set(tools.map((tool) => tool.function.name));

await test("set_objective puts the crew's aim on every screen for this act, and the GM reads it back", () => {
  assert.match(couchPacingPrompt(world.campaign(), false), /OBJECTIVE: none on screen for this act\. Call set_objective/);
  const set = handleSetObjective(world.campaign(), JSON.stringify({ objective: "  Seal the cargo lock  ", clock: "pirates cut through in 10 minutes" }));
  assert.equal(set.error, undefined, set.error);
  assert.deepEqual(couchObjective(world.campaign()), { text: "Seal the cargo lock", clock: "pirates cut through in 10 minutes", act: 0 });
  const pace = couchPacingPrompt(world.campaign(), false);
  assert.match(pace, /^NIGHT PACE: Act I of III, 0 of about 40 minutes/);
  assert.match(pace, /OBJECTIVE on every screen: "Seal the cargo lock" \(clock: pirates cut through in 10 minutes\)/);
  assert.equal(couchPacingPrompt(world.campaign(), true), "", "a fight is never hurried by the act's clock");
  assert.equal(handleSetObjective(world.campaign(), "{}").retry, true);
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.equal(handleSetObjective(ordinary, JSON.stringify({ objective: "Seal it" })).refused, "rules");
  assert.equal(couchPacingPrompt(ordinary, false), "");
});

await test("advance_act hands each crew member their next agenda, privately, and stops after the third act", () => {
  const recap = ["The beacon led the crew to the derelict.", "Rook was dragged into the vents.", "The beacon led the crew to the derelict."];
  // A stranger in earned is a mistake in the call, caught before the act turns.
  const wrong = handleAdvanceAct(world.campaign(), JSON.stringify({ recap, earned: [karaSheet.id, "nobody"] }));
  assert.equal(wrong.retry, true);
  assert.match(wrong.error, /nobody/);
  assert.equal(store.getCouchForge(world.campaignId).act, 0, "the act did not turn");
  assert.equal(world.sheet(karaSheet.id).agenda.storyPoints, 0, "and nobody was paid");
  // Kara chased her agenda at a cost this act, Brakk did not; named twice, paid once.
  const turned = handleAdvanceAct(world.campaign(), JSON.stringify({ recap, earned: [karaSheet.id, karaSheet.id] }));
  assert.equal(turned.error, undefined, turned.error);
  assert.equal(turned.act, "Act II");
  assert.deepEqual(turned.recap, recap.slice(0, 2), "a repeated point is told once");
  assert.match(turned.note, /narrator reads it aloud.*Do not repeat any of it/, "the GM does not read the break twice");
  const shown = latestEventOfType(world.campaignId, ["couch_act_break"]);
  assert.deepEqual(shown.payload.points, recap.slice(0, 2));
  assert.equal(shown.payload.ended, "Act I");
  assert.equal(shown.payload.next, "Act II");
  assert.deepEqual(
    shown.payload.crew.map(({ name, earned, total }) => ({ name, earned, total })),
    [{ name: "Kara Voss", earned: 1, total: 1 }, { name: "Brakk Oduya", earned: 0, total: 0 }],
  );
  assert.doesNotMatch(JSON.stringify(shown.payload), /sample case|brother|radio|shuttle/i, "the TV is never sent an agenda");
  assert.deepEqual(store.getCouchForge(world.campaignId).actPoints, {}, "the new act counts from nothing");
  const order = getDatabase()
    .prepare(`SELECT type FROM campaign_events WHERE campaign_id = ? AND type IN ('couch_act_break', 'title_card') ORDER BY seq`)
    .all(world.campaignId)
    .map((row) => row.type);
  assert.deepEqual(order.slice(-2), ["couch_act_break", "title_card"], "the story so far comes before the act's title");
  assert.match(couchPacingPrompt(world.campaign(), false), /\nTHE STORY SO FAR .*Act I: The beacon led the crew to the derelict\.; Rook was dragged into the vents\./);
  assert.equal(couchObjective(world.campaign()), null, "the old act's objective leaves the screens");
  assert.match(turned.note, /set_objective/);
  assert.equal(world.sheet(karaSheet.id).agenda.act, 1);
  assert.equal(world.sheet(brakkSheet.id).agenda.act, 1);
  const karaHeard = whispers.listWhispersForUser(world.campaignId, kara.id).map((entry) => entry.content ?? entry.message ?? "").join("\n");
  assert.match(karaHeard, /Keep Brakk from the radio/);
  assert.doesNotMatch(karaHeard, /Get him to the shuttle/, "nobody hears another crew member's agenda");

  assert.equal(handleAdvanceAct(world.campaign(), JSON.stringify({ title: "Vents" })).act, "Act III");
  const noRecap = latestEventOfType(world.campaignId, ["couch_act_break"]).payload;
  assert.deepEqual(noRecap.points, [], "no recap, no story so far");
  assert.ok(noRecap.crew.every((entry) => entry.earned === 0), "but still the roll call and the new agendas");
  assert.match(couchPacingPrompt(world.campaign(), false), /Act I: The beacon/, "act I's recap stays with the GM in act III");
  // A two-act agenda stays on its last act when the story turns a third time.
  assert.equal(world.sheet(brakkSheet.id).agenda.act, 1);
  const past = handleAdvanceAct(world.campaign(), "{}");
  assert.equal(past.refused, "rules");
  assert.match(past.error, /last act/);
});

await test("award_story_point adds one to a crew member, three at most, and refuses anyone else as a mistake in the call", () => {
  // One came at act I's break.
  assert.equal(handleAwardStoryPoint(world.campaign(), JSON.stringify({ characterId: karaSheet.id })).storyPoints, 2);
  assert.equal(world.sheet(karaSheet.id).agenda.storyPoints, 2);
  assert.deepEqual(store.getCouchForge(world.campaignId).actPoints, { [karaSheet.id]: 1 }, "counted toward this act's roll call");
  handleAwardStoryPoint(world.campaign(), JSON.stringify({ characterId: karaSheet.id }));
  assert.equal(handleAwardStoryPoint(world.campaign(), JSON.stringify({ characterId: karaSheet.id })).storyPoints, 3, "ALIEN's cap");
  assert.equal(handleAwardStoryPoint(world.campaign(), JSON.stringify({ characterId: "nobody" })).retry, true);
  assert.equal(handleAwardStoryPoint(world.campaign(), "{}").retry, true);
});

await test("a couch table is offered the act tools and none of the fantasy bookkeeping", () => {
  const offered = names(dmTurnTools(world.campaign(), false, true, false));
  // grant_item hands out the finds a crew that starts light lives on.
  for (const name of ["advance_act", "set_objective", "repaint_place", "request_roll", "send_whisper", "show_title", "grant_item"]) {
    assert.ok(offered.has(name), `${name} is offered`);
  }
  // Story points come at the act break; a tool the GM could call any time
  // paid one torch job three times in one scene.
  assert.ok(!offered.has("award_story_point"), "award_story_point is the host's, not the GM's");
  for (const name of ["pass_time", "travel", "purchase", "open_shop", "award_xp", "set_quest", "add_companion", "generate_image"]) {
    assert.ok(!offered.has(name), `${name} is not offered at a couch table`);
  }
});

await test("an ordinary table is offered neither act tool, keeps its calendar, and is refused both", () => {
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  const offered = names(dmTurnTools(ordinary, false, true, false));
  assert.ok(!offered.has("advance_act") && !offered.has("set_objective") && !offered.has("award_story_point") && !offered.has("repaint_place"));
  assert.ok(offered.has("pass_time") && offered.has("generate_image"));
  assert.equal(handleAdvanceAct(ordinary, "{}").refused, "rules");
  assert.equal(handleAwardStoryPoint(ordinary, JSON.stringify({ characterId: karaSheet.id })).refused, "rules");
});

finish();
