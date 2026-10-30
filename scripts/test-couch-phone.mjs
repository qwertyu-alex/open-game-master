// The couch phone's decisions (src/components/couch/phone-logic.ts,
// character-logic.ts): the line above the action box (whose turn, what the
// GM asked), a GM passage split around the dice it rolled, a roll named in
// words, the private line that never folds an unread secret away, and the
// Character view's numbers. Pure: no database, no server.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const { couchTurn, listNames, passageParts, rollWhat, privateThread, privateCapped } = await import(
  "../src/components/couch/phone-logic.ts"
);
const { couchCharacter, signed } = await import("../src/components/couch/character-logic.ts");
const { couchRollCall } = await import("../src/lib/couch/roll-feedback-logic.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
}

const base = {
  ended: false,
  muted: false,
  myRolls: 0,
  dmStatus: "idle",
  floor: { mode: "open" },
  meUserId: "me",
  names: { me: "Renn", u2: "Kara", u3: "Brakk" },
  waitingOn: [],
};

test("the GM's spotlight question reaches the phone it was asked of", () => {
  const floor = { mode: "spotlight", userIds: ["me"], prompt: " How do you proceed at the hatch? ", respondedUserIds: [] };
  const turn = couchTurn({ ...base, floor });
  assert.equal(turn.tone, "yours");
  assert.equal(turn.headline, "Your turn");
  assert.equal(turn.prompt, "How do you proceed at the hatch?");
  assert.equal(turn.canPass, false);
});

test("everyone else sees who the spotlight is on, and once answered the asker waits too", () => {
  const floor = { mode: "spotlight", userIds: ["u2", "u3"], prompt: "What now?", respondedUserIds: [] };
  const turn = couchTurn({ ...base, floor });
  assert.equal(turn.tone, "waiting");
  assert.equal(turn.headline, "Waiting on Kara and Brakk");
  const answered = couchTurn({ ...base, floor: { ...floor, userIds: ["me", "u2"], respondedUserIds: ["me"] } });
  assert.equal(answered.tone, "waiting");
  assert.equal(answered.headline, "Waiting on Kara");
  const everyone = couchTurn({ ...base, floor: { ...floor, userIds: ["me"], respondedUserIds: ["me"] } });
  assert.equal(everyone.tone, "gm");
});

test("the open floor's wait offers Pass only to a player it waits on", () => {
  const waitingOn = [{ userId: "me", name: "Renn" }, { userId: "u2", name: "Kara" }];
  const mine = couchTurn({ ...base, waitingOn });
  assert.equal(mine.tone, "yours");
  assert.equal(mine.headline, "The GM is waiting on you and Kara");
  assert.equal(mine.canPass, true);
  const theirs = couchTurn({ ...base, waitingOn: waitingOn.slice(1) });
  assert.deepEqual([theirs.tone, theirs.headline, theirs.canPass], ["waiting", "The GM is waiting on Kara", false]);
  assert.equal(couchTurn(base).tone, "quiet");
  assert.equal(couchTurn(base).headline, "");
});

test("a working GM, a roll asked for, a fight and the end each say so, in that order of weight", () => {
  const floor = { mode: "spotlight", userIds: ["me"], prompt: "Go", respondedUserIds: [] };
  assert.equal(couchTurn({ ...base, floor, dmStatus: "thinking" }).tone, "gm");
  assert.equal(couchTurn({ ...base, floor, dmStatus: "thinking", myRolls: 1 }).headline, "The GM wants a roll from you");
  assert.equal(couchTurn({ ...base, floor, myRolls: 2, ended: true }).headline, "The story has ended.");
  assert.equal(couchTurn({ ...base, muted: true }).tone, "quiet");
  const fight = { mode: "initiative", encounterId: "e", userIds: ["u2"], currentName: "Kara", round: 1 };
  assert.equal(couchTurn({ ...base, floor: fight }).headline, "Kara's turn in the fight");
  assert.equal(couchTurn({ ...base, floor: { ...fight, userIds: ["me"] } }).tone, "yours");
  assert.equal(couchTurn({ ...base, floor: { mode: "hold", next: { mode: "open" } } }).tone, "waiting");
});

test("a crashed GM turn says so on the phone, under a working GM and a roll asked for", () => {
  const halted = couchTurn({ ...base, halted: true });
  assert.equal(halted.tone, "waiting");
  assert.match(halted.headline, /The GM hit a problem/);
  assert.equal(couchTurn({ ...base, halted: true, dmStatus: "thinking" }).tone, "gm");
  assert.equal(couchTurn({ ...base, halted: true, myRolls: 1 }).headline, "The GM wants a roll from you");
});

test("names read as a sentence", () => {
  assert.equal(listNames([]), "");
  assert.equal(listNames(["Kara"]), "Kara");
  assert.equal(listNames(["Kara", "Brakk", "Sam"]), "Kara, Brakk and Sam");
});

test("a passage keeps each server roll where it was rolled, once, and drops the model's own markers", () => {
  const id = "05fab3ea-0c49-4969-8f39-99bfeea1dcdc";
  const parts = passageParts(
    `Renn kneels at the hatch.\n\n[roll:${id.toUpperCase()}]\n\nThe coupling slips. [roll:${id}]\n\n[roll:enemy_attack]Nothing answers.`,
  );
  assert.deepEqual(parts, [
    { kind: "text", paragraphs: ["Renn kneels at the hatch."] },
    { kind: "roll", id },
    { kind: "text", paragraphs: ["The coupling slips."] },
    { kind: "text", paragraphs: ["Nothing answers."] },
  ]);
  assert.deepEqual(passageParts(""), []);
  assert.deepEqual(passageParts("[whispers] Get down."), [{ kind: "text", paragraphs: ["Get down."] }]);
});

test("a roll named by its ability's abbreviation reads in words", () => {
  assert.equal(rollWhat("int", "Check"), "Intelligence check");
  assert.equal(rollWhat("DEX save", "Save"), "Dexterity save");
  assert.equal(rollWhat("wis saving throw", "Save"), "Wisdom save");
  assert.equal(rollWhat("Perception", "Check"), "Perception");
  assert.equal(rollWhat("  ", "Attack"), "Attack");
  assert.equal(rollWhat("dex", "Saving throw"), "Dexterity save");
  assert.equal(rollWhat("sleight_of_hand", "Skill check"), "sleight of hand");
});

test("the TV, the phone and the narrator name the roll in the same words", () => {
  const call = couchRollCall(
    { id: "p1", kind: "ability_check", detail: "int", expression: "1d20+2", advantage: "none", dc: 15, reason: "Seat the coupling." },
    "Renn",
  );
  assert.equal(call.what, "Intelligence check");
  assert.equal(call.formula, "d20 + 2");
  assert.match(call.announcement, /^Renn · Intelligence check\./);
});

const whisper = (id, direction, minute, extra = {}) => ({
  id,
  direction,
  read: true,
  answered: true,
  createdAt: `2026-10-30T10:${String(minute).padStart(2, "0")}:00.000Z`,
  ...extra,
});

test("the private line shows the latest exchange and every unread secret, however old", () => {
  const thread = [
    whisper("w4", "to_dm", 4),
    whisper("w1", "to_player", 1, { read: false }),
    whisper("w2", "to_player", 2),
    whisper("w3", "to_player", 3),
  ];
  const { shown, hidden } = privateThread(thread, false);
  assert.deepEqual(shown.map((entry) => entry.id), ["w1", "w3", "w4"]);
  assert.equal(hidden, 1);
  assert.deepEqual(privateThread(thread, true).shown.map((entry) => entry.id), ["w1", "w2", "w3", "w4"]);
  assert.equal(privateThread(thread, true).hidden, 0);
});

test("two unanswered messages to the GM hold a third", () => {
  const one = [whisper("a", "to_dm", 1, { answered: false })];
  assert.equal(privateCapped(one), false);
  assert.equal(privateCapped([...one, whisper("b", "to_dm", 2, { answered: false })]), true);
  assert.equal(privateCapped([...one, whisper("b", "to_dm", 2), whisper("c", "to_player", 3, { answered: false })]), false);
});

// A first-level rogue as the forge wrote one: the phone's numbers are the
// ones the GM's rolls use.
const renn = {
  campaignId: "c1",
  class: "rogue",
  subclass: "",
  level: 1,
  abilities: { str: 9, dex: 16, con: 15, int: 14, wis: 13, cha: 11 },
  proficiencies: {
    saves: ["dex", "int"],
    skills: ["deception", "sleight_of_hand", "perception", "stealth", "athletics", "acrobatics"],
    expertise: ["perception", "stealth"],
    languages: ["Common"],
    tools: ["thieves' tools"],
    armor: ["light"],
    weapons: ["simple", "hand crossbows", "longswords", "rapiers", "shortswords"],
  },
  spellcasting: null,
  feats: [],
  wildShape: null,
  features: [
    { name: "Sneak Attack", source: "class", level: 1, classId: "rogue" },
    { name: "One extra language", source: "race" },
  ],
  equipment: [
    { name: "Rapier", qty: 1 },
    { name: "Shortbow", qty: 1 },
    { name: "Arrows", qty: 20 },
    { name: "Crowbar", qty: 1 },
    { name: "Dagger", qty: 2 },
    { name: "Thieves' Tools", qty: 1 },
  ],
};

test("the Character view puts the best checks first, with their training", () => {
  const view = couchCharacter(renn);
  const top = view.checks.slice(0, 3).map((check) => [check.name, check.bonus, check.training]);
  // Stealth: +3 DEX and twice +2 for expertise. Perception ties Acrobatics
  // at +5 and comes first, being doubled.
  assert.deepEqual(top, [["Stealth", 7, "expert"], ["Perception", 5, "expert"], ["Acrobatics", 5, "trained"]]);
  assert.equal(view.checks.find((check) => check.id === "arcana").training, null);
  assert.equal(view.checks.length, 18);
});

test("the Character view gives each ability its modifier and save, and the weapons their numbers", () => {
  const view = couchCharacter(renn);
  const dex = view.abilities.find((ability) => ability.key === "dex");
  assert.deepEqual([dex.name, dex.mod, dex.save, dex.saveTrained], ["Dexterity", 3, 5, true]);
  const str = view.abilities.find((ability) => ability.key === "str");
  assert.deepEqual([str.mod, str.saveTrained], [-1, false]);
  const rapier = view.weapons.find((weapon) => weapon.name === "Rapier");
  assert.equal(rapier.toHit, 5, "finesse takes DEX, and rapiers are trained");
  assert.match(rapier.damage, /^1d8\s*\+\s*3$/);
  assert.equal(view.weapons.filter((weapon) => weapon.name === "Dagger").length, 1);
  // The table's gear rows know a crowbar as a simple melee weapon.
  assert.ok(view.weapons.some((weapon) => weapon.name === "Crowbar"));
  assert.deepEqual(view.gear.map((item) => item.name), ["Arrows", "Thieves' Tools"]);
  assert.equal(view.gear[0].qty, 20);
  assert.equal(view.initiative, 3);
});

test("features carry what they do, where the rules know it", () => {
  const view = couchCharacter(renn);
  const sneak = view.features.find((feature) => feature.name === "Sneak Attack");
  assert.ok(sneak.text.length > 20, "Sneak Attack is described");
  assert.match(sneak.text, /^\p{Lu}/u, "and the line starts a sentence");
  assert.equal(view.features.length, 2);
  assert.equal(signed(3), "+3");
  assert.equal(signed(-1), "−1");
  assert.equal(signed(0), "+0");
});

console.log(`${passed} couch phone tests passed`);
