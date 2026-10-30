// A couch one-shot's GM tools (src/lib/dm/couch-tools.ts) and the tools a
// couch table is offered (src/lib/dm/turn.ts dmTurnTools):
//
//   advance_act turns every crew sheet to the next act's agenda, whispers it
//   to its owner alone, and refuses past the third act;
//   award_story_point adds one to a crew member's agenda and refuses a sheet
//   that is not crew, as a mistake in the call;
//   both refuse at an ordinary table, as the game saying no;
//   a couch table is offered both and none of the fantasy bookkeeping
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
const { handleAdvanceAct, handleAwardStoryPoint } = await import("../src/lib/dm/couch-tools.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");

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

await test("advance_act hands each crew member their next agenda, privately, and stops after the third act", () => {
  const turned = handleAdvanceAct(world.campaign(), "{}");
  assert.equal(turned.error, undefined, turned.error);
  assert.equal(turned.act, "Act II");
  assert.equal(world.sheet(karaSheet.id).agenda.act, 1);
  assert.equal(world.sheet(brakkSheet.id).agenda.act, 1);
  const karaHeard = whispers.listWhispersForUser(world.campaignId, kara.id).map((entry) => entry.content ?? entry.message ?? "").join("\n");
  assert.match(karaHeard, /Keep Brakk from the radio/);
  assert.doesNotMatch(karaHeard, /Get him to the shuttle/, "nobody hears another crew member's agenda");

  assert.equal(handleAdvanceAct(world.campaign(), JSON.stringify({ title: "Vents" })).act, "Act III");
  // A two-act agenda stays on its last act when the story turns a third time.
  assert.equal(world.sheet(brakkSheet.id).agenda.act, 1);
  const past = handleAdvanceAct(world.campaign(), "{}");
  assert.equal(past.refused, "rules");
  assert.match(past.error, /last act/);
});

await test("award_story_point adds one to a crew member and refuses anyone else as a mistake in the call", () => {
  assert.equal(handleAwardStoryPoint(world.campaign(), JSON.stringify({ characterId: karaSheet.id })).storyPoints, 1);
  assert.equal(world.sheet(karaSheet.id).agenda.storyPoints, 1);
  assert.equal(handleAwardStoryPoint(world.campaign(), JSON.stringify({ characterId: "nobody" })).retry, true);
  assert.equal(handleAwardStoryPoint(world.campaign(), "{}").retry, true);
});

await test("a couch table is offered the act tools and none of the fantasy bookkeeping", () => {
  const offered = names(dmTurnTools(world.campaign(), false, true, false));
  for (const name of ["advance_act", "award_story_point", "request_roll", "send_whisper", "show_title"]) {
    assert.ok(offered.has(name), `${name} is offered`);
  }
  for (const name of ["pass_time", "travel", "purchase", "open_shop", "award_xp", "set_quest", "add_companion", "generate_image"]) {
    assert.ok(!offered.has(name), `${name} is not offered at a couch table`);
  }
});

await test("an ordinary table is offered neither act tool, keeps its calendar, and is refused both", () => {
  const ordinary = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  const offered = names(dmTurnTools(ordinary, false, true, false));
  assert.ok(!offered.has("advance_act") && !offered.has("award_story_point"));
  assert.ok(offered.has("pass_time") && offered.has("generate_image"));
  assert.equal(handleAdvanceAct(ordinary, "{}").refused, "rules");
  assert.equal(handleAwardStoryPoint(ordinary, JSON.stringify({ characterId: karaSheet.id })).refused, "rules");
});

finish();
