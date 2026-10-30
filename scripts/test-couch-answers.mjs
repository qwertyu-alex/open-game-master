import assert from "node:assert/strict";
import http from "node:http";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";

const world = await openWorld();
const { couchRoundAnswers, couchAnswersSpeech, couchAnswersVisible } = await import("../src/lib/couch/answers-logic.ts");
const { publishCouchAnswers, latestCouchAnswers } = await import("../src/lib/couch/answers.ts");
const { tableWaitTurnStarted } = await import("../src/lib/dm/table-wait.ts");
const { updateGameSettings, latestSeq } = await import("../src/lib/db/campaigns.ts");
const { saveGlobalConfig } = await import("../src/lib/db/app-settings.ts");
const { publishPersisted, subscribe } = await import("../src/lib/events.ts");
const { enqueueNarrationAudio } = await import("../src/lib/tts.ts");
const { enqueueMediaJob } = await import("../src/lib/media-queue.ts");
const { CouchTvAnswers } = await import("../src/components/couch/CouchTvAnswers.tsx");
const { narrationAfterUnlock } = await import("../src/lib/narration-queue-logic.ts");

let passed = 0;
async function test(name, run) { await run(); passed += 1; console.log(`ok: ${name}`); }
const seats = [{ userId: "a", characterId: "ca", name: "Ada" }, { userId: "b", characterId: "cb", name: "Bo" }];
const post = (seq, userId, content, authorType = "player") => ({ seq, userId, characterId: seats.find((seat) => seat.userId === userId)?.characterId ?? null, content, authorType });

await test("all public answers are grouped by player, without OOC, system or GM text", () => {
  const round = couchRoundAnswers([
    post(1, "a", "I turn the wheel."), post(2, "b", "I hold the rope."),
    post(3, "a", "(ooc) A rules question."), post(4, "a", "Then I step back."),
    post(5, null, "A hidden world note.", "system"), post(6, null, "The GM's next scene.", "dm"),
  ], seats, []);
  assert.deepEqual(round.answers.map((answer) => [answer.name, answer.content]), [["Ada", "I turn the wheel.\n\nThen I step back."], ["Bo", "I hold the rope."]]);
  assert.equal(round.throughSeq, 4);
  assert.equal(round.id, "couch-answers-4");
  assert.equal(couchAnswersSpeech(round), "Ada: I turn the wheel.\n\nThen I step back.\n\nBo: I hold the rope.");
  assert.equal(couchRoundAnswers([post(1, "a", "(ooc) Not an answer.")], seats, []), null);
});

await test("a pass is shown and spoken, but never replaces a real answer", () => {
  const round = couchRoundAnswers([post(1, "a", "I listen.")], seats, [{ userId: "a", seq: 2 }, { userId: "b", seq: 3 }, { userId: "missing", seq: 4 }]);
  assert.equal(round.answers[0].passed, false);
  assert.equal(round.answers[1].passed, true);
  assert.equal(round.answers.length, 2);
  assert.match(couchAnswersSpeech(round), /Bo: Passes this round/);
  assert.equal(round.throughSeq, 3);
});

await test("the TV renders everyone's named answers together", () => {
  const round = couchRoundAnswers([post(1, "a", "I turn the wheel."), post(2, "b", "I hold the rope.")], seats, []);
  const html = renderToStaticMarkup(createElement(CouchTvAnswers, { round, sheets: [] }));
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  for (const words of ["Ada", "Bo", "I turn the wheel.", "I hold the rope."]) assert.ok(html.includes(words));
});

await test("the TV keeps the whole round through its readout, then yields to new narration without replaying on reload", () => {
  const round = couchRoundAnswers([post(10, "a", "I listen.")], seats, []);
  const base = { round, latestNarrationSeq: 11, playingMessageId: null, readoutExpected: true, live: true, dismissedId: null };
  assert.equal(couchAnswersVisible({ ...base, latestNarrationSeq: 9, readoutExpected: false }), true);
  assert.equal(couchAnswersVisible(base), true, "new prose does not cut off the answer readout");
  assert.equal(couchAnswersVisible({ ...base, playingMessageId: round.id, dismissedId: round.id }), true);
  assert.equal(couchAnswersVisible({ ...base, dismissedId: round.id }), false);
  assert.equal(couchAnswersVisible({ ...base, live: false }), false, "a snapshot never waits for historical audio");
  assert.equal(couchAnswersVisible({ ...base, readoutExpected: false }), false, "muted, disabled or failed voice does not hold the old screen");
});

await test("enabling sound keeps the newest answer readout ahead of its GM passage, while ordinary history stays silent", () => {
  const clip = (messageId, keepWithNext = false) => ({ messageId, url: `${messageId}.mp3`, keepWithNext });
  assert.deepEqual(narrationAfterUnlock([clip("old"), clip("new")]).map((entry) => entry.messageId), ["new"]);
  assert.deepEqual(narrationAfterUnlock([clip("old-round", true), clip("old-gm"), clip("round", true), clip("gm")]).map((entry) => entry.messageId), ["round", "gm"]);
  assert.deepEqual(narrationAfterUnlock([clip("old"), clip("round", true)]).map((entry) => entry.messageId), ["round"]);
  assert.deepEqual(narrationAfterUnlock([]), []);
});

const heard = [];
const server = http.createServer(async (request, response) => {
  if (request.url === "/v1/audio/speech") {
    let text = "";
    for await (const chunk of request) text += chunk;
    heard.push(JSON.parse(text));
    response.writeHead(200, { "Content-Type": "audio/mpeg" });
    response.end(Buffer.from("ID3" + "x".repeat(160)));
  } else {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(request.url === "/v1/voices" ? { voices: ["af_heart"] } : { data: [{ id: "kokoro" }] }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const events = [];
const off = subscribe(world.campaignId, (chunk) => {
  const type = /^event: (.+)$/m.exec(chunk)?.[1];
  const data = /^data: (.+)$/m.exec(chunk)?.[1];
  if (type && data) events.push({ type, payload: JSON.parse(data) });
});

try {
  const ada = world.addHero({ name: "Ada", user: world.addUser("ada") });
  const bo = world.addHero({ name: "Bo", user: world.addUser("bo") });
  updateGameSettings(world.campaignId, { couchMode: true, ttsEnabled: true, ttsAutoCast: true, ttsVoice: "af_heart" });
  saveGlobalConfig({ speech: { ttsProvider: "kokoro", kokoroUrl: `http://127.0.0.1:${server.address().port}`, ttsModel: "kokoro", ttsVoice: "af_heart" } });
  const narration = world.say("dm", "The hatch waits.");
  tableWaitTurnStarted(world.campaignId, narration.seq);

  await test("the completed round publishes once and its narrator readout is queued before the GM's reply", async () => {
    world.say("player", "I turn the wheel.", ada);
    assert.equal(latestCouchAnswers(world.campaignId), null, "no answer reveal as the first player types");
    world.say("player", "I hold the rope.", bo);
    world.say("player", "(ooc) Secret test noise.", ada);
    const through = latestSeq(world.campaignId);
    tableWaitTurnStarted(world.campaignId, through);
    const round = latestCouchAnswers(world.campaignId);
    assert.deepEqual(round.answers.map((answer) => answer.name), ["Ada", "Bo"]);
    assert.equal(publishCouchAnswers(world.campaign(), narration.seq, through), null, "retry does not replay a round");
    await enqueueNarrationAudio(world.campaignId, "next-gm", "The hatch opens.", [], { ttsVoice: "af_heart" });
    const answerRead = heard.findIndex((entry) => entry.input.includes("I turn the wheel"));
    const gmRead = heard.findIndex((entry) => entry.input.includes("The hatch opens"));
    assert.ok(answerRead >= 0 && gmRead > answerRead, JSON.stringify(heard));
    assert.ok(heard[answerRead].input.includes("Ada") && heard[answerRead].input.includes("Bo") && heard[answerRead].input.includes("I hold the rope"));
    assert.equal(heard[answerRead].voice, "af_heart", "the campaign narrator reads all the replies");
    assert.ok(!heard.some((entry) => entry.input.includes("Secret test noise")));
    assert.equal(events.filter((event) => event.type === "couch_answers").length, 1);
    const ready = events.filter((event) => event.type === "tts_ready").map((event) => event.payload.messageId);
    assert.deepEqual(ready, [round.id, "next-gm"]);
  });

  await test("the next round includes passes and works with narration switched off", async () => {
    const narration = world.say("dm", "The passage forks.");
    tableWaitTurnStarted(world.campaignId, narration.seq);
    updateGameSettings(world.campaignId, { ttsEnabled: false });
    world.say("player", "I take the left passage.", ada);
    publishPersisted(world.campaignId, "table_pass", { userId: bo.userId });
    tableWaitTurnStarted(world.campaignId, latestSeq(world.campaignId));
    assert.equal(latestCouchAnswers(world.campaignId).answers.find((answer) => answer.userId === bo.userId).passed, true);
    await enqueueMediaJob("drain", async () => {}, `tts:${world.campaignId}`);
    assert.equal(heard.length, 2, "no extra speech when TTS is off");
    updateGameSettings(world.campaignId, { couchMode: false });
    assert.equal(publishCouchAnswers(world.campaign(), narration.seq, latestSeq(world.campaignId)), null);
  });
} finally {
  off();
  await new Promise((resolve) => server.close(resolve));
  world.close();
}
console.log(`test-couch-answers: ${passed} passed`);
