// AI crewmates, the pure half: how many the AI plays beside the players on
// phones (src/lib/couch/scenario-cards.ts crewSeats, fitAiCrew), which free
// cards it takes at Begin and how many people the lobby still waits on
// (src/lib/couch/ai-crew-logic.ts, src/components/couch/couch-logic.ts),
// and the crewmate's prompt (src/lib/couch/autoplay-logic.ts).
// Pure: no database, no server.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const { crewSeats, fitAiCrew } = await import("../src/lib/couch/scenario-cards.ts");
const { aiCrewCards, aiCrewStillToSeat, isAiCrewUserId, peopleStillNeeded, AI_CREW_USER_PREFIX } = await import("../src/lib/couch/ai-crew-logic.ts");
const { freeCardWords, normalizeRoster, peopleNeeded } = await import("../src/components/couch/couch-logic.ts");
const { playerPrompt } = await import("../src/lib/couch/autoplay-logic.ts");

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

const card = { players: { min: 2, max: 5, best: "3 to 5" } };

test("players and AI crewmates together fit the story's crew, with one person at least", () => {
  assert.equal(crewSeats(card, 1, 1), true);
  assert.equal(crewSeats(card, 1, 0), false, "one person alone is under the story's minimum");
  assert.equal(crewSeats(card, 3, 2), true);
  assert.equal(crewSeats(card, 3, 3), false, "past the crew's maximum");
  assert.equal(crewSeats(card, 0, 3), false, "the AI never plays a night alone");
});

test("the AI count fills a small room up to the story's minimum and never past its maximum", () => {
  assert.equal(fitAiCrew(card, 1, 0), 1);
  assert.equal(fitAiCrew(card, 3, 0), 0, "a room that fills the story gets no AI unasked");
  assert.equal(fitAiCrew(card, 3, 2), 2);
  assert.equal(fitAiCrew(card, 4, 2), 1, "more people push the AI out");
  assert.equal(fitAiCrew(card, 5, 3), 0);
});

test("the AI takes the free cards in the story's order, as many as it has crewmates", () => {
  const cards = [
    { id: "c", position: 2, claimedBy: null },
    { id: "a", position: 0, claimedBy: "u1" },
    { id: "b", position: 1, claimedBy: null },
    { id: "d", position: 3, claimedBy: null },
  ];
  assert.deepEqual(aiCrewCards(cards, 2).map((entry) => entry.id), ["b", "c"]);
  assert.deepEqual(aiCrewCards(cards, 0), []);
  assert.deepEqual(aiCrewCards(cards, -1), []);
});

test("an AI seat is known by its id, and counts down once seated", () => {
  assert.equal(isAiCrewUserId(`${AI_CREW_USER_PREFIX}123`), true);
  assert.equal(isAiCrewUserId("comp_123"), false, "a companion's owner is not an AI crewmate");
  assert.equal(isAiCrewUserId(null), false);
  assert.equal(aiCrewStillToSeat(2, 1), 1);
  assert.equal(aiCrewStillToSeat(1, 2), 0);
  assert.equal(peopleStillNeeded(3, 1), 2);
  assert.equal(peopleStillNeeded(1, 2), 0);
});

test("the lobby waits only on the people the AI does not stand in for", () => {
  const roster = normalizeRoster({
    status: "ready",
    aiCrew: 1,
    crew: [
      { id: "a", claimedBy: { userId: "u1", name: "alex" } },
      { id: "b", claimedBy: null },
      { id: "c", claimedBy: null },
    ],
  });
  assert.equal(roster.aiCrew, 1);
  assert.equal(peopleNeeded(roster), 1);
  assert.equal(freeCardWords(roster), "Free");
  const filled = normalizeRoster({ ...roster, crew: [...roster.crew.slice(0, 2).map((entry, index) => (index === 1 ? { ...entry, claimedBy: { userId: "u2", name: "sam" } } : entry)), roster.crew[2]] });
  assert.equal(peopleNeeded(filled), 0);
  assert.equal(freeCardWords(filled), "AI plays");
  assert.equal(normalizeRoster({ crew: [] }).aiCrew, 0, "a server without AI crew sends none");
  const seated = normalizeRoster({ crew: [{ id: "a", claimedBy: { userId: `${AI_CREW_USER_PREFIX}1`, name: "AI", ai: true } }] });
  assert.equal(seated.crew[0].claimedBy.ai, true);
});

test("a crewmate's prompt leaves the people in the room the spotlight; a test player's does not", () => {
  const sheet = { id: "s1", userId: "u1", name: "Teddy Malloy", crewRole: "engineer", currentHp: 9, maxHp: 9 };
  const view = { campaign: { status: "active" }, dmStatus: "idle", messages: [], sheets: [sheet] };
  const crewmate = playerPrompt({ view, sheet, crewmate: true });
  assert.match(crewmate, /AI crewmate/);
  assert.match(crewmate, /Leave them the big moments/);
  const tester = playerPrompt({ view, sheet });
  assert.doesNotMatch(tester, /AI crewmate|big moments/);
});

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
