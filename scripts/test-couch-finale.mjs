// The night's closing (src/lib/couch/finale-logic.ts and finale.ts,
// docs/couch-mode-spec.md 2.2 "Finale reveal"):
//
//   the facts come from the sheets, the rolls and the transcript alone: the
//   acts each crew member played (a takeover's acts before they joined are
//   left out), their story points, hidden role, dice and moves, and the
//   night's clock; a companion is no crew member;
//   a long transcript is cut evenly, never losing its end;
//   the model's reply is read leniently, and a reply or a backend that
//   fails still closes the night, with the facts and plainer words;
//   the TV walks the end card, each recap beat, each crew member, the truth,
//   the review and a board that stays; a night with no review skips it;
//   the night's pictures carry it: the model's pick for a beat where it
//   made a usable one, else the beat's even share of the night, and a
//   closing stored before pictures gets them when read; the narrator reads
//   every step but the board;
//   end_night is refused off a couch table, before act III and in a fight;
//   it ends the night only once its turn's closing passage is out, and the
//   closing is written over the transcript and the secret outline;
//   a night the host ends gets its closing too, and an ended night's quiet
//   room wakes nobody.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";
import { call, fakeModel, failure, reply } from "./lib/enforce-narrator.mjs";

const { test, finish } = suite("test-couch-finale");

const logic = await import("../src/lib/couch/finale-logic.ts");
const { NOT_YET } = await import("../src/lib/couch/takeover-logic.ts");

// ---- the pure half ----

const agenda = (acts, act = 2, extra = {}) => ({ acts, act, hiddenRole: "", storyPoints: 0, ...extra });
const crew = [
  { id: "k", userId: "u1", name: "Kara Voss", crewRole: "Marine", dead: false, agenda: agenda(["Get the case.", "Keep the radio dead.", "Leave alone."], 2, { storyPoints: 3 }) },
  { id: "r", userId: "u2", name: "Renn Calder", dead: true, agenda: agenda(["Audit the losses.", "Find the logs.", "Burn them."], 1, { hiddenRole: "A Company synthetic." }) },
  { id: "t", userId: "u2", name: "Tomas Bello", dead: false, agenda: agenda([NOT_YET, NOT_YET, "Carry Ada out."], 2) },
  { id: "p", userId: "u1", name: "Rex", isCompanion: true, dead: false, agenda: null },
];
const facts = logic.finaleFacts({
  title: "Dead Air",
  truth: "The beacon was a lure. The Company sent them on purpose. Nobody was meant to return.",
  ending: "Kara and Tomas made the shuttle.",
  endedBy: "gm",
  act: 2,
  endedAt: "2026-10-31T22:30:00.000Z",
  crew,
  rolls: [
    { characterId: "k", crit: "nat20" },
    { characterId: "k", crit: null },
    { characterId: "r", crit: "nat1" },
    { characterId: null, crit: "nat20" },
  ],
  messages: [
    { authorType: "system", characterId: null, createdAt: "2026-10-31T20:00:00.000Z" },
    { authorType: "dm", characterId: null, createdAt: "2026-10-31T20:05:00.000Z" },
    { authorType: "player", characterId: "k", createdAt: "2026-10-31T20:06:00.000Z" },
    { authorType: "player", characterId: "k", createdAt: "2026-10-31T20:07:00.000Z" },
    { authorType: "dm", characterId: null, createdAt: "2026-10-31T22:29:00.000Z" },
  ],
  fights: 2,
});

await test("The facts are the sheets', the rolls' and the transcript's: acts played, points, hidden role, dice, moves and the clock", () => {
  assert.deepEqual(facts.crew.map((member) => member.name), ["Kara Voss", "Renn Calder", "Tomas Bello"], "a companion is no crew member");
  const [kara, renn, tomas] = facts.crew;
  assert.deepEqual(kara.agendas.map((entry) => entry.act), [0, 1, 2]);
  assert.deepEqual(renn.agendas.map((entry) => entry.text), ["Audit the losses.", "Find the logs."], "the dead keep the acts they lived to");
  assert.deepEqual(tomas.agendas, [{ act: 2, text: "Carry Ada out." }], "a takeover's acts before they joined are left out");
  assert.equal(tomas.tookOver, true);
  assert.equal(renn.hiddenRole, "A Company synthetic.");
  assert.equal(kara.storyPoints, 3);
  assert.deepEqual([kara.rolls, kara.nat20s, kara.moves], [2, 1, 2]);
  assert.equal(renn.nat1s, 1);
  assert.deepEqual(facts.stats, { minutes: 145, act: 2, gmReplies: 2, moves: 2, rolls: 3, nat20s: 1, nat1s: 1, fights: 2, deaths: 1 }, "a roll no crew member made is not theirs");
});

await test("A long transcript is cut evenly and keeps its end", () => {
  const short = logic.finaleTranscript([{ who: "GM", text: "The lights  die." }, { who: "Kara", text: "I run." }]);
  assert.equal(short, "GM: The lights die.\nKara: I run.");
  const long = Array.from({ length: 100 }, (_, index) => ({ who: "GM", text: `${index} ${"word ".repeat(200)}` }));
  long.push({ who: "GM", text: "The shuttle clears the dock." });
  const cut = logic.finaleTranscript(long, 20_000);
  assert.ok(cut.length <= 20_000, String(cut.length));
  assert.match(cut, /The shuttle clears the dock\.$/);
  assert.match(cut, /^GM: 0 word/, "a cut-down night still has its start when it fits");
  assert.match(cut, /…/);
  const huge = logic.finaleTranscript(Array.from({ length: 2000 }, (_, index) => ({ who: "GM", text: `${index} ${"word ".repeat(40)}` })), 20_000);
  assert.ok(huge.length <= 20_000);
  assert.match(huge, /^GM: \d{3,4} /, "past the shortest cut, the oldest lines go");
  assert.match(huge, /GM: 1999 word/);
});

const prose = logic.readFinaleReply(`Here it is:\n\`\`\`json\n${JSON.stringify({
  headline: "Two made the shuttle.",
  outcome: "Pyrrhic",
  recap: [{ text: "Kara grabbed the case.", picture: 2 }, "Renn died in the vents.", "", { text: "Tomas carried Ada out.", picture: 99 }],
  truth: "The beacon was a lure.",
  crew: [
    { name: "kara voss", fate: "Flew them home.", agendas: [{ act: 1, verdict: "done", line: "She got it." }, { act: 2, verdict: "partly" }, { act: 3, verdict: "nonsense" }], highlight: "The airlock.", moment: 3, award: "Most likely to fly drunk" },
    { name: "Nobody", fate: "Not in the crew." },
  ],
  review: { grade: "b", title: "Loud but alive", commentary: "You argued for an hour and then were brilliant.", bestMove: "Venting the hold.", missed: "The logs in the medbay." },
})}\n\`\`\``);

await test("The model's reply is read leniently: a fence, a case, a blank beat or an unknown verdict cost only that field", () => {
  assert.ok(prose);
  assert.equal(prose.outcome, "pyrrhic");
  assert.equal(prose.review.grade, "B");
  assert.deepEqual(prose.recap.map((beat) => beat.text), ["Kara grabbed the case.", "Renn died in the vents.", "Tomas carried Ada out."]);
  assert.deepEqual(prose.recap.map((beat) => beat.picture), [2, 0, 99], "a bare sentence is a beat without a picture");
  assert.equal(prose.crew[0].agendas[2].verdict, undefined);
  assert.equal(logic.readFinaleReply("I cannot write that."), null);
  assert.equal(logic.readFinaleReply("{}"), null, "a reply with nothing in it is no reply");
});

await test("The closing merges the facts and the prose by name and act; without prose it still closes the night", () => {
  const finale = logic.mergeFinale(facts, prose);
  assert.equal(finale.written, true);
  assert.equal(finale.headline, "Two made the shuttle.");
  const [kara, renn] = finale.crew;
  assert.equal(kara.award, "Most likely to fly drunk");
  assert.deepEqual(kara.agendas.map((entry) => entry.verdict), ["done", "partly", null]);
  assert.equal(kara.agendas[0].line, "She got it.");
  assert.equal(renn.fate, "Did not make it.", "a crew member the reply left out gets a plain fate");
  assert.equal(finale.review.grade, "B");

  const plain = logic.mergeFinale(facts, null);
  assert.equal(plain.written, false);
  assert.equal(plain.headline, "Kara and Tomas made the shuttle.");
  assert.equal(plain.outcome, "pyrrhic", "one dead of three");
  assert.deepEqual(plain.recap, ["Kara and Tomas made the shuttle."]);
  assert.equal(plain.truth, "The beacon was a lure. The Company sent them on purpose.");
  assert.equal(plain.review, null);
  assert.ok(plain.crew.every((member) => member.agendas.every((entry) => entry.verdict === null)));
  assert.equal(logic.outcomeByDeaths([{ dead: true }, { dead: true }]), "lost");
  assert.equal(logic.outcomeByDeaths([{ dead: false }]), "escaped");
});

await test("The TV walks the end, the recap, each crew member, the truth, the review and a board that stays", () => {
  const finale = logic.mergeFinale(facts, prose);
  const steps = logic.finaleSteps(finale);
  assert.deepEqual(steps.map((step) => step.kind), ["end", "recap", "recap", "recap", "crew", "crew", "crew", "truth", "review", "board"]);
  assert.equal(logic.finaleStepMs(steps.at(-1), finale), 0, "the board stays up");
  for (const step of steps.slice(0, -1)) assert.ok(logic.finaleStepMs(step, finale) >= 4000, step.kind);
  const plain = logic.mergeFinale({ ...facts, ending: "" }, null);
  assert.deepEqual(logic.finaleSteps(plain).map((step) => step.kind), ["end", "crew", "crew", "crew", "truth", "board"], "no recap and no review: skipped");
  assert.equal(logic.minutesWords(145), "2 h 25 min");
  assert.equal(logic.minutesWords(40), "40 min");
});

const shots = ["/generated/1.png", "/generated/2.png", "/generated/3.png", "/generated/4.png", "/generated/5.png", "/generated/6.png"];

await test("The night's pictures carry the closing: the model's pick, else an even share; the last scene behind the end", () => {
  assert.equal(
    logic.finaleTranscript([{ who: "GM", text: "The hatch opens.", picture: 4 }, { who: "Kara", text: "I go in." }]),
    "GM [picture 4]: The hatch opens.\nKara: I go in.",
  );
  const finale = logic.mergeFinale({ ...facts, pictures: shots }, prose);
  assert.equal(finale.pictures.end, "/generated/6.png");
  assert.equal(finale.pictures.recap[0], "/generated/2.png", "the model's pick");
  assert.equal(finale.pictures.recap[1], "/generated/4.png", "no pick: the beat's share of the night");
  assert.equal(finale.pictures.recap[2], "/generated/6.png", "a number past the night's pictures is no pick");
  assert.equal(finale.crew[0].moment, "/generated/3.png");
  assert.equal(finale.crew[1].moment, null);
  assert.ok(finale.pictures.review.length > 1 && finale.pictures.review.length <= 6);
  const picked = logic.finalePictures(shots, 3, [5, 5, 0]);
  assert.equal(picked.recap[0], "/generated/5.png");
  assert.notEqual(picked.recap[1], "/generated/5.png", "a picture is used once");
  const bare = logic.finalePictures([], 3);
  assert.deepEqual(bare, { end: null, recap: [null, null, null], review: [] }, "a night painted nothing: no pictures, nothing breaks");
  const { pictures: _dropped, ...old } = finale;
  const backfilled = logic.withFinalePictures(old, shots);
  assert.equal(backfilled.pictures.recap.length, 3, "a closing stored before pictures gets the night's");
  assert.equal(logic.withFinalePictures(finale, []), finale, "one that has them keeps them");
});

await test("The narrator reads every step but the board, the screen's own words in the GM's voice", () => {
  const finale = logic.mergeFinale({ ...facts, pictures: shots }, prose);
  const steps = logic.finaleSteps(finale);
  const texts = logic.finaleSpeechTexts(finale);
  assert.equal(texts.length, steps.length);
  assert.equal(texts[0], "The end. Two made the shuttle.");
  assert.equal(texts[1], "Here is what happened. Kara grabbed the case.");
  assert.equal(texts[2], "Renn died in the vents.");
  assert.match(texts[4], /^Kara Voss\. Flew them home\. She got it\./);
  assert.match(texts[4], /Tonight's award: Most likely to fly drunk\.$/);
  assert.match(texts.at(-2), /^Loud but alive\. I'd give you a B\. You argued/);
  assert.equal(texts.at(-1), "", "the board is only looked at");
  assert.match(logic.finaleSpeech({ kind: "review" }, { ...finale, review: { ...finale.review, grade: "A" } }), /an A\./);
  assert.ok(logic.crewRevealMs(finale.crew[0]) > 4000, "a crew step stays up until its reveal has landed");
});

// ---- the rim, at a couch table ----

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const model = await fakeModel();
model.pointAt(world);
const campaigns = await import("../src/lib/db/campaigns.ts");
process.env.OPENAI_COMPAT_BASE_URL = campaigns.getCampaignById(world.campaignId).settings.customBaseUrl;
process.env.OPENAI_COMPAT_MODEL = "fake";

const sheets = await import("../src/lib/db/sheets.ts");
const store = await import("../src/lib/couch/store.ts");
const encounters = await import("../src/lib/db/encounters.ts");
const messages = await import("../src/lib/db/messages.ts");
const finaleRim = await import("../src/lib/couch/finale.ts");
const { armCouchQuiet } = await import("../src/lib/couch/tension.ts");
const { writtenForge } = await import("../src/lib/couch/scenarios/index.ts");
const { handleEndNight } = await import("../src/lib/dm/couch-tools.ts");
const play = await import("../src/lib/couch/play.ts");
const { dmTurnTools } = await import("../src/lib/dm/turn.ts");

const written = writtenForge("dead-air", 2);
assert.ok("forge" in written, JSON.stringify(written));

// A couch night of one: Kara, forged, under way.
async function night(target) {
  const kara = target.addUser("kara");
  assert.ok(!("error" in campaigns.joinByInviteCode(kara.id, target.campaign().inviteCode)));
  const sheet = sheets.createSheet(target.campaignId, kara.id, 1, {
    ...heroInput({ name: "Kara Voss", class: "fighter" }),
    agenda: { acts: ["Get the sample case off the ship.", "Keep the radio dead.", "Leave alone."], act: 0, hiddenRole: "A Company plant.", storyPoints: 2 },
    crewRole: "Colonial Marine",
  });
  store.beginCouchForge(target.campaignId, { players: 1, seed: "", offLimits: "" });
  store.finishCouchForge(target.campaignId, written.forge, []);
  campaigns.setCampaignStatus(target.campaignId, "active");
  return { kara, sheet };
}

const { kara, sheet } = await night(world);

function post(authorType, content) {
  const seq = campaigns.allocateSeq(world.campaignId);
  return authorType === "dm"
    ? messages.insertCampaignMessage({ campaignId: world.campaignId, seq, authorType, content, speech: [] })
    : messages.insertCampaignMessage({ campaignId: world.campaignId, seq, authorType, content, userId: kara.id, characterId: sheet.id });
}

async function ready(target, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const view = finaleRim.couchFinaleView(target.campaign());
    if (view?.status === "ready") return view.finale;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the closing was never written");
}

const CLOSING = {
  headline: "Kara flew out alone.",
  outcome: "escaped",
  recap: ["Kara found the case.", "Kara cut the radio.", "Kara flew out alone."],
  truth: "The beacon was a lure.",
  crew: [{ name: "Kara Voss", fate: "Alone in the shuttle, the case on her lap.", agendas: [{ act: 1, verdict: "done", line: "She carried it out." }, { act: 2, verdict: "done", line: "" }, { act: 3, verdict: "done", line: "" }], highlight: "Shooting the lock.", award: "One-woman crew" }],
  review: { grade: "A", title: "Ruthless and right", commentary: "Kara, you trusted nobody, and you were right.", bestMove: "Cutting the radio.", missed: "The second sample in the freezer." },
};

await test("end_night is offered at a couch table, and refused off one, before act III and in a fight", () => {
  const campaign = world.campaign();
  assert.ok(dmTurnTools(campaign, false, true, false).some((tool) => tool.function.name === "end_night"));
  const plain = { ...campaign, gameSettings: { ...campaign.gameSettings, couchMode: false } };
  assert.ok(!dmTurnTools(plain, false, true, false).some((tool) => tool.function.name === "end_night"));
  assert.equal(handleEndNight(plain, JSON.stringify({ ending: "Over." })).refused, "rules");
  assert.equal(handleEndNight(campaign, "{}").retry, true);
  const early = handleEndNight(campaign, JSON.stringify({ ending: "They gave up." }));
  assert.equal(early.refused, "rules");
  assert.match(early.error, /Act III; this is Act I/);
  play.advanceCouchAct(world.campaignId);
  play.advanceCouchAct(world.campaignId);
  const fight = encounters.createEncounter(world.campaignId, "The thing in the vents");
  assert.equal(handleEndNight(campaign, JSON.stringify({ ending: "Over." })).refused, "rules");
  encounters.endEncounter(fight.id, "fled");
  assert.equal(finaleRim.couchFinaleView(world.campaign()), null, "nothing is asked yet");
});

await test("A night the GM ends closes once its passage is out, written over the transcript and the secret outline", async () => {
  post("dm", "The shuttle bay is dark.");
  post("player", "I shoot the lock and get in.");
  model.script([reply({ text: JSON.stringify(CLOSING) })]);
  const asked = handleEndNight(world.campaign(), JSON.stringify({ ending: "Kara flew out alone." }));
  assert.equal(asked.ok, true);
  assert.match(asked.note, /ends after this reply/);
  assert.equal(world.campaign().status, "active", "the closing passage comes first");
  assert.equal(finaleRim.couchFinaleView(world.campaign()), null);
  assert.equal(finaleRim.settleCouchEnding(world.campaign()), true);
  assert.equal(world.campaign().status, "ended");
  assert.equal(finaleRim.couchFinaleView(world.campaign()).status ?? "", "writing");
  const finale = await ready(world);
  assert.equal(finale.written, true);
  assert.equal(finale.review.grade, "A");
  assert.equal(finale.crew[0].hiddenRole, "A Company plant.");
  assert.deepEqual(finale.crew[0].agendas.map((entry) => entry.verdict), ["done", "done", "done"]);
  assert.equal(finale.stats.act, 2);
  const asking = model.requests.at(-1).messages;
  assert.match(asking[0].content, /Write the closing the TV shows them/);
  assert.match(asking[1].content, /How the GM said it ended: Kara flew out alone\./);
  assert.match(asking[1].content, /SECRET OUTLINE:\nTruth: /);
  assert.match(asking[1].content, /Kara Voss: I shoot the lock and get in\./);
  assert.match(asking[1].content, /hidden role: A Company plant\./);
  assert.equal(finaleRim.settleCouchEnding(world.campaign()), false, "an ended night ends once");
  assert.equal(handleEndNight({ ...world.campaign(), status: "active" }, JSON.stringify({ ending: "Again." })).note, "The night is already over.");
  assert.equal(armCouchQuiet(world.campaignId, Date.now() + 10 * 60_000), false, "an ended night's room wakes nobody");
});

await test("The GM's own turn ends the night after its closing passage", async () => {
  const other = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
  model.pointAt(other);
  const { kara: player, sheet: own } = await night(other);
  play.advanceCouchAct(other.campaignId);
  play.advanceCouchAct(other.campaignId);
  model.script([
    reply({ calls: [call("end_night", { ending: "Kara flew out alone." })] }),
    reply({ text: "The shuttle tears free of the dock, and the beacon falls silent behind her." }),
    reply({ text: JSON.stringify(CLOSING) }),
  ]);
  const passage = await model.turn(other, "I punch it.", own.id, player.id);
  assert.ok(passage, "the closing passage was written");
  assert.match(passage.content, /beacon falls silent/);
  assert.equal(other.campaign().status, "ended");
  const finale = await ready(other);
  assert.equal(finale.headline, "Kara flew out alone.");
});

await test("A night the host ends gets its closing, and a backend that fails still closes it with the facts", async () => {
  const third = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
  model.pointAt(third);
  await night(third);
  model.script([failure(500)]);
  campaigns.setCampaignStatus(third.campaignId, "ended");
  assert.equal(finaleRim.couchFinaleView(third.campaign()).status, "writing", "a snapshot of an ended night starts its closing");
  const finale = await ready(third);
  assert.equal(finale.written, false);
  assert.equal(finale.endedBy, "host");
  assert.equal(finale.review, null);
  assert.equal(finale.crew[0].name, "Kara Voss");
  assert.equal(finale.crew[0].hiddenRole, "A Company plant.");
});

model.close();
finish();
