// A fight on a couch night (docs/couch-mode-spec.md 2.11):
//
//   a crew member's turn in a fight is the one thing they said: once the GM
//   rules on it (here their attack, thrown from their phone) the turn ends,
//   though the narration asks what they do next, and the creature and the
//   next crew member follow. Before this the thrown attack left the turn
//   with them, the creature never acted, and their next attack was refused
//   as a second one ("The Pressure Below", 2026-10-30). An ordinary table
//   still waits for its End Turn;
//   the act does not turn while a fight is on;
//   the TV and phone read the fight from the player-safe encounter: the
//   order with whose move it is, each creature's health in words and pips
//   and which of its three pictures fits, the crew member up next, and the
//   card that closes the fight;
//   the creature's pictures are asked for as one original beast, the hurt
//   and down ones as the same creature as the whole one;
//   words alone (a plea, an offer of peace) spend a crew member's turn, and a
//   truce offered on it is answered by the other crew on their phones: all
//   accept and the fight ends, one "fight on" and it goes on. Before, the GM
//   asked the room "do you accept the truce?" and the offer kept the floor
//   until its player typed "Skip" (Rime Station, 2026-10-30).
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";
import { combatKit, TRAINED } from "./lib/enforce-combat.mjs";
import { call, fakeModel, reply, settleQueue } from "./lib/enforce-narrator.mjs";
import { call as callRoute } from "./lib/enforce-campaign.mjs";

const { test, finish } = suite("test-couch-fight");

const { couchFight, fightArtKey, fightArtStage, fightOpponents, fightOver, fightTurnWords } = await import("../src/lib/couch/fight-logic.ts");
const { crewNameKeys, crossingSide } = await import("../src/lib/couch/crew-fight-logic.ts");
const { creatureLook, fightArtPrompt, FIGHT_LOOK_CHARS, knownFoe } = await import("../src/lib/couch/fight-art-logic.ts");
const { couchTurn } = await import("../src/components/couch/phone-logic.ts");
const { cropFightMap, distancesFromMe, distanceWords, feetBetween, fightAct, fightSteps, heldSquares, inReach, missingCrew, moveRange, queueBeats, stepWords } = await import("../src/lib/couch/fight-map-logic.ts");
const { parkedAttackOutcome } = await import("../src/lib/couch/roll-feedback-logic.ts");
const { CouchTvFightHud, CouchTvFightOrder, CouchPhoneFight } = await import("../src/components/couch/CouchTvFight.tsx");
const { answerTruce, couchTruceCall, couchTruceResult, truceAsks } = await import("../src/lib/couch/truce-logic.ts");
const { CouchPhoneTruce, CouchTvTruce } = await import("../src/components/couch/CouchTruce.tsx");

// ---- the fight, read from the player-safe encounter ----

const encounter = (patch = {}) => ({
  id: "enc-1",
  status: "active",
  round: 2,
  turnIndex: 0,
  orderReady: true,
  order: [
    { kind: "pc", id: "kara", name: "Kara Voss", hidden: false },
    { kind: "enemy", id: "e1", name: "Hunter 1", hidden: false },
    { kind: "enemy", id: "e2", name: "Hunter 2", hidden: false },
    { kind: "pc", id: "brakk", name: "Brakk Oduya", hidden: false },
  ],
  enemies: [
    { id: "e1", name: "Hunter 1", health: "bloodied", status: "alive", cr: 1, type: "beast", hidden: false, groupKey: "custom", conditions: ["prone"], conditionRounds: {} },
    { id: "e2", name: "Hunter 2", health: "dead", status: "dead", cr: 1, type: "beast", hidden: false, groupKey: "custom", conditions: [], conditionRounds: {} },
  ],
  acting: { id: "kara", name: "Kara Voss" },
  ...patch,
});

await test("the fight reads whose move it is, who follows, and each creature's health in words, never numbers", () => {
  const fight = couchFight(encounter());
  assert.equal(fight.round, 2);
  assert.deepEqual(fight.turn, { kind: "crew", characterId: "kara", name: "Kara Voss", side: "party" });
  assert.deepEqual(fight.upNext, { characterId: "brakk", name: "Brakk Oduya" });
  assert.deepEqual(fight.order.map((seat) => [seat.name, seat.current, seat.out]), [
    ["Kara Voss", true, false],
    ["Hunter 1", false, false],
    ["Hunter 2", false, true],
    ["Brakk Oduya", false, false],
  ]);
  const [hunter, fallen] = fight.enemies;
  assert.deepEqual([hunter.words, hunter.pips, hunter.stage, hunter.tone], ["Bloodied", 2, "hurt", "bloodied"]);
  assert.deepEqual([fallen.words, fallen.pips, fallen.stage], ["Down", 0, "down"]);
  assert.equal(hunter.artKey, fallen.artKey, "a pack of the same creature shares its pictures");
  assert.equal(couchFight(null), null);
  assert.equal(couchFight(encounter({ status: "ended" })), null);
  assert.equal(couchFight(encounter({ enemies: [] })), null, "a scene with nobody to fight is no fight");
});

await test("the creatures' turn names them and the crew member it hands on to", () => {
  const fight = couchFight(encounter({ enemyTurns: true, acting: { id: "", name: "the enemy" }, enemiesUp: ["e1"], upNext: { id: "brakk", name: "Brakk Oduya" } }));
  assert.deepEqual(fight.turn, { kind: "enemy", names: ["Hunter 1"] });
  assert.equal(fight.enemies[0].acting, true);
  assert.equal(fight.order.find((seat) => seat.id === "e1").current, true);
  assert.equal(fight.order.find((seat) => seat.id === "kara").current, false);
  assert.deepEqual(fight.upNext, { characterId: "brakk", name: "Brakk Oduya" });
  assert.equal(couchFight(encounter({ orderReady: false, order: [] })).rolling, true);
});

await test("a creature's picture follows how it is doing, and a numbered pack is one creature", () => {
  assert.equal(fightArtStage({ health: "healthy", status: "alive" }), "whole");
  assert.equal(fightArtStage({ health: "wounded", status: "alive" }), "whole");
  assert.equal(fightArtStage({ health: "near death", status: "alive" }), "hurt");
  assert.equal(fightArtStage({ health: "bloodied", status: "alive", knockedOut: true }), "down");
  assert.equal(fightArtStage({ health: "healthy", status: "fled" }), "whole");
  assert.equal(fightArtKey("Hunter 2"), fightArtKey("hunter"));
  assert.notEqual(fightArtKey("Hunter"), fightArtKey("Bellwurm"));
});

await test("a phone says whose move it is, and tells the next crew member they are up next", () => {
  const fight = couchFight(encounter());
  assert.deepEqual(fightTurnWords(fight, new Set(["kara"])), { mine: true, headline: "Your move in the fight", prompt: "One action: strike, shoot, run, hide, help someone, or offer a truce. Say it." });
  assert.deepEqual(fightTurnWords(fight, new Set(["brakk"])), { mine: false, headline: "Kara Voss's move in the fight", prompt: "You're up next." });
  const theirs = couchFight(encounter({ enemyTurns: true, acting: { id: "", name: "the enemy" }, enemiesUp: ["e1"], upNext: { id: "brakk", name: "Brakk Oduya" } }));
  assert.equal(fightTurnWords(theirs, new Set(["kara"])).headline, "Hunter 1 moves…");
  const floor = { mode: "initiative", encounterId: "enc-1", userIds: ["u-kara"], currentName: "Kara Voss", round: 2 };
  const base = { ended: false, muted: false, myRolls: 0, dmStatus: "idle", floor, names: {}, waitingOn: [], fight };
  assert.equal(couchTurn({ ...base, meUserId: "u-kara", myCharacterIds: new Set(["kara"]) }).tone, "yours");
  const waiting = couchTurn({ ...base, meUserId: "u-brakk", myCharacterIds: new Set(["brakk"]) });
  assert.deepEqual([waiting.tone, waiting.headline, waiting.prompt], ["waiting", "Kara Voss's move in the fight", "You're up next."]);
  // A roll owed still comes first.
  assert.equal(couchTurn({ ...base, meUserId: "u-brakk", myRolls: 1 }).tone, "yours");
});

await test("the card that closes a fight says how it ended and what each crew member dealt and took", () => {
  const over = fightOver(
    {
      outcome: "victory",
      rounds: 3,
      seconds: 200,
      kills: 2,
      fled: 0,
      fighters: [
        { characterId: "kara", name: "Kara Voss", dealt: 14, taken: 6, healed: 0, nat20s: 1, nat1s: 0 },
        { characterId: "npc", name: "Turned guard", dealt: 3, taken: 0, healed: 0, nat20s: 0, nat1s: 0 },
      ],
      totals: { dealt: 17, taken: 6, healed: 0, nat20s: 1, nat1s: 0 },
    },
    new Set(["kara"]),
  );
  assert.equal(over.title, "The crew wins");
  assert.equal(over.rounds, 3);
  assert.deepEqual(over.crew, [{ characterId: "kara", name: "Kara Voss", dealt: 14, taken: 6, crits: 1 }]);
});

await test("a phone says how far each creature stands from its own character, from its own board only", () => {
  const tokens = [
    { kind: "pc", refId: "kara", x: 4, y: 4 },
    { kind: "pc", refId: "brakk", x: 9, y: 4 },
    { kind: "enemy", refId: "e1", x: 5, y: 5 },
    { kind: "enemy", refId: "e2", x: 10, y: 1 },
  ];
  const far = distancesFromMe(tokens, new Set(["kara"]));
  assert.equal(far.get("e1"), 5);
  assert.equal(far.get("e2"), 30);
  assert.equal(far.get("brakk"), 25);
  assert.equal(far.has("kara"), false);
  assert.equal(distanceWords(5), "Next to you");
  assert.equal(distanceWords(30), "30 ft");
  // A player whose character has no square on their board gets no numbers.
  assert.equal(distancesFromMe(tokens, new Set(["nobody"])).size, 0);
});

await test("the TV's grid crops the board to the fight, measures as the engine does, and reads what happened", () => {
  // A 20 by 12 room walled round, a pillar at (6,4).
  const rows = Array.from({ length: 12 }, (_, y) => Array.from({ length: 20 }, (_, x) => (x === 0 || y === 0 || x === 19 || y === 11 ? "#" : x === 6 && y === 4 ? "#" : y === 5 && x === 6 ? "," : ".")).join(""));
  const board = { id: "m", width: 20, height: 12, terrain: rows.join("") };
  const kit = { id: "t-kit", kind: "pc", refId: "kit", name: "Kit Navarro", x: 4, y: 5, down: false };
  const hunter = { id: "t-h", kind: "enemy", refId: "h1", name: "Hunter 1", x: 8, y: 5, down: false };
  const map = cropFightMap(board, [kit, hunter]);
  // Every fighter with room round them, wider than tall, inside the board.
  assert.ok(map.x <= 2 && map.x + map.width >= 11 && map.y <= 3 && map.y + map.height >= 8);
  assert.ok(map.width >= map.height * 1.5 && map.x >= 0 && map.x + map.width <= 20 && map.y + map.height <= 12);
  assert.equal(map.terrain.length, map.width * map.height);
  assert.equal(map.terrain[(4 - map.y) * map.width + (6 - map.x)], "#", "the crop keeps the pillar where it stands");
  assert.equal(cropFightMap(board, []), null);
  // A grid read before initiative holds the creature alone: the crew the
  // order names are missing from it, so the TV asks for it again.
  assert.deepEqual(missingCrew(cropFightMap(board, [hunter]), ["kit"]), ["kit"]);
  assert.deepEqual(missingCrew(map, ["kit"]), []);
  // Every diagonal counts one square, as the engine's own reach does.
  assert.equal(feetBetween(kit, hunter), 20);
  assert.equal(feetBetween({ x: 0, y: 0 }, { x: 3, y: 2 }), 15);
  assert.ok(inReach({ x: 4, y: 4 }, { x: 5, y: 5 }) && !inReach(kit, hunter));
  // Thirty feet is six squares; the pillar stops a walker, the enemy's own
  // square is never one, and rough ground costs double.
  const range = moveRange(map, kit, 30, [hunter]);
  assert.ok(range.has("10,5") === true && !range.has("11,5"), "six squares east");
  assert.ok(!range.has("6,4"), "not into the pillar");
  assert.ok(!range.has("8,5"), "not onto the enemy");
  assert.ok(!range.has("4,5"), "not where they stand");
  assert.ok(!moveRange(map, kit, 5).has("6,5") && moveRange(map, kit, 5).has("5,5"), "the rough square costs two");
  // A move since the last board: a walk within the walker's speed, a run past it.
  const before = new Map([["t-kit", { x: 4, y: 5 }], ["t-h", { x: 8, y: 5 }]]);
  const steps = fightSteps(before, [{ ...kit, x: 13, y: 5 }, hunter], (token) => (token.kind === "pc" ? 30 : null));
  assert.deepEqual(steps.map((step) => [step.id, step.feet, step.ran]), [["t-kit", 45, true]]);
  assert.equal(stepWords(steps[0]), "Runs 45 ft");
  assert.equal(stepWords({ feet: 15, ran: false }), "Moves 15 ft");
  assert.deepEqual(fightSteps(before, [hunter]), [], "nobody moved");
  // One thing at a time, in the order it happened: a walk that reached the
  // TV after the swing it came before goes back in front of it, and its
  // figure stays where it set out until its beat.
  const swing = { key: "fx:1", at: 2000, ms: 1500, items: [{ kind: "lunge", tokenId: "t-kit" }] };
  const walk = { key: "walk", at: 1500, ms: 1100, items: [{ kind: "trail", tokenId: "t-kit", walk: { x: 4, y: 5 } }] };
  const later = { key: "fx:2", at: 2000, ms: 1200, items: [] };
  assert.deepEqual(queueBeats([swing, later], [walk]).map((beat) => beat.key), ["walk", "fx:1", "fx:2"]);
  assert.deepEqual(queueBeats([], [swing, later]).map((beat) => beat.key), ["fx:1", "fx:2"], "a tie keeps the order it came in");
  assert.deepEqual([...heldSquares([walk, swing])], [["t-kit", { x: 4, y: 5 }]]);
  assert.equal(heldSquares([swing]).size, 0, "a swing holds nobody back");
  assert.equal(fightSteps(before, [{ ...kit, x: 6, y: 5, movedAt: 1500 }, hunter])[0].at, 1500, "a walk is timed by the server");
  // A check in a fight reads as what is being done.
  assert.deepEqual(fightAct({ kind: "skill_check", detail: "Persuasion" }), { look: "talk", words: "Persuades" });
  assert.deepEqual(fightAct({ kind: "skill_check", detail: "Stealth (Dexterity)" }), { look: "sneak", words: "Sneaks" });
  assert.deepEqual(fightAct({ kind: "saving_throw", detail: "Dexterity" }), { look: "brace", words: "Resists" });
  assert.deepEqual(fightAct({ kind: "ability_check", detail: "strength (force the hatch)" }), { look: "other", words: "Strength" });
  assert.equal(fightAct({ kind: "attack", detail: "Pistol" }), null, "an attack plays as the board's own effect");
});

await test("the TV shows each creature with the picture for how it is doing, its words and pips, and the order", () => {
  const fight = couchFight(encounter());
  const art = { [fightArtKey("Hunter")]: { whole: "/uploads/whole.png", hurt: "/uploads/hurt.png", down: "/uploads/down.png" } };
  const html = renderToStaticMarkup(createElement(CouchTvFightHud, { fight, art, sheets: [], gmBusy: false, rollsWaiting: false }));
  assert.match(html, /\/uploads\/hurt\.png/, "the bloodied hunter shows its hurt picture");
  assert.match(html, /\/uploads\/down\.png/, "the dead one shows its down picture");
  assert.doesNotMatch(html, /\/uploads\/whole\.png/);
  assert.match(html, /Bloodied/);
  assert.match(html, /class="couch-fight-stamp">Down</);
  // Whose move it is, by first name, and who follows.
  assert.match(html, /Kara, what do you do\?/);
  assert.match(html, /then Brakk/);
  // While a roll is called or the GM answers, the move banner gives way.
  assert.doesNotMatch(renderToStaticMarkup(createElement(CouchTvFightHud, { fight, art, sheets: [], gmBusy: false, rollsWaiting: true })), /couch-fight-turn/);
  // A picture still being painted falls back to the one before it.
  const early = renderToStaticMarkup(createElement(CouchTvFightHud, { fight, art: { [fightArtKey("Hunter")]: { whole: "/uploads/whole.png" } }, sheets: [], gmBusy: true, rollsWaiting: false }));
  assert.match(early, /\/uploads\/whole\.png/);
  const order = renderToStaticMarkup(createElement(CouchTvFightOrder, { fight, art, sheets: [] }));
  assert.match(order, /Fight · round 2/);
  assert.match(order, /aria-current="step"/);
  const phone = renderToStaticMarkup(createElement(CouchPhoneFight, { fight }));
  assert.match(phone, /Hunter 1/);
  assert.match(phone, /Bloodied/);
  assert.doesNotMatch(phone, /\d+ ?\/ ?\d+|hp/i, "a phone never shows a creature's hit points");
});

await test("a foe is painted as what the story says it is, and hurt and down as the same figure", () => {
  const look = creatureLook("A bellwurm drops from the seam.", ["Pale ribs unfold.", "x".repeat(2000)]);
  assert.ok(look.length <= FIGHT_LOOK_CHARS);
  assert.match(look, /^A bellwurm drops from the seam\. From the story: Pale ribs unfold\./);
  const whole = fightArtPrompt("whole", { name: "Bellwurm", look, styleLock: "Late-1970s film still" });
  assert.ok(whole.startsWith("Late-1970s film still"), "the style lock leads");
  assert.match(whole, /a person stays a person/);
  assert.doesNotMatch(whole, /original design|never one from a film/, "a night may paint an existing universe's creatures");
  assert.doesNotMatch(whole, /Creature study|no people/, "nothing in the prompt makes every foe a beast");
  assert.match(whole, /Only this one figure/);
  for (const stage of ["hurt", "down"]) {
    const prompt = fightArtPrompt(stage, { name: "Bellwurm", look, styleLock: "Late-1970s film still" });
    assert.match(prompt, /same figure as the reference picture, Bellwurm/);
    assert.match(prompt, /no gore/);
  }
});

await test("a cast member who turns on the crew is painted as themselves", () => {
  const people = [
    { names: ["Edda Sorn"], look: "A broad-shouldered woman in her thirties, grease-dark coveralls.", portrait: "" },
    { names: ["Edda Sorn"], look: "female, a pressure mechanic", portrait: "/uploads/edda.png" },
    { names: ["Pell Varga", "the steward"], look: "A lean man in his late fifties.", portrait: "" },
  ];
  assert.deepEqual(knownFoe("Edda Sorn", people), { look: "A broad-shouldered woman in her thirties, grease-dark coveralls.", portrait: "/uploads/edda.png" });
  assert.equal(knownFoe("Edda", people)?.portrait, "/uploads/edda.png", "a first name is the person");
  assert.equal(knownFoe("The Steward", people)?.look, "A lean man in his late fifties.", "an alias is the person");
  assert.equal(knownFoe("Sorn", people), null, "a surname alone is not enough");
  assert.equal(knownFoe("Bellwurm 2", people), null);
  const whole = fightArtPrompt("whole", { name: "Edda Sorn", look: "Renn turns on Edda.", known: people[0].look, face: true, styleLock: "Film still" });
  assert.match(whole, /Edda Sorn looks like this: A broad-shouldered woman in her thirties/);
  assert.match(whole, /Keep the face, build and clothes of Edda Sorn in the reference picture/);
  assert.match(whole, /Never turn a person into a monster/);
});

await test("a thrown attack's ruling is read off the engine's note, so the TV says Hit or Miss", () => {
  assert.deepEqual(parkedAttackOutcome("Ro Arlen's Longsword attack rolled 21 vs AC 12: HIT. Ro Arlen now rolls damage (1d8+3)", 21), { rolled: 21, hit: true, vsAc: 12 });
  assert.deepEqual(parkedAttackOutcome("Ro Arlen's Longsword attack rolled 6 vs AC 12: MISS (natural 1). No damage roll happens", 6), { rolled: 6, hit: false, vsAc: 12 });
  assert.equal(parkedAttackOutcome("rolled 30 vs AC 12: HIT (CRITICAL: damage dice are doubled).", 30).crit, true);
  assert.deepEqual(parkedAttackOutcome("Ro's attack was still unrolled when their turn ended, so it does not land.", 9), {});
  assert.deepEqual(parkedAttackOutcome(null, 9), {});
});

// ---- crew against crew ----

const duelCrew = [
  { id: "kara", name: "Kara Voss", currentHp: 6, maxHp: 12, portrait: "/uploads/kara.png" },
  { id: "brakk", name: "Brakk Oduya", currentHp: 12, maxHp: 12, portrait: "/uploads/brakk.png" },
];
// Kara turned on Brakk: no creature in it, Kara on the foes' side, her move.
const duel = (patch = {}) =>
  encounter({
    order: [
      { kind: "pc", id: "kara", name: "Kara Voss", hidden: false },
      { kind: "pc", id: "brakk", name: "Brakk Oduya", hidden: false },
    ],
    enemies: [],
    sides: { kara: "foe" },
    ...patch,
  });

await test("a crew member can be named as the enemy by full name, or by a first name nobody else shares", () => {
  const keys = crewNameKeys([
    { id: "kara", name: "Kara Voss" },
    { id: "brakk", name: "Brakk Oduya" },
    { id: "kai", name: "Kara Lind" },
  ]);
  assert.equal(keys.get("kara voss"), "kara");
  assert.equal(keys.get("brakk"), "brakk");
  assert.equal(keys.get("kara"), undefined, "two crew answer to Kara: neither is named by it");
  assert.equal(crossingSide("party", "party"), "foe", "attacking a crewmate crosses to the other side");
  assert.equal(crossingSide("foe", "foe"), "party");
  assert.equal(crossingSide("foe", "party"), null, "already on opposite sides: an ordinary attack");
});

await test("crew against crew is a fight: the turned crew member is a foe card, in red, with their own face and health", () => {
  const fight = couchFight(duel(), duelCrew);
  assert.ok(fight, "a fight with no creature in it was not read as one");
  assert.deepEqual(fight.turned, ["kara"]);
  assert.deepEqual(fight.enemies.map((card) => [card.id, card.crewId, card.words, card.pips, card.portrait]), [["kara", "kara", "Bloodied", 2, "/uploads/kara.png"]]);
  assert.deepEqual(fight.crew.map((card) => [card.id, card.words]), [["brakk", "Unhurt"]]);
  assert.deepEqual(fight.order.map((seat) => [seat.id, seat.side]), [["kara", "foe"], ["brakk", "party"]]);
  assert.deepEqual(fight.turn, { kind: "crew", characterId: "kara", name: "Kara Voss", side: "foe" });
  assert.equal(fight.enemies[0].acting, true);
  // Without anyone turned and without a creature there is no fight.
  assert.equal(couchFight(duel({ sides: {} }), duelCrew), null);
  // Each phone lists the other side.
  assert.deepEqual(fightOpponents(fight, new Set(["kara"])).rows.map((card) => card.id), ["brakk"]);
  assert.equal(fightOpponents(fight, new Set(["kara"])).against, true);
  assert.deepEqual(fightOpponents(fight, new Set(["brakk"])).rows.map((card) => card.id), ["kara"]);
  assert.equal(fightTurnWords(fight, new Set(["kara"])).headline, "Your move: you're fighting the crew");
  assert.equal(fightTurnWords(fight, new Set(["brakk"])).headline, "Kara Voss's move in the fight");
  // The TV: Kara's own face until she is painted for the fight, marked turned.
  const hud = renderToStaticMarkup(createElement(CouchTvFightHud, { fight, art: {}, sheets: [], gmBusy: false, rollsWaiting: false }));
  assert.match(hud, /\/uploads\/kara\.png/);
  // Painting has started and nothing has landed yet: still her face.
  const painting = renderToStaticMarkup(createElement(CouchTvFightHud, { fight, art: { [fightArtKey("Kara Voss")]: {} }, sheets: [], gmBusy: false, rollsWaiting: false }));
  assert.match(painting, /\/uploads\/kara\.png/, "an empty picture set hid the crew member's face");
  assert.match(hud, /Turned on the crew/);
  assert.match(hud, /Against the crew · Say it on your phone/);
  const order = renderToStaticMarkup(createElement(CouchTvFightOrder, { fight, art: {}, sheets: [] }));
  assert.match(order, /data-side="foe"/);
  const karaPhone = renderToStaticMarkup(createElement(CouchPhoneFight, { fight, myCharacterIds: new Set(["kara"]) }));
  assert.match(karaPhone, /you against the crew/);
  assert.match(karaPhone, /Brakk Oduya/);
  assert.doesNotMatch(karaPhone, /Kara Voss/);
});

await test("the card that closes a fight of crew against crew names who won", () => {
  const summary = (outcome) => ({
    outcome,
    rounds: 2,
    seconds: 90,
    kills: 0,
    fled: 0,
    fighters: [
      { characterId: "kara", name: "Kara Voss", dealt: 4, taken: 9, healed: 0, nat20s: 0, nat1s: 0 },
      { characterId: "brakk", name: "Brakk Oduya", dealt: 9, taken: 4, healed: 0, nat20s: 0, nat1s: 0 },
    ],
    totals: { dealt: 13, taken: 13, healed: 0, nat20s: 0, nat1s: 0 },
  });
  const crewIds = new Set(["kara", "brakk"]);
  assert.deepEqual([fightOver(summary("victory"), crewIds, ["kara"]).title, fightOver(summary("victory"), crewIds, ["kara"]).line], ["Brakk Oduya wins", "Kara Voss is down."]);
  assert.equal(fightOver(summary("party_defeated"), crewIds, ["kara"]).title, "Kara Voss wins");
  assert.equal(fightOver(summary("truce"), crewIds, ["kara"]).line, "The crew stops fighting itself.");
  assert.equal(fightOver(summary("victory"), crewIds).title, "The crew wins", "a fight against creatures still reads as the crew's");
});

await test("rolling a crew member's initiative is no ruling on their action, so it does not end their first turn", async () => {
  // The crew fight of 2026-10-30: the GM rolled initiative naming Bex, the
  // one-action rule read that as Bex's turn ruled on, and Bex's first turn
  // ended before Bex had done anything.
  const { ruledFor } = await import("../src/lib/dm/claims.ts");
  const exchange = (name, args) => [
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name, arguments: JSON.stringify(args) } }] },
    { role: "tool", tool_call_id: "c1", content: JSON.stringify({ total: 11 }) },
  ];
  const bex = { id: "bex", name: "Bex Arlo" };
  assert.equal(ruledFor(exchange("request_roll", { characterId: "bex", kind: "initiative" }), bex), false);
  assert.equal(ruledFor(exchange("request_roll", { characterId: "bex", kind: "ability_check", ability: "str" }), bex), true, "a check on what they tried is a ruling");
});

// ---- a truce ----

const offer = (members) => ({
  id: "t1", encounterId: "enc-1", offeredBy: { characterId: "ingrid", name: "Ingrid Solberg" }, terms: "lower the sword.",
  members: members.map((name) => ({ characterId: name.toLowerCase(), name, answer: "waiting" })), status: "open", createdAt: new Date().toISOString(),
});

await test("a truce holds when everyone asked accepts, and one refusal ends it there", () => {
  const open = offer(["Mattias", "Haldor"]);
  assert.equal(couchTruceCall(open), "Ingrid Solberg offers a truce: lower the sword. Everyone in the fight, answer on your phone: accept, or fight on.");
  const one = answerTruce(open, "mattias", true);
  assert.equal(one.status, "open");
  assert.equal(answerTruce(one, "mattias", false), one, "a second answer changed the first");
  assert.equal(answerTruce(one, "nobody", true), one, "someone the truce does not ask answered it");
  const held = answerTruce(one, "haldor", true);
  assert.equal(held.status, "accepted");
  assert.equal(couchTruceResult(held, { fightOver: true }), "The truce holds. Everyone stands down: the fight is over.");
  const refused = answerTruce(open, "haldor", false);
  assert.equal(refused.status, "refused", "one refusal did not settle it");
  assert.equal(couchTruceResult(refused, { fightOver: false }), "Haldor refuses the truce. The fight goes on.");
  assert.equal(answerTruce(refused, "mattias", true), refused, "an answer after it was settled changed it");
});

await test("the phone asks only those the truce asks, and the TV fills in each answer", () => {
  const open = answerTruce(offer(["Mattias", "Haldor"]), "haldor", true);
  assert.equal(truceAsks(open, new Set(["mattias"]))?.answer, "waiting");
  const asked = renderToStaticMarkup(createElement(CouchPhoneTruce, { campaignId: "c1", truce: open, myCharacterIds: new Set(["mattias"]) }));
  assert.match(asked, /Ingrid Solberg offers a truce/);
  assert.match(asked, /Accept truce/);
  assert.match(asked, /Fight on/);
  assert.match(asked, /doesn&#x27;t use your turn/);
  const answered = renderToStaticMarkup(createElement(CouchPhoneTruce, { campaignId: "c1", truce: open, myCharacterIds: new Set(["haldor"]) }));
  assert.match(answered, /You accepted the truce/);
  assert.match(answered, /Waiting on Mattias/);
  assert.doesNotMatch(answered, /Accept truce/);
  const offerer = renderToStaticMarkup(createElement(CouchPhoneTruce, { campaignId: "c1", truce: open, myCharacterIds: new Set(["ingrid"]) }));
  assert.match(offerer, /You offered a truce/);
  assert.equal(renderToStaticMarkup(createElement(CouchPhoneTruce, { campaignId: "c1", truce: open, myCharacterIds: new Set(["someone"]) })), "");
  const tv = renderToStaticMarkup(createElement(CouchTvTruce, { truce: open, sheets: [] }));
  assert.match(tv, /Ingrid Solberg offers a truce/);
  assert.match(tv, /Mattias.*Deciding/s);
  assert.match(tv, /Haldor.*Accepts/s);
  assert.match(tv, /Answer on your phone/);
  // It takes the move banner's place in the fight.
  const hud = renderToStaticMarkup(createElement(CouchTvFightHud, { fight: couchFight(encounter()), art: {}, sheets: [], gmBusy: false, rollsWaiting: false, truce: open }));
  assert.match(hud, /offers a truce/);
  assert.doesNotMatch(hud, /what do you do/);
});

// ---- the engine ----

const world = await openWorld({ campaign: { maxPlayers: 8 }, gameSettings: { couchMode: true, ttsEnabled: false } });
const kit = await combatKit(world);
const model = await fakeModel();
model.pointAt(world);
const throwRoute = await world.route("campaigns/[campaignId]/pending-rolls/[pendingRollId]");
const { listOpenPendingRolls } = await import("../src/lib/db/dm-turns.ts");
const { updateGameSettings } = await import("../src/lib/db/campaigns.ts");
const { handleAdvanceAct } = await import("../src/lib/dm/couch-tools.ts");
const encounters = await import("../src/lib/db/encounters.ts");
const { subscribe } = await import("../src/lib/events.ts");
const landed = [];
const off = subscribe(world.campaignId, (chunk) => {
  const type = /^event: (.+)$/m.exec(chunk)?.[1];
  const data = /^data: (.+)$/m.exec(chunk)?.[1];
  if (type === "couch_roll" && data) landed.push(JSON.parse(data));
});
const { listRecentMessages } = await import("../src/lib/db/messages.ts");
const { handleOfferTruce, latestCouchTruce } = await import("../src/lib/couch/truce.ts");
const truceRoute = await world.route("campaigns/[campaignId]/couch/truce");

const hero = (name) =>
  world.addHero({
    name,
    class: "fighter",
    level: 1,
    abilities: { str: 16, dex: 12 },
    proficiencies: TRAINED,
    equipment: [{ name: "Longsword", qty: 1, equipped: true }],
    maxHp: 60,
  });
const ro = hero("Ro Arlen");
const veya = hero("Veya Dunn");

const current = () => {
  const live = world.encounter();
  const entry = live?.orderReady ? live.order[live.turnIndex] : null;
  return entry?.kind === "pc" ? entry.characterId : null;
};

// The fight opens with its initiative in: a couch table would wait on the
// phones for it, which is not what these tests are about.
async function stage({ couch = true } = {}) {
  await kit.endFight();
  updateGameSettings(world.campaignId, { couchMode: false });
  await kit.fight(1, { heroFaces: { [ro.id]: 20, [veya.id]: 15 } });
  updateGameSettings(world.campaignId, { couchMode: couch });
  const [creature] = world.enemies();
  kit.setEnemy(creature.id, { maxHp: 400, ac: 30 });
  kit.place(ro.id, 5, 5);
  kit.place(veya.id, 5, 8);
  kit.place(creature.id, 6, 5);
  kit.giveTurn(ro.id);
  return creature;
}

// A crew member swings, the swing waits for their phone, they throw it (a
// miss against the creature's armour), and the GM narrates the miss and
// asks what next.
async function thrownSwing(creature, who = ro, { faces = [2], narration = `${who.name}'s blade skips off the creature's ribs. What now?`, claims = [] } = {}) {
  model.claims([claims]);
  model.script([
    reply({ calls: [call("pc_attack", { characterId: who.id, targetEnemyId: creature.id, weapon: "Longsword" })] }),
    reply({ text: narration }),
  ]);
  // An ordinary table rolls the swing itself: a miss against that armour.
  world.dice(2);
  await model.turn(world, "I hack at it with my longsword.", who.id, who.userId);
  world.clearDice();
  const parked = listOpenPendingRolls(world.campaignId).filter((pending) => pending.characterId === who.id);
  if (!world.campaign().gameSettings.couchMode) {
    assert.equal(parked.length, 0);
    await settleQueue(world.campaignId);
    return;
  }
  assert.equal(parked.length, 1, "the swing did not wait for the phone");
  world.signIn(world.owner);
  // The to-hit, then on a hit the damage the phone is asked for next.
  for (const face of faces) {
    const waiting = listOpenPendingRolls(world.campaignId).find((pending) => pending.characterId === who.id);
    if (!waiting) break;
    world.dice(face);
    const thrown = await callRoute(throwRoute, "POST", { fallback: "digital" }, { campaignId: world.campaignId, pendingRollId: waiting.id });
    world.clearDice();
    assert.equal(thrown.status, 200, JSON.stringify(thrown.json));
  }
  await settleQueue(world.campaignId);
}

const corrections = () =>
  model.requests.flatMap((request) =>
    request.messages.filter((message) => message.role === "user" && /^\[System\] Your narration/.test(String(message.content))),
  );

await test("a crew member's thrown attack ends their turn once the GM rules on it, and the fight moves on", async () => {
  const creature = await stage();
  await thrownSwing(creature);
  assert.notEqual(current(), ro.id, "the turn stayed with Ro after the GM ruled on the swing");
  assert.equal(current(), veya.id, "the fight did not hand on to Veya after the creature");
});

await test("a hit thrown from the phone and narrated as a hit stands: no correction says no tool rolled it", async () => {
  const creature = await stage();
  kit.setEnemy(creature.id, { maxHp: 400, ac: 5 });
  const before = corrections().length;
  // The reader hears the hit in the narration, as it would on the night.
  const quote = `Ro's longsword bites deep into the ${creature.displayName.toLowerCase()}`;
  await thrownSwing(creature, ro, {
    faces: [15, 4],
    narration: `${quote}, and it shrieks.`,
    claims: [{ kind: "hit", target: creature.displayName.toLowerCase(), quote }],
  });
  assert.ok(kit.enemy(creature.id).currentHp < 400, "the thrown hit did no damage");
  assert.equal(corrections().length, before, `the narration of the thrown hit was sent back: ${corrections().at(-1)?.content}`);
  const told = listRecentMessages(world.campaignId, 20).filter((message) => message.authorType === "dm").map((message) => message.content).join("\n");
  assert.match(told, /bites deep/, "the table never heard the hit");
  const attack = landed.filter((feedback) => feedback.roll.kind === "attack").at(-1);
  assert.equal(attack?.verdict, "Hit", "the TV did not say the thrown attack hit");
});

await test("an ordinary table still waits for its End Turn after the same swing", async () => {
  const creature = await stage({ couch: false });
  await thrownSwing(creature);
  assert.equal(current(), ro.id);
});

await test("a walk into reach is no action: the crew member still has their move", async () => {
  const creature = await stage();
  kit.place(creature.id, 9, 5);
  model.claims([[]]);
  model.script([
    reply({ calls: [call("move_token", { token: ro.name, x: 8, y: 5, reason: "Ro closes in." })] }),
    reply({ text: "Ro closes on the creature, torch up. What does Ro do?" }),
  ]);
  await model.turn(world, "I close in on it.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  assert.equal(current(), ro.id, "the walk ended Ro's turn");
});

await test("a crew member caught by surprise loses their first turn only, not round 2's as well", async () => {
  // The order is Ro, Veya, the creature. Ro was ambushed; Veya acts, the
  // creature takes its turn, and round 2 opens on Ro.
  const creature = await stage();
  encounters.saveEncounter({ ...world.encounter(), surprisedIds: [ro.id] });
  kit.place(veya.id, 7, 5);
  kit.giveTurn(veya.id);
  await thrownSwing(creature, veya);
  assert.equal(world.encounter().round, 2);
  assert.equal(current(), ro.id, "the surprised crew member was skipped in round 2 as well");
});

await test("the GM reads the couch's fight rules in a fight only, where the rest of the night does not pay for them", async () => {
  const sent = () => model.requests.at(-1)?.messages.map((message) => String(message.content)).join("\n") ?? "";
  await stage();
  model.claims([[]]);
  model.script([reply({ text: "The creature circles, waiting. What does Ro do?" })]);
  await model.turn(world, "What is it doing?", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  assert.match(sent(), /COUCH FIGHT:/);
  assert.match(sent(), /Never offer movement, a bonus action or ending the turn/);
  await kit.endFight();
  model.claims([[]]);
  model.script([reply({ text: "The vestibule is quiet." })]);
  await model.turn(world, "I listen.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  assert.match(sent(), /COUCH ONE-SHOT/);
  assert.doesNotMatch(sent(), /COUCH FIGHT:/);
});

await test("a scene picture in a fight can frame the creature, with the night's picture of it as its face", async () => {
  const { sceneShotCast } = await import("../src/lib/dm/scene-shot.ts");
  const { fightArtFor } = await import("../src/lib/couch/fight-art.ts");
  const { getDatabase } = await import("../src/lib/db/core.ts");
  const creature = await stage();
  // No painter in the suite: the first ask records the kind and paints nothing.
  assert.deepEqual(fightArtFor(world.campaignId).art, {});
  assert.ok(!sceneShotCast(world.campaignId, "It lunges.").some((member) => member.id === creature.id), "a creature with no picture yet is framed from words alone");
  getDatabase()
    .prepare(`UPDATE couch_fight_art SET whole_url = ?, hurt_url = ? WHERE campaign_id = ? AND art_key = ?`)
    .run("/uploads/whole.png", "/uploads/hurt.png", world.campaignId, fightArtKey(creature.displayName));
  const framed = sceneShotCast(world.campaignId, "It lunges.").find((member) => member.id === creature.id);
  assert.equal(framed?.portrait, "/uploads/whole.png");
  kit.setEnemy(creature.id, { maxHp: 400, currentHp: 150 });
  assert.equal(sceneShotCast(world.campaignId, "It lunges.").find((member) => member.id === creature.id)?.portrait, "/uploads/hurt.png", "a bloodied creature is framed hurt");
  assert.deepEqual(fightArtFor(world.campaignId).art[fightArtKey(creature.displayName)], { whole: "/uploads/whole.png", hurt: "/uploads/hurt.png" });
});

await test("a fight the GM opens without asking anyone's initiative still starts by the end of its turn", async () => {
  // The night of 2026-10-30: the GM ran a prepared fight, narrated the
  // creatures bursting in and asked nobody for initiative, so the TV said
  // "Roll for initiative" with nothing on any phone to throw.
  await kit.endFight();
  model.claims([[]]);
  model.script([
    reply({ calls: [call("start_encounter", { enemies: [{ monster: "goblin", count: 2 }], summary: "Two shapes burst through the hatch." })] }),
    reply({ text: "Two shapes burst through the hatch, limbs scraping the grate." }),
  ]);
  await model.turn(world, "I pry the hatch open.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  const live = world.encounter();
  assert.ok(live, "no fight was started");
  assert.equal(live.orderReady, true, "the fight never left initiative");
  assert.deepEqual(
    live.order.filter((entry) => entry.kind === "pc").map((entry) => entry.characterId).sort(),
    [ro.id, veya.id].sort(),
  );
  assert.equal(listOpenPendingRolls(world.campaignId).length, 0);
});

await test("on a couch night the GM can start a fight against a crew member, who fights as themselves until they drop", async () => {
  await kit.endFight();
  model.claims([[]]);
  model.script([
    reply({ calls: [call("start_encounter", { enemies: [{ monster: "Veya Dunn" }], summary: "Ro and Veya go for each other." })] }),
    reply({ text: "Ro and Veya square off across the grate." }),
  ]);
  await model.turn(world, "I go for Veya.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  const live = world.encounter();
  assert.ok(live, "no fight was started against a crew member");
  assert.equal(world.enemies().length, 0, "Veya was spawned as a monster rather than fighting as herself");
  assert.equal(live.sides[veya.id], "foe");
  assert.equal(live.sides[ro.id], undefined, "Ro stays on the crew's side");
  assert.equal(live.orderReady, true);
  // The fight broke out between them: Veya stands beside Ro, in reach.
  const [a, b] = [kit.token(ro.id), kit.token(veya.id)];
  assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1, `Veya was put ${Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))} squares from Ro`);
  // Ro cuts Veya down: the fight is won when the other side is down.
  kit.place(ro.id, 5, 5);
  kit.place(veya.id, 6, 5);
  kit.giveTurn(ro.id);
  world.patch(veya.id, { currentHp: 1, ac: 5 });
  await thrownSwing({ id: veya.id }, ro, { faces: [15, 4], narration: "Ro's blade finds Veya, and she goes down." });
  assert.equal(world.encounter(), null, "the fight did not end with Veya down");
  assert.ok(world.sheet(veya.id).currentHp <= 0);
});

await test("an ordinary table still cannot name a player's character as a monster", async () => {
  await kit.endFight();
  updateGameSettings(world.campaignId, { couchMode: false });
  try {
    const refused = await world.invoke("start_encounter", { enemies: [{ monster: "Veya Dunn" }] });
    assert.match(String(refused.error ?? ""), /Unknown monster/, JSON.stringify(refused));
  } finally {
    updateGameSettings(world.campaignId, { couchMode: true });
  }
});

await test("a crew member who attacks a crewmate on their own turn crosses to the other side, and only then", async () => {
  const creature = await stage();
  world.patch(veya.id, { currentHp: 60, ac: 30 });
  kit.place(veya.id, 5, 6);
  // Not Ro's turn: the swing is refused and nobody has turned.
  kit.giveTurn(veya.id);
  await thrownSwing({ id: veya.id }, ro, { faces: [] }).catch(() => {});
  assert.equal(world.encounter().sides[ro.id], undefined, "a refused attack turned Ro against the crew");
  await settleQueue(world.campaignId);
  // Ro's turn: Ro joins the creature's side and the swing goes ahead.
  kit.giveTurn(ro.id);
  await thrownSwing({ id: veya.id }, ro, { faces: [2] });
  assert.equal(world.encounter().sides[ro.id], "foe");
  assert.ok(listRecentMessages(world.campaignId, 30).some((message) => /Ro Arlen turns against the party/.test(message.content)), "the table was not told Ro turned");
  assert.ok(creature);
});

await test("words alone spend a crew member's turn in a fight: the GM that asked the others to answer kept the floor", async () => {
  await stage();
  model.claims([[]]);
  model.script([reply({ text: "Ro begs everyone to stop. The creature's head tilts; Veya, do you listen?" })]);
  await model.turn(world, "Please, everyone, stop fighting!", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  assert.notEqual(current(), ro.id, "the plea kept Ro's turn");
});

await test("a truce offered between crew is answered on the phones, out of turn, and ends the fight when all accept", async () => {
  await kit.endFight();
  model.claims([[]]);
  model.script([
    reply({ calls: [call("start_encounter", { enemies: [{ monster: "Veya Dunn" }], summary: "Ro and Veya go for each other." })] }),
    reply({ text: "Ro and Veya square off across the grate." }),
  ]);
  await model.turn(world, "I go for Veya.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  kit.giveTurn(ro.id);
  model.claims([[]]);
  model.script([
    reply({ calls: [call("offer_truce", { characterId: ro.id, terms: "we walk back together" })] }),
    reply({ text: "Ro lowers the blade and holds out an open hand." }),
  ]);
  await model.turn(world, "I offer Veya a truce: we walk back together.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  const truce = latestCouchTruce(world.campaignId);
  assert.ok(truce, "no truce was offered");
  assert.deepEqual(truce.members.map((member) => member.name), ["Veya Dunn"]);
  assert.notEqual(current(), ro.id, "offering the truce did not spend Ro's turn");
  // Ro is not asked; Veya answers from her phone.
  world.signIn({ id: ro.userId });
  assert.equal((await callRoute(truceRoute, "POST", { truceId: truce.id, accept: true }, { campaignId: world.campaignId })).status, 409);
  world.signIn({ id: veya.userId });
  const answered = await callRoute(truceRoute, "POST", { truceId: truce.id, accept: true }, { campaignId: world.campaignId });
  assert.equal(answered.status, 200, JSON.stringify(answered.json));
  await settleQueue(world.campaignId);
  assert.equal(world.encounter(), null, "the fight went on after everyone accepted");
  assert.equal(encounters.getLatestEndedEncounter(world.campaignId)?.outcome, "truce");
  assert.ok(listRecentMessages(world.campaignId, 10).some((message) => /The truce holds/.test(message.content)), "the table was not told the truce holds");
  assert.equal(latestCouchTruce(world.campaignId), null);
});

await test("one crew member fighting on keeps the fight going", async () => {
  await kit.endFight();
  model.claims([[]]);
  model.script([
    reply({ calls: [call("start_encounter", { enemies: [{ monster: "Veya Dunn" }], summary: "Ro and Veya go for each other." })] }),
    reply({ text: "Ro and Veya square off." }),
  ]);
  await model.turn(world, "I go for Veya.", ro.id, ro.userId);
  await settleQueue(world.campaignId);
  kit.giveTurn(ro.id);
  // Out of Ro's turn, nobody else may offer one.
  assert.equal(handleOfferTruce(world.campaign(), JSON.stringify({ characterId: veya.id })).refused, "rules");
  assert.equal(handleOfferTruce(world.campaign(), JSON.stringify({ characterId: ro.id })).ok, true);
  const truce = latestCouchTruce(world.campaignId);
  world.signIn({ id: veya.userId });
  assert.equal((await callRoute(truceRoute, "POST", { truceId: truce.id, accept: false }, { campaignId: world.campaignId })).status, 200);
  await settleQueue(world.campaignId);
  assert.ok(world.encounter(), "a refused truce ended the fight");
  assert.ok(listRecentMessages(world.campaignId, 10).some((message) => /Veya Dunn refuses the truce/.test(message.content)));
});

await test("the act does not turn while a fight is on", async () => {
  await stage();
  const refused = handleAdvanceAct(world.campaign(), "{}");
  assert.equal(refused.refused, "rules");
  assert.match(refused.error, /fight is still on/);
});

await kit.endFight();
off();
model.close();
world.close();
await finish();
