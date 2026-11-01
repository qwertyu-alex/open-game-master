// The stand-in players' reading of a couch snapshot (src/lib/couch/autoplay-logic.ts).
import assert from "node:assert/strict";
import { addressed, botRolls, botTruceAnswers, dueBots, gmText, parseMove, playerPrompt, typedMove } from "../src/lib/couch/autoplay-logic.ts";

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}\n${error.stack}`);
  }
}

const sheets = [
  { id: "s1", userId: "u1", name: "Teddy Malloy", crewRole: "engineer", currentHp: 14, maxHp: 14, equipment: [{ name: "Hatchet", qty: 2 }], agenda: { acts: ["Steal an egg"], act: 0, hiddenRole: "" } },
  { id: "s2", userId: "u2", name: "Anouk Visser", crewRole: "medic", currentHp: 9, maxHp: 9 },
  { id: "s3", userId: "u3", name: "Mara Castellano", crewRole: "captain", currentHp: 11, maxHp: 11 },
];
const snap = ({ campaign, ...over } = {}) => ({
  campaign: { status: "active", floor: { mode: "open" }, ...campaign },
  dmStatus: "idle",
  sheets,
  messages: [
    { seq: 1, authorType: "player", userId: "u1", characterId: "s1", content: "I pry it open" },
    { seq: 2, authorType: "dm", content: "[roll:abc]\n\n[shouting] “Teddy, please!” The seam tears." },
  ],
  tableWait: { waitingOn: [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }], answered: [] },
  pendingRolls: [],
  ...over,
});
const bots = ["u1", "u2"];

test("the open floor's waiting seats that are bots come due", () => {
  assert.deepEqual(dueBots(snap(), bots), ["u1", "u2"]);
});

test("a bot that posted or passed since the GM spoke is not due again", () => {
  const posted = snap({ messages: [...snap().messages, { seq: 3, authorType: "player", userId: "u2", content: "hi" }] });
  assert.deepEqual(dueBots(posted, bots), ["u1"]);
  assert.deepEqual(dueBots(snap(), bots, { u1: 2 }), ["u2"]);
});

test("nobody is due while the GM writes, in the lobby, on a break or a hold", () => {
  assert.deepEqual(dueBots(snap({ dmStatus: "narrating" }), bots), []);
  assert.deepEqual(dueBots(snap({ campaign: { status: "lobby" } }), bots), []);
  assert.deepEqual(dueBots(snap({ tableBreak: { at: 1 } }), bots), []);
  assert.deepEqual(dueBots(snap({ campaign: { floor: { mode: "hold", next: { mode: "open" } } } }), bots), []);
});

test("a spotlight asks only its unanswered seats; initiative its turn", () => {
  const floor = { mode: "spotlight", userIds: ["u1", "u2"], respondedUserIds: ["u1"], prompt: "Anouk?" };
  assert.deepEqual(dueBots(snap({ campaign: { floor } }), bots), ["u2"]);
  assert.deepEqual(dueBots(snap({ campaign: { floor: { mode: "initiative", userIds: ["u1"] } } }), bots), ["u1"]);
});

test("rolls and truce questions are the bots' own", () => {
  const rolls = [{ id: "r1", userId: "u1" }, { id: "r2", userId: "u3" }];
  assert.deepEqual(botRolls(snap({ pendingRolls: rolls }), bots).map((r) => r.id), ["r1"]);
  const couchTruce = { id: "t", status: "open", members: [{ characterId: "s1", answer: "waiting" }, { characterId: "s2", answer: "accept" }] };
  assert.deepEqual(botTruceAnswers(snap({ couchTruce }), ["s1", "s2"]).map((q) => q.member.characterId), ["s1"]);
});

test("GM prose drops roll markers and voice cues", () => {
  assert.equal(gmText(snap().messages[1].content), "“Teddy, please!” The seam tears.");
});

test("the prompt carries the sheet, the secret agenda, the story and the direction", () => {
  const prompt = playerPrompt({ view: snap(), sheet: sheets[0], note: "be reckless" });
  for (const part of ["Teddy Malloy", "Hatchet x2", "Steal an egg", "Teddy Malloy: I pry it open", "GM: “Teddy, please!”", "be reckless", "Anouk Visser (medic)"]) {
    assert.ok(prompt.includes(part), `missing ${part}`);
  }
});

test("model answers and typed lines become moves", () => {
  assert.deepEqual(parseMove("SAY: Get behind me!"), { kind: "say", content: "Get behind me!" });
  assert.deepEqual(parseMove("**DO:** I cut the line\nextra"), { kind: "do", content: "I cut the line" });
  assert.deepEqual(parseMove("I run"), { kind: "do", content: "I run" });
  assert.equal(parseMove("  "), null);
  assert.deepEqual(typedMove("pass"), { kind: "pass", content: "" });
  assert.deepEqual(typedMove('"Run!"'), { kind: "say", content: "Run!" });
  assert.deepEqual(typedMove("say hold on"), { kind: "say", content: "hold on" });
  assert.deepEqual(typedMove("open the hatch"), { kind: "do", content: "open the hatch" });
});

test("a typed line names its seat by first name", () => {
  assert.equal(addressed("teddy: open it", sheets).sheet.id, "s1");
  assert.equal(addressed("Anouk Visser: hi", sheets).text, "hi");
  assert.equal(addressed("nobody: hi", sheets), null);
  assert.equal(addressed("no colon here", sheets), null);
});

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
