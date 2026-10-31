// Couch mode's screens, the pure half (src/components/couch/couch-logic.ts):
// which seat gets the TV and which a phone, the voice's stage directions kept
// off the screen, the TV's subtitle pages, the address a phone in the room
// can open, the hidden agenda's mask and the forge's crew read defensively.
// Pure: no database, no server.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const {
  couchSeatView,
  stripAudioTags,
  couchPassage,
  couchParagraphs,
  storyBeats,
  latestNarration,
  tvPictures,
  subtitlePages,
  previousSubtitlePages,
  subtitlePageMs,
  voicedSubtitlePage,
  maskSecret,
  actNumeral,
  healthView,
  pickJoinOrigin,
  joinLink,
  normalizeRoster,
  unclaimedCount,
  introRunning,
  introducedCard,
  couchHaltedTurn,
  gmAtWork,
  gmStatusWords,
} = await import("../src/components/couch/couch-logic.ts");
const { checkSuccess } = await import("../src/lib/couch/check-logic.ts");
const { crewIntroduction, briefingIntroduction, introTexts, introReadMs, introTotal, introDone, splitFlaw, forgedMember } = await import(
  "../src/lib/couch/intro-logic.ts"
);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
}

test("a campaign outside couch mode keeps its ordinary screens for everyone", () => {
  for (const isLead of [true, false]) {
    for (const status of ["lobby", "active", "ended"]) {
      assert.equal(couchSeatView({ couchMode: false, isLead, hostParam: false, status }), "normal");
    }
  }
});

test("in couch mode the lead is the TV, unless they ask for the host screens", () => {
  assert.equal(couchSeatView({ couchMode: true, isLead: true, hostParam: false, status: "lobby" }), "tv");
  assert.equal(couchSeatView({ couchMode: true, isLead: true, hostParam: false, status: "active" }), "tv");
  assert.equal(couchSeatView({ couchMode: true, isLead: true, hostParam: true, status: "active" }), "normal");
});

test("in couch mode every other member holds a phone, with its own lobby", () => {
  assert.equal(couchSeatView({ couchMode: true, isLead: false, hostParam: false, status: "lobby" }), "phone-lobby");
  assert.equal(couchSeatView({ couchMode: true, isLead: false, hostParam: false, status: "active" }), "phone-play");
  assert.equal(couchSeatView({ couchMode: true, isLead: false, hostParam: false, status: "ended" }), "phone-play");
  // ?host=1 is the lead's way back, not a player's way into the host screens.
  assert.equal(couchSeatView({ couchMode: true, isLead: false, hostParam: true, status: "active" }), "phone-play");
});

test("voice tags never reach the screen, and leave no gaps behind", () => {
  assert.equal(stripAudioTags("[whispers] Get down."), "Get down.");
  assert.equal(stripAudioTags('She says, "[whispers] Get down."'), 'She says, "Get down."');
  assert.equal(stripAudioTags("The vent rattles [breathing heavily] and stops."), "The vent rattles and stops.");
  assert.equal(stripAudioTags("Nothing moves [long pause]. Then it does."), "Nothing moves. Then it does.");
  assert.equal(stripAudioTags("He laughs [laughs, nervously], once."), "He laughs, once.");
  assert.equal(stripAudioTags("It's gone [screams]"), "It's gone");
  // A tag written in another language is still a tag.
  assert.equal(stripAudioTags("[flüstert] Runter."), "Runter.");
});

test("brackets that are not voice tags stay", () => {
  assert.equal(stripAudioTags("Deck [B] is sealed."), "Deck [B] is sealed.");
  assert.equal(stripAudioTags("Code [4471] accepted."), "Code [4471] accepted.");
  assert.equal(stripAudioTags("[a]"), "[a]");
  // Longer than any delivery note: prose in brackets, not a tag.
  const long = "[the lights flicker for a long moment and then go out entirely]";
  assert.equal(stripAudioTags(long), long);
});

test("a passage loses its dice markers and tags but keeps its paragraphs and emphasis", () => {
  const content =
    "[whispers] The airlock *hisses*. [roll:0b9f4c1e-2d3a-4b5c-8d7e-1f2a3b4c5d6e]\n\nKara's light finds the **blood**.";
  assert.equal(couchPassage(content), "The airlock *hisses*.\n\nKara's light finds the **blood**.");
  assert.deepEqual(couchParagraphs(content), ["The airlock *hisses*.", "Kara's light finds the **blood**."]);
});

const message = (id, authorType, content, extra = {}) => ({
  id,
  authorType,
  content,
  characterId: null,
  userId: null,
  generatedImage: undefined,
  ...extra,
});

test("the TV keeps the last two subtitle pages across narration turns without showing future words", () => {
  const messages = [
    message("old", "dm", "The lights go out.\n\nA hatch opens."),
    message("player", "player", "I follow."),
    message("ooc", "dm", "(ooc) Private rules discussion."),
    message("system", "system", "A player joined."),
    message("now", "dm", "[whispers] Footsteps.\n\nSomeone is here.\n\nWho goes there?"),
    message("future", "dm", "This has not been read yet."),
  ];
  assert.deepEqual(previousSubtitlePages(messages, "now", 0).map((entry) => entry.content), ["The lights go out.", "A hatch opens."]);
  assert.deepEqual(previousSubtitlePages(messages, "now", 1).map((entry) => entry.content), ["A hatch opens.", "Footsteps."]);
  assert.deepEqual(previousSubtitlePages(messages, "now", 2).map((entry) => entry.content), ["Footsteps.", "Someone is here."]);
  assert.deepEqual(previousSubtitlePages(messages, "now", 100).map((entry) => entry.content), ["Footsteps.", "Someone is here."]);
  assert.deepEqual(previousSubtitlePages(messages, "old", 0), []);
  assert.deepEqual(previousSubtitlePages(messages, "missing", 1), []);
  assert.deepEqual(previousSubtitlePages(messages, "player", 1), []);
  assert.deepEqual(previousSubtitlePages([], "now", 0), []);
});

test("the phone keeps the newest passage open and folds what came before", () => {
  const messages = [
    message("m1", "dm", "The ship wakes."),
    message("m2", "player", "I check the logs.", { userId: "u1", characterId: "c1" }),
    message("m3", "system", "Kara joined the table."),
    message("m4", "player", "(ooc) brb"),
    message("m5", "dm", "The logs are wiped.", { generatedImage: { url: "/uploads/scene.webp" } }),
    message("m6", "player", "I swear quietly.", { userId: "u2", characterId: "c2" }),
  ];
  const beats = storyBeats(messages);
  assert.equal(beats.latest?.id, "m5");
  assert.equal(beats.latest?.imageUrl, "/uploads/scene.webp");
  assert.equal(beats.latest?.imageInsert, false);
  const found = storyBeats([message("m1", "dm", "Behind the panel, a collar.", { generatedImage: { url: "/collar.webp", shot: { kind: "insert", frame: "a collar" } } })]);
  assert.equal(found.latest?.imageInsert, true, "a find is shown square on the phone, not cut to 16:9");
  assert.deepEqual(beats.earlier.map((entry) => entry.id), ["m1", "m2"]);
  assert.deepEqual(beats.after.map((entry) => entry.id), ["m6"]);
  assert.equal(storyBeats(messages, 1).earlier.length, 1);
});

test("a phone sees only its own move until the GM answers the round", () => {
  const messages = [
    message("m1", "player", "I look around.", { userId: "u1" }),
    message("m2", "dm", "The galley is warm."),
    message("m3", "player", "I pour coffee.", { userId: "u1" }),
    message("m4", "player", "I check the hauler.", { userId: "u2" }),
  ];
  assert.deepEqual(storyBeats(messages, 8, "u1").after.map((entry) => entry.id), ["m3"]);
  assert.deepEqual(storyBeats(messages, 8, "u3").after, [], "a player who has not moved sees nobody's");
  const answered = storyBeats([...messages, message("m5", "dm", "Coffee, and the hauler hums.")], 8, "u1");
  assert.deepEqual(answered.earlier.map((entry) => entry.id), ["m1", "m2", "m3", "m4"], "once answered, every move shows");
});

test("before the GM has spoken, what the players said is all there is", () => {
  const beats = storyBeats([message("m1", "player", "Hello?", { userId: "u1" })]);
  assert.equal(beats.latest, null);
  assert.deepEqual(beats.after.map((entry) => entry.id), ["m1"]);
});

test("the TV's narration is the newest GM passage with words in it", () => {
  const messages = [
    message("m1", "dm", "First."),
    message("m2", "dm", "(ooc) A ruling, out of character."),
    message("m3", "dm", "[sighs] [roll:0b9f4c1e-2d3a-4b5c-8d7e-1f2a3b4c5d6e]"),
  ];
  assert.equal(latestNarration(messages)?.id, "m1");
  assert.equal(latestNarration([]), null);
});

test("the newest picture stays until the next one lands, and a find stands beside the place", () => {
  const place = (url, kind = "wide") => ({ generatedImage: { url, shot: { kind, frame: url } } });
  assert.deepEqual(tvPictures([{ generatedImage: { url: "/a.webp" } }, { generatedImage: undefined }]), { scene: "/a.webp", insert: null });
  assert.deepEqual(tvPictures([]), { scene: null, insert: null });
  assert.deepEqual(
    tvPictures([place("/hatch.webp", "medium"), { generatedImage: undefined }, place("/collar.webp", "insert")]),
    { scene: "/hatch.webp", insert: "/collar.webp" },
    "the hatch stays up beside the collar found there",
  );
  assert.deepEqual(
    tvPictures([place("/hatch.webp"), place("/collar.webp", "insert"), place("/marks.webp", "insert")]),
    { scene: "/hatch.webp", insert: "/marks.webp" },
    "a newer find takes the old one's place, not the hatch's",
  );
  assert.deepEqual(
    tvPictures([place("/hatch.webp"), place("/collar.webp", "insert"), place("/spine.webp", "close")]),
    { scene: "/spine.webp", insert: null },
    "the next picture of a place retires the find",
  );
  assert.deepEqual(tvPictures([place("/collar.webp", "insert")]), { scene: null, insert: "/collar.webp" }, "the cover stands in for the place");
});

test("back in a place the crew has seen, its establishing shot goes straight back up", () => {
  const at = (url, placeId, kind = "medium") => ({ generatedImage: { url, shot: { kind, frame: url, placeId } } });
  const spine = { url: "/spine-wide.webp", seen: "A ribbed corridor.", placeId: "spine" };
  assert.deepEqual(
    tvPictures([at("/hatch.webp", "hatch"), at("/collar.webp", "hatch", "insert")], spine),
    { scene: "/spine-wide.webp", insert: null },
    "the hatch they left and its find give way to the spine they came back to",
  );
  assert.deepEqual(
    tvPictures([at("/spine-wide.webp", "spine", "wide"), at("/kara.webp", "spine")], spine),
    { scene: "/kara.webp", insert: null },
    "a picture of the place they are in stays",
  );
  assert.deepEqual(tvPictures([at("/hatch.webp", "hatch")], null), { scene: "/hatch.webp", insert: null }, "a place with no picture yet keeps the last one up");
});

test("subtitles gather whole sentences, start each paragraph fresh and break a long sentence between words", () => {
  const pages = subtitlePages("One. Two. Three.\n\nFour.", 10);
  assert.deepEqual(pages, ["One. Two.", "Three.", "Four."]);
  const long = subtitlePages("alpha beta gamma delta epsilon", 12);
  assert.deepEqual(long, ["alpha beta", "gamma delta", "epsilon"]);
  for (const page of subtitlePages("A ".repeat(400), 170)) {
    assert.ok(page.length <= 170);
  }
  // Markdown and voice tags are not read off a TV.
  assert.deepEqual(subtitlePages("[whispers] *Run.*"), ["Run."]);
  // Beside a map, one sentence at a time.
  assert.deepEqual(subtitlePages("One. Two. Three.\n\nFour.", 170, true), ["One.", "Two.", "Three.", "Four."]);
});

test("a page read silently stays up at a reading pace, within bounds", () => {
  assert.equal(subtitlePageMs("x".repeat(170)), 11200);
  assert.equal(subtitlePageMs("Hi."), 3500);
  assert.equal(subtitlePageMs("x".repeat(1000)), 16000);
});

test("a page read aloud turns where the voice reaches it, not ahead of a slow narrator", () => {
  const pages = ["x".repeat(100), "x".repeat(50), "x".repeat(50)];
  // A finished 40-second file: each page holds its share of the clip.
  assert.equal(voicedSubtitlePage(pages, 0, 40), 0);
  assert.equal(voicedSubtitlePage(pages, 19.9, 40), 0);
  assert.equal(voicedSubtitlePage(pages, 20, 40), 1);
  assert.equal(voicedSubtitlePage(pages, 30, 40), 2);
  assert.equal(voicedSubtitlePage(pages, 40, 40), 2);
  // A live stream of unknown length: an ordinary narrator's pace.
  assert.equal(voicedSubtitlePage(pages, 7, Number.POSITIVE_INFINITY), 0);
  assert.equal(voicedSubtitlePage(pages, 8, Number.NaN), 1);
  assert.equal(voicedSubtitlePage(pages, 999, Number.POSITIVE_INFINITY), 2);
  assert.equal(voicedSubtitlePage([], 5, 10), 0);
});

test("a hidden agenda keeps its shape and none of its letters", () => {
  const secret = "Bring back a sample. Nobody else survives.";
  const mask = maskSecret(secret);
  assert.equal(mask.length, secret.length);
  assert.deepEqual([...mask].map((char) => char === " "), [...secret].map((char) => char === " "));
  assert.equal(/[BNy]/.test(mask), false);
  assert.equal(actNumeral(0), "I");
  assert.equal(actNumeral(2), "III");
});

test("health reads as a share of the most there is, and says when it is low", () => {
  assert.deepEqual(healthView(14, 14), { pct: 100, tone: "ok" });
  assert.deepEqual(healthView(4, 14), { pct: 29, tone: "hurt" });
  assert.deepEqual(healthView(0, 14), { pct: 0, tone: "down" });
  assert.deepEqual(healthView(5, 0), { pct: 100, tone: "ok" });
});

test("the TV's QR uses the public address even when the TV is on Wi-Fi or localhost", () => {
  for (const pageOrigin of ["http://192.168.1.20:3005", "http://localhost:3005"]) {
    const origin = pickJoinOrigin({ pageOrigin, lanUrls: ["http://10.0.0.5:3005"], publicUrl: " https://table.example.com/ " });
    assert.equal(joinLink(origin, " ABCD12 "), "https://table.example.com/join/ABCD12");
  }
});

test("without a public address the TV's QR falls back to the room's network", () => {
  assert.equal(
    pickJoinOrigin({ pageOrigin: "http://192.168.1.20:3005", lanUrls: ["http://10.0.0.5:3005"], publicUrl: "" }),
    "http://192.168.1.20:3005",
  );
  assert.equal(
    pickJoinOrigin({ pageOrigin: "http://localhost:3005", lanUrls: ["http://203.0.113.4:3005", "http://192.168.1.20:3005/"], publicUrl: "  " }),
    "http://192.168.1.20:3005",
  );
  assert.equal(pickJoinOrigin({ pageOrigin: "http://localhost:3005", lanUrls: [], publicUrl: "https://table.example.com/" }), "https://table.example.com");
  assert.equal(pickJoinOrigin({ pageOrigin: "http://localhost:3005", lanUrls: [], publicUrl: "" }), "http://localhost:3005");
  assert.equal(joinLink("http://192.168.1.20:3005", " ABCD12 "), "http://192.168.1.20:3005/join/ABCD12");
  assert.equal(joinLink("", "ABCD12"), "");
});

test("the forge's crew is read defensively", () => {
  const roster = normalizeRoster({
    status: "ready",
    scenario: { title: "Cold Storage", logline: "Something is in the hold." },
    crew: [
      { id: "c1", name: "Kara", crewRole: "Medic", backstory: "", portraitUrl: null, claimedBy: { userId: "u1", name: "Sam" } },
      { id: "c2", name: "Brakk", crewRole: "Marine" },
      { name: "No id, no card" },
    ],
  });
  assert.equal(roster.status, "ready");
  assert.equal(roster.scenario?.briefing, "");
  assert.equal(roster.crew.length, 2);
  assert.deepEqual(roster.crew[0].claimedBy, { userId: "u1", name: "Sam" });
  assert.equal(roster.crew[1].claimedBy, null);
  assert.equal(unclaimedCount(roster), 1);
  assert.equal(unclaimedCount(null), 0);
  const empty = normalizeRoster(null);
  assert.equal(empty.status, "forging");
  assert.deepEqual(empty.crew, []);
  assert.equal(normalizeRoster({ status: "nonsense" }).status, "forging");
  // A server from before the introductions sends none: nothing to wait for.
  assert.deepEqual(roster.intro, { step: 0, total: 0, key: "" });
  assert.equal(introRunning(roster), false);
  assert.deepEqual(roster.crew[1].ties, []);
});

test("the TV's introductions: the briefing, then each crew card, and the phones wait until the end", () => {
  const raw = {
    status: "ready",
    intro: { step: 2, total: 3, key: "abc" },
    crew: [
      { id: "c1", name: "Kara", ties: [{ to: "Brakk", line: "owes him her life" }, { to: "" }, "nonsense"] },
      { id: "c2", name: "Brakk", personality: "Loud; flaw: drinks", signatureItem: "A torque wrench" },
    ],
  };
  const roster = normalizeRoster(raw);
  assert.deepEqual(roster.crew[0].ties, [{ to: "Brakk", line: "owes him her life" }]);
  assert.equal(roster.crew[1].signatureItem, "A torque wrench");
  assert.equal(introRunning(roster), true);
  assert.equal(introducedCard(roster)?.id, "c2", "step 2 is the second crew card");
  assert.equal(introducedCard(normalizeRoster({ ...raw, intro: { step: 0, total: 3 } })), null, "the briefing introduces nobody");
  const done = normalizeRoster({ ...raw, intro: { step: 7, total: 3 } });
  assert.equal(done.intro.step, 3, "never past the end");
  assert.equal(introRunning(done), false);
  assert.equal(introRunning(normalizeRoster({ ...raw, status: "forging" })), false);
  assert.equal(introTotal(3), 4);
  assert.equal(introTotal(0), 0);
  assert.equal(introDone(4, 4), true);
  assert.equal(introDone(3, 4), false);
});

test("a crew member is introduced aloud from their public card, never their secrets", () => {
  const roz = {
    name: "Roz Achterberg",
    crewRole: "First mate and acting captain of the tug Mule Seven",
    backstory: "Twenty years on hauling tugs. The Mule Seven is mortgaged to the hilt.",
    personality: "Dry, competent, quietly motherly; flaw: money worries she never mentions.",
    signatureItem: "A tin of hard peppermints",
    gender: "Female",
  };
  assert.equal(
    crewIntroduction(roz),
    "Roz Achterberg, first mate and acting captain of the tug Mule Seven. Twenty years on hauling tugs. The Mule Seven is mortgaged to the hilt. " +
      "Dry, competent, quietly motherly. Her flaw: money worries she never mentions. She carries a tin of hard peppermints.",
  );
  // They carry; a name of its own keeps its capital; no flaw, no role.
  assert.equal(
    crewIntroduction({ name: "Lio", crewRole: "", backstory: "Along for the audit", personality: "Quiet", signatureItem: "Grandfather's compass", gender: "Nonbinary" }),
    "Lio. Along for the audit. Quiet. They carry Grandfather's compass.",
  );
  assert.deepEqual(splitFlaw("Dry, loyal; FLAW: never admits fear."), { traits: "Dry, loyal", flaw: "never admits fear" });
  assert.deepEqual(splitFlaw("Calm."), { traits: "Calm", flaw: "" });
  assert.equal(briefingIntroduction("Cold Storage", "Day nineteen adrift."), "Cold Storage.\n\nDay nineteen adrift.\n\nThis is your crew.");
  const texts = introTexts({ title: "Cold Storage", briefing: "Day nineteen adrift." }, [roz]);
  assert.equal(texts.length, 2);
  assert.equal(introTexts({ title: "x", briefing: "y" }, []).length, 0, "no crew, no introductions");
  assert.equal(introReadMs("word"), 6000, "a short step still stays up long enough to look at");
  assert.ok(introReadMs(texts[1]) > 10_000);
  // A card finds its forge entry by its place, checked by name.
  const crew = [{ name: "A" }, { name: "B" }];
  assert.equal(forgedMember(crew, { position: 1, name: "B" })?.name, "B");
  assert.equal(forgedMember(crew, { position: 0, name: "B" })?.name, "B", "a moved card is found by name");
  assert.equal(forgedMember(crew, { position: 0, name: "C" }), null);
});

test("a crashed GM turn shows until the story moves on or the retry is claimed", () => {
  const passage = { id: "m1", authorType: "dm", content: "The coupling waits beneath the blinking timer." };
  const answer = { id: "m2", authorType: "player", content: "Do that" };
  const halt = { id: "m3", authorType: "system", content: "The GM ran into a problem: the turn stopped answering.", dmTurnId: "t1" };
  const again = { id: "m4", authorType: "player", content: "Try again" };
  assert.deepEqual(couchHaltedTurn([passage, answer, halt, again]), { id: "m3", turnId: "t1", reason: "The turn stopped answering." });
  // The notice in the older wording is read the same way.
  assert.equal(couchHaltedTurn([{ ...halt, content: "The DM ran into a problem: boom" }])?.reason, "Boom");
  // A retry claimed takes the turn id; a passage after the notice answers it.
  assert.equal(couchHaltedTurn([passage, answer, { ...halt, dmTurnId: undefined }]), null);
  assert.equal(couchHaltedTurn([halt, again, { ...passage, id: "m5" }]), null);
  // Other system lines are passed over; with no notice there is nothing.
  assert.equal(couchHaltedTurn([halt, { id: "m6", authorType: "system", content: "Renn joins the crew." }])?.id, "m3");
  assert.equal(couchHaltedTurn([passage, answer]), null);
});

test("the screens wait on the GM while it answers, not while the table owes it a roll", () => {
  for (const status of ["thinking", "narrating", "rolling"]) assert.equal(gmAtWork(status), true, status);
  for (const status of ["idle", "awaiting_rolls", "writing_chapter", "plotting_arc"]) assert.equal(gmAtWork(status), false, status);
  assert.equal(gmStatusWords("thinking"), "The GM is thinking");
  assert.equal(gmStatusWords("narrating"), "The GM is thinking");
});

test("a natural 20 passes a couch long shot, and no other check", () => {
  const couch = { couchMode: true };
  const nat20 = { total: 25, crit: "nat20" };
  // DC 30 with +5: only the long-shot rule can pass it.
  assert.equal(checkSuccess(couch, "skill_check", 30, nat20), true);
  assert.equal(checkSuccess(couch, "ability_check", 25, { total: 22, crit: "nat20" }), true);
  assert.equal(checkSuccess(couch, "saving_throw", 30, nat20), true);
  assert.equal(checkSuccess(couch, "skill_check", 30, { total: 24, crit: undefined }), false);
  // Ordinary checks go by the total alone.
  assert.equal(checkSuccess(couch, "skill_check", 20, { total: 19, crit: "nat20" }), false);
  assert.equal(checkSuccess(couch, "skill_check", 15, { total: 15, crit: "nat1" }), true);
  // A lenient table's very_hard (DC 23) is still a long shot; a harsh table's hard (DC 22) is not.
  assert.equal(checkSuccess({ couchMode: true, gm: { strictness: "lenient" } }, "skill_check", 23, { total: 22, crit: "nat20" }), true);
  assert.equal(checkSuccess({ couchMode: true, gm: { strictness: "harsh" } }, "skill_check", 22, { total: 21, crit: "nat20" }), false);
  // Not attacks, not other tables, and nothing to decide without a DC.
  assert.equal(checkSuccess(couch, "attack", 30, nat20), false);
  assert.equal(checkSuccess({ couchMode: false }, "skill_check", 30, nat20), false);
  assert.equal(checkSuccess(couch, "skill_check", null, nat20), undefined);
});

console.log(`${passed} couch logic tests passed`);
