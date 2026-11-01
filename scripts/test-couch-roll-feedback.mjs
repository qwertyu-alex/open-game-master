import assert from "node:assert/strict";
import http from "node:http";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { call, fakeModel, reply, settleQueue } from "./lib/enforce-narrator.mjs";
import { call as callRoute } from "./lib/enforce-campaign.mjs";

const world = await openWorld({ gameSettings: { couchMode: true, ttsEnabled: false } });
const { couchAttackRulings, couchRollCall, couchRollFeedback, couchRollVoiceId, rollMath } = await import("../src/lib/couch/roll-feedback-logic.ts");
const { rollHolderIds } = await import("../src/lib/dice/held-rolls.ts");
const throwRoute = await world.route("campaigns/[campaignId]/pending-rolls/[pendingRollId]");
const { publishCouchRollFeedback } = await import("../src/lib/couch/roll-feedback.ts");
const { publishCouchRules } = await import("../src/lib/couch/rules.ts");
const { COUCH_PLAY_RULES, COUCH_RULES_BRIEFING } = await import("../src/lib/couch/rules-logic.ts");
const { rollExpression } = await import("../src/lib/dice.ts");
const { insertRoll } = await import("../src/lib/db/rolls.ts");
const { listRecentMessages } = await import("../src/lib/db/messages.ts");
const { updateGameSettings } = await import("../src/lib/db/campaigns.ts");
const { subscribe } = await import("../src/lib/events.ts");
const { saveGlobalConfig } = await import("../src/lib/db/app-settings.ts");
const { enqueueNarrationAudio } = await import("../src/lib/tts.ts");
const { enqueueMediaJob } = await import("../src/lib/media-queue.ts");
const { CouchRollCard, CouchRolls } = await import("../src/components/couch/CouchRolls.tsx");
const { CouchRollPrompt } = await import("../src/components/couch/CouchRollPrompt.tsx");
const { CouchRollChip, CouchRules } = await import("../src/components/couch/CouchRules.tsx");
const { campaignReducer, INITIAL_CAMPAIGN_STATE, STREAMED_EVENTS } = await import("../src/app/campaigns/[campaignId]/useCampaignStream.ts");

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`ok: ${name}`); }
const hero = world.addHero({ name: "Test engineer", class: "fighter" });
const stored = (expression = "1d20+3", face = 12, overrides = {}) => {
  const result = rollExpression(expression, () => face);
  return insertRoll({ campaignId: world.campaignId, characterId: hero.id, requestedBy: "dm", kind: "ability_check", detail: "Intelligence", dc: 15, result, ...overrides });
};

await test("the announcement gives stakes and target without revealing dice or result", () => {
  const feedback = couchRollFeedback(stored(), hero.name, "Open the hatch; failure jams the coupling.");
  assert.match(feedback.announcement, /Open the hatch; failure jams the coupling/);
  assert.match(feedback.announcement, /rolling 1d20\+3.*Target 15/);
  assert.doesNotMatch(feedback.announcement, /Total|Dice:|Success|Failure/);
  assert.match(feedback.result, /Dice: 12\. Total 15 against target 15\. The roll succeeds/);
  assert.equal(feedback.math, "12 + 3 = 15");
});

await test("natural faces do not override ordinary checks, but do decide attack rolls", () => {
  assert.equal(couchRollFeedback(stored("1d20", 20, { dc: 25 })).verdict, "Failure");
  assert.equal(couchRollFeedback(stored("1d20+10", 1, { dc: 5 })).verdict, "Success");
  assert.equal(couchRollFeedback(stored("1d20", 20, { kind: "attack", attacker: null, dc: 25 })).verdict, "Hit");
  assert.equal(couchRollFeedback(stored("1d20+10", 1, { kind: "attack", attacker: null, dc: 5 })).verdict, "Miss");
});

await test("attack feedback follows the engine's defenses and critical ruling rather than the face alone", () => {
  const attack = stored("1d20", 20, { kind: "attack", attacker: null, dc: null });
  const rulings = couchAttackRulings([attack], { rolled: 20, vsAc: 18, hit: false, duplicate: true });
  const feedback = couchRollFeedback(attack, hero.name, "", rulings.get(attack.id));
  assert.equal(feedback.verdict, "Miss");
  assert.equal(feedback.target, 18);
  assert.doesNotMatch(feedback.result, /Critical hit/);
  assert.match(feedback.result, /attack misses/);
  assert.equal(couchRollFeedback(attack, hero.name, "", { hit: true, crit: true }).verdict, "Critical hit");
  assert.equal(couchRollFeedback(attack).verdict, "Natural 20", "no invented adjudication without a tool ruling");
  assert.equal(couchAttackRulings([attack], { swings: [{ rolled: 19, hit: true }] }).size, 0, "unmatched attacks are never guessed");
});

await test("advantage explains kept dice and damage and initiative never invent a pass or fail", () => {
  const faces = [4, 17];
  const roll = stored("1d20", 12);
  const advantage = { ...roll, expression: "2d20kh1-2", advantage: "advantage", breakdown: rollExpression("2d20kh1-2", () => faces.shift()), total: 15 };
  assert.equal(rollMath(advantage), "(4 discarded, 17) − 2 = 15");
  assert.match(couchRollFeedback(advantage).announcement, /keep the higher/);
  const damage = couchRollFeedback({ ...roll, kind: "damage", dc: null, success: null });
  assert.equal(damage.verdict, "Damage rolled");
  assert.match(damage.result, /defenses may change/i);
  assert.equal(couchRollFeedback({ ...roll, kind: "initiative", dc: null, success: null }).verdict, "Turn order");
});

await test("private and redacted rolls have no public presentation", () => {
  const roll = stored();
  for (const visibility of ["secret", "blind", "self", "dm"]) assert.equal(couchRollFeedback({ ...roll, visibility }), null);
  assert.equal(couchRollFeedback({ ...roll, breakdown: null }), null);
});

await test("the TV reveals faces and a separate total only after rolling", () => {
  const feedback = couchRollFeedback(stored("1d20+18", 20, { dc: 25 }));
  for (const phase of ["announce", "rolling"]) {
    const html = renderToStaticMarkup(createElement(CouchRollCard, { feedback, phase }));
    assert.ok(!html.includes("38"), html);
    assert.ok(html.includes("?"));
    assert.ok(!html.includes("Critical hit"));
  }
  const html = renderToStaticMarkup(createElement(CouchRollCard, { feedback, phase: "result" }));
  assert.match(html, /38<small> total/);
  assert.match(html, /20 \+ 18 = 38/);
  assert.match(html, /aria-live="polite"/);
});

await test("the phone keeps public roll details in the story, never a secret roll, and shares the opening rules", () => {
  const roll = stored();
  const html = renderToStaticMarkup(createElement(CouchRollChip, { roll, who: hero.name }));
  assert.ok(html.includes("12 + 3 = 15") && html.includes("needs 15") && html.includes(hero.name));
  const secret = { ...roll, id: "secret", detail: "Hidden agenda", visibility: "secret" };
  assert.equal(renderToStaticMarkup(createElement(CouchRollChip, { roll: secret, who: hero.name })), "");
  const rules = renderToStaticMarkup(createElement(CouchRules));
  for (const rule of COUCH_PLAY_RULES) {
    assert.ok(COUCH_RULES_BRIEFING.includes(rule.text));
    assert.ok(rules.includes(rule.title));
  }
  assert.match(COUCH_RULES_BRIEFING, /spend one: the failure becomes a success/);
});

await test("a couch table holds every player's rolls for their phone; other tables only those who asked", () => {
  const members = [{ userId: "a", useRealDice: false, holdRolls: false }, { userId: "b", useRealDice: true, holdRolls: false }];
  assert.deepEqual([...rollHolderIds({ dicePolicy: "digital_only", couchMode: true }, members)], ["a", "b"]);
  assert.deepEqual([...rollHolderIds({ dicePolicy: "real_allowed" }, members)], ["b"]);
  assert.deepEqual([...rollHolderIds({ dicePolicy: "digital_only", couchMode: false }, members)], []);
});

const ask = { id: "called-1", kind: "skill_check", detail: "Athletics", expression: "1d20+5", advantage: "none", dc: 15, reason: "Climb the shaft before the doors seal." };

await test("a called roll names the stakes, the dice, the bonus and the target, never a face", () => {
  const called = couchRollCall(ask, "Kara");
  assert.deepEqual([called.what, called.formula, called.bonus, called.target, called.edge], ["Athletics", "d20 + 5", 5, 15, ""]);
  assert.equal(called.announcement, "Kara · Athletics. Climb the shaft before the doors seal. Skill check: Kara, take your phone and roll a d20 plus 5. Target 15; meet or beat it.");
  const edge = couchRollCall({ ...ask, expression: "2d20kh1-1", advantage: "advantage", dc: null }, "Kara");
  assert.equal(edge.formula, "d20 − 1");
  assert.match(edge.announcement, /roll a d20 minus 1\. Advantage: two dice, the higher counts\.$/);
  const damage = couchRollCall({ ...ask, kind: "damage", detail: "", expression: "2d6+1d4+3", dc: null, reason: "" }, "Kara");
  assert.equal(damage.formula, "2d6 + d4 + 3");
  assert.equal(damage.announcement, "Kara · Damage. Damage: Kara, take your phone and roll two d6 and a d4 plus 3.");
});

await test("the phone's roll screen shows the call and a die to tap, and only to the player it waits on", () => {
  const pending = { ...ask, userId: hero.userId, characterId: hero.id, createdAt: new Date().toISOString() };
  const state = { ...INITIAL_CAMPAIGN_STATE, me: { id: hero.userId }, campaign: world.campaign(), pendingRolls: [pending] };
  const html = renderToStaticMarkup(createElement(CouchRollPrompt, { state, sheet: world.sheet(hero.id) }));
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.ok(html.includes("Climb the shaft") && html.includes("d20 + 5") && html.includes("need 15 or more"), html);
  assert.match(html, /<button[^>]*class="couch-roll-die"[^>]*>[\s\S]*Roll<\/span><\/button>/, "one big Roll button");
  assert.equal(html.match(/<button/g).length, 1, "and nothing else to press");
  assert.doesNotMatch(html, /total|Success|Failure/i);
  const elsewhere = { ...state, me: { id: "another-player" } };
  assert.equal(renderToStaticMarkup(createElement(CouchRollPrompt, { state: elsewhere, sheet: world.sheet(hero.id) })), "");
});

await test("the TV calls a waiting roll by name with its dice and target, and keeps a screened roll off the room's screen", () => {
  const narration = { volume: 1, muted: false, unlocked: true, playingMessageId: null, playbackFailure: null };
  const pending = { ...ask, userId: hero.userId, characterId: hero.id, createdAt: new Date().toISOString() };
  const state = { ...INITIAL_CAMPAIGN_STATE, campaign: world.campaign(), sheets: world.sheets(), pendingRolls: [pending] };
  const html = renderToStaticMarkup(createElement(CouchRolls, { state, narration }));
  for (const text of [hero.name, "Athletics", "Climb the shaft", "d20 + 5", "Target", "throws from their phone", "couch-dice-tray"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Roll for"), "the host's stand-in throw waits for a phone that went quiet");
  const screened = { ...state, pendingRolls: [{ ...pending, visibility: "secret" }] };
  assert.ok(!renderToStaticMarkup(createElement(CouchRolls, { state: screened, narration })).includes("Climb the shaft"));
});

await test("the stream queues consecutive rolls, ignores duplicate events and clears effects on snapshot", () => {
  assert.ok(STREAMED_EVENTS.includes("couch_roll"));
  const feedback = couchRollFeedback(stored());
  const event = (seq) => ({ type: "event", eventType: "couch_roll", payload: feedback, seq });
  const first = campaignReducer(INITIAL_CAMPAIGN_STATE, event(10));
  assert.equal(campaignReducer(first, event(10)), first);
  const second = campaignReducer(first, event(11));
  assert.deepEqual(second.couchRolls.map((entry) => entry.seq), [10, 11]);
  const reloaded = campaignReducer(second, { type: "snapshot", payload: { lastSeq: 12 } });
  assert.deepEqual(reloaded.couchRolls, []);
});

const events = [];
const off = subscribe(world.campaignId, (chunk) => {
  const type = /^event: (.+)$/m.exec(chunk)?.[1];
  const data = /^data: (.+)$/m.exec(chunk)?.[1];
  if (type && data) events.push({ type, payload: JSON.parse(data) });
});
const model = await fakeModel();
try {
  // A crew member's own check, thrown from their phone, end to end: the
  // GM's call waits, the throw lands on the TV, and the story resumes.
  const throwTurn = async (narration) => {
    model.pointAt(world);
    model.script([
      reply({ calls: [call("request_roll", { characterId: hero.id, kind: "ability_check", ability: "int", dc: 15, reason: "Free the coupling; failure leaves the hatch shut.", about: "none", by: "none", terrain: "none" })] }),
      reply({ text: narration }),
    ]);
    const start = events.length;
    await model.turn(world, "I work the jammed coupling.", hero.id);
    const parked = events.slice(start).filter((event) => event.type === "roll_pending");
    assert.equal(parked.length, 1, JSON.stringify(events.slice(start).map((event) => event.type)));
    assert.equal(events.slice(start).filter((event) => event.type === "couch_roll").length, 0, "nothing lands before the throw");
    const pending = parked[0].payload.pendingRoll;
    world.signIn(world.owner);
    const thrown = await callRoute(throwRoute, "POST", { fallback: "digital" }, { campaignId: world.campaignId, pendingRollId: pending.id });
    assert.equal(thrown.status, 200, JSON.stringify(thrown.json));
    await settleQueue(world.campaignId);
    return { start, pending, roll: thrown.json.roll };
  };

  await test("a crew member's roll waits for their phone, lands on the TV once thrown, and the story resumes from it", async () => {
    const { start, pending, roll } = await throwTurn("The coupling shrieks and gives a finger's width. You can work it further, or go around.");
    assert.equal(pending.userId, hero.userId);
    assert.match(couchRollCall(pending, hero.name).announcement, /failure leaves the hatch shut.*take your phone and roll a d20.*Target 15/);
    const landed = events.slice(start).filter((event) => event.type === "couch_roll");
    assert.equal(landed.length, 1);
    assert.equal(landed[0].payload.pendingId, pending.id);
    assert.equal(landed[0].payload.roll.id, roll.id);
    assert.match(landed[0].payload.result, new RegExp(`Total ${roll.total}`));
    assert.ok(listRecentMessages(world.campaignId, 4).some((message) => message.content.includes("finger's width")), "the GM narrates once the throw is in");
  });

  await test("the rules are a durable narrated passage before the opening scene", () => {
    publishCouchRules(world.campaign());
    assert.equal(listRecentMessages(world.campaignId, 1)[0].content, COUCH_RULES_BRIEFING);
  });

  const spoken = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === "/v1/audio/speech") {
      let body = "";
      for await (const chunk of request) body += chunk;
      spoken.push(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "audio/mpeg" });
      response.end(Buffer.from("ID3" + "x".repeat(160)));
    } else {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(request.url === "/v1/voices" ? { voices: ["af_heart"] } : { data: [{ id: "kokoro" }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await test("speech reads the briefing, roll announcements and results in order before the story", async () => {
      saveGlobalConfig({ speech: { ttsProvider: "kokoro", kokoroUrl: `http://127.0.0.1:${server.address().port}`, ttsModel: "kokoro", ttsVoice: "af_heart" } });
      updateGameSettings(world.campaignId, { ttsEnabled: true, ttsVoice: "af_heart" });
      const publicRoll = stored();
      const privateRoll = stored("1d20", 19, { visibility: "secret", detail: "Secret orders" });
      const start = events.length;
      publishCouchRules(world.campaign());
      publishCouchRollFeedback(world.campaign(), [publicRoll.id, privateRoll.id], "Free the coupling.");
      await enqueueNarrationAudio(world.campaignId, "following-scene", "The hatch slides open.", [], { ttsVoice: "af_heart" });
      const speech = spoken.map((entry) => entry.input).join(" ");
      assert.ok(speech.indexOf("Before we begin") < speech.indexOf("Free the coupling"), speech);
      assert.ok(speech.indexOf("Free the coupling") < speech.indexOf("Total 15"), speech);
      assert.ok(speech.indexOf("Total 15") < speech.indexOf("The hatch slides open"), speech);
      assert.ok(!speech.includes("Secret orders"));
      const ready = events.slice(start).filter((event) => event.type === "tts_ready").map((event) => event.payload.messageId);
      assert.deepEqual(ready.slice(-3), [couchRollVoiceId(publicRoll.id, "announce"), couchRollVoiceId(publicRoll.id, "result"), "following-scene"]);
      assert.equal(events.slice(start).filter((event) => event.type === "couch_roll").length, 1);
    });
    await test("a phone's throw is called aloud when it parks and only its result is read when it lands", async () => {
      updateGameSettings(world.campaignId, { ttsEnabled: true, ttsVoice: "af_heart" });
      const before = spoken.length;
      const { start, pending, roll } = await throwTurn("The hatch grinds open onto the dark.");
      await enqueueMediaJob("drain", async () => {}, `tts:${world.campaignId}`);
      const speech = spoken.slice(before).map((entry) => entry.input).join(" ");
      assert.ok(speech.indexOf("take your phone and roll") >= 0 && speech.indexOf("take your phone and roll") < speech.indexOf(`Total ${roll.total}`), speech);
      const ready = events.slice(start).filter((event) => event.type === "tts_ready").map((event) => event.payload.messageId);
      assert.ok(ready.indexOf(couchRollVoiceId(pending.id, "call")) >= 0 && ready.indexOf(couchRollVoiceId(pending.id, "call")) < ready.indexOf(couchRollVoiceId(roll.id, "result")), JSON.stringify(ready));
      assert.ok(!ready.includes(couchRollVoiceId(roll.id, "announce")), "the call was the announcement");
    });

    await test("ordinary tables and disabled narration do not gain roll speech", async () => {
      const before = spoken.length;
      const roll = stored();
      updateGameSettings(world.campaignId, { ttsEnabled: false });
      publishCouchRollFeedback(world.campaign(), [roll.id]);
      await enqueueMediaJob("drain", async () => {}, `tts:${world.campaignId}`);
      assert.equal(spoken.length, before);
      const count = events.length;
      updateGameSettings(world.campaignId, { couchMode: false });
      publishCouchRollFeedback(world.campaign(), [roll.id]);
      publishCouchRules(world.campaign());
      assert.equal(events.length, count);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  off();
  model.close();
  world.close();
}
console.log(`test-couch-roll-feedback: ${passed} passed`);
