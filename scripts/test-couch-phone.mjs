// The couch phone's decisions (src/components/couch/phone-logic.ts,
// character-logic.ts): the line above the action box (whose turn, what the
// GM asked), a GM passage split around the dice it rolled, a roll named in
// words, the private line that never folds an unread secret away, and the
// Character view's numbers. Pure: no database, no server.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const { couchTurn, listNames, passageParts, rollWhat, privateExchanges, privateCapped } = await import(
  "../src/components/couch/phone-logic.ts"
);
const { couchCharacter, signed, itemKeys, sectionOnEntry, newGearKeys, aboutParts } = await import(
  "../src/components/couch/character-logic.ts"
);
const { itemTitle, itemMoveLine, paintedItemIcon, itemArtPrompt } = await import("../src/lib/couch/item-art-logic.ts");
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

const beat = (id, minute) => ({ id, createdAt: `2026-10-30T10:${String(minute).padStart(2, "0")}:00.000Z` });

test("a private question stands in the story where it was asked, and the GM's answer joins it there", () => {
  const story = [beat("m1", 1), beat("m2", 5), beat("m3", 8)];
  const exchanges = privateExchanges(
    [whisper("q1", "to_dm", 2), whisper("q2", "to_dm", 3), whisper("a1", "to_player", 6, { read: false })],
    story,
  );
  assert.equal(exchanges.length, 1, "a follow-up before the story moves on, and the answer a turn later, are one exchange");
  assert.equal(exchanges[0].anchorId, "m1");
  assert.deepEqual(exchanges[0].whispers.map((entry) => entry.id), ["q1", "q2", "a1"]);
  assert.equal(exchanges[0].unread, true);
  assert.equal(exchanges[0].open, true, "an unread answer never folds away, however far the story has moved");
});

test("a read exchange folds once the story moves past it; a fresh or waiting one stays open", () => {
  const story = [beat("m1", 1), beat("m2", 5)];
  const [settled] = privateExchanges([whisper("q1", "to_dm", 2), whisper("a1", "to_player", 3)], story);
  assert.equal(settled.settled, true);
  assert.equal(settled.open, false);
  const [fresh] = privateExchanges([whisper("q1", "to_dm", 6), whisper("a1", "to_player", 7)], story);
  assert.equal(fresh.anchorId, "m2");
  assert.equal(fresh.open, true, "the latest thing said stays open until the story moves on");
  const [waiting] = privateExchanges([whisper("q1", "to_dm", 2, { answered: false })], story);
  assert.equal(waiting.waiting, true);
  assert.equal(waiting.open, true);
});

test("a GM whisper nobody asked for, or a question after the answer, starts its own exchange", () => {
  const story = [beat("m1", 1), beat("m2", 5), beat("m3", 9)];
  const exchanges = privateExchanges(
    [whisper("q1", "to_dm", 2), whisper("a1", "to_player", 4), whisper("g1", "to_player", 6), whisper("q2", "to_dm", 10, { answered: false })],
    story,
  );
  assert.deepEqual(
    exchanges.map((exchange) => [exchange.anchorId, exchange.whispers.map((entry) => entry.id)]),
    [["m1", ["q1", "a1"]], ["m2", ["g1"]], ["m3", ["q2"]]],
  );
  assert.equal(privateExchanges([whisper("g0", "to_player", 0)], story)[0].anchorId, null, "before the first passage");
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

// Renn as the forge leaves her: the signature item first in the pack and
// named in the notes, armour and the burglar's pack behind it.
const forged = {
  ...renn,
  notes: "Career: Salvage auditor. Reads the fine print.\nPersonality: Patient, dry; never lets a debt go.\nSignature item: A hollow blue ceramic transit token, worn on a cord; its cracked edge can hide a",
  equipment: [
    { name: "A hollow blue ceramic transit token, worn on a cord; its cracked edge can hide a", qty: 1 },
    ...renn.equipment,
    { name: "Leather", qty: 1 },
    { name: "Rope, Hempen (50 feet)", qty: 1 },
    { name: "Lantern, Hooded", qty: 1 },
    { name: "Backpack", qty: 1 },
  ],
};

test("the Gear section holds the signature item apart, then weapons, what is worn and the pack", () => {
  const view = couchCharacter(forged);
  assert.equal(view.signature.title, "Hollow blue ceramic transit token", "named by its first clause, without the article");
  assert.match(view.signature.full, /cracked edge/, "the whole line is kept for its card");
  assert.equal(view.signature.icon, null, "the story's own thing is the night's to paint");
  assert.deepEqual(view.worn.map((item) => item.name), ["Leather"]);
  assert.ok(!view.gear.some((item) => item.name === "Leather" || item.key === view.signature.key), "neither is in the pack");
  assert.deepEqual(
    view.gear.map((item) => item.title),
    ["Arrows", "Thieves' Tools", "Hempen rope (50 feet)", "Hooded lantern", "Backpack"],
  );
  assert.equal(itemKeys(view).length, 1 + 4 + 1 + 5);
});

test("an item's picture is the painted icon set's when it has one, else the night paints it", () => {
  assert.equal(paintedItemIcon("Rapier"), "/assets/icons/item/rapier.webp");
  assert.equal(paintedItemIcon("Leather"), "/assets/icons/item/leather.webp");
  assert.equal(paintedItemIcon("Rope, Hempen (50 feet)"), "/assets/icons/action/gear-rope.webp");
  assert.equal(paintedItemIcon("Lantern, Hooded"), "/assets/icons/action/gear-hooded-lantern.webp");
  assert.equal(paintedItemIcon("Oil (flask)"), "/assets/icons/action/gear-oil.webp");
  assert.equal(paintedItemIcon("Backpack"), null);
  assert.equal(paintedItemIcon("Level 3 keycard"), null);
  const prompt = itemArtPrompt("Level 3 keycard", "1970s film still");
  assert.ok(prompt.startsWith("1970s film still"), "the night's look comes first");
  assert.match(prompt, /keycard/);
  assert.match(prompt, /no text/);
});

test("names read forwards on a tile, and Use starts a sentence with the thing", () => {
  assert.deepEqual(itemTitle("Clothes, Fine"), { title: "Fine clothes", full: "", rest: "" });
  assert.deepEqual(itemTitle("Ball Bearings (bag of 1000)"), { title: "Ball Bearings (bag of 1000)", full: "", rest: "" });
  assert.deepEqual(itemTitle("A tin of hard peppermints"), { title: "Tin of hard peppermints", full: "", rest: "" });
  assert.equal(itemTitle("A cracked blue transit token, worn on a cord").rest, "Worn on a cord");
  assert.equal(itemMoveLine("Rope, Hempen (50 feet)"), "I use my hempen rope to ");
  assert.equal(itemMoveLine("Thieves' Tools"), "I use my thieves' tools to ");
  assert.equal(itemMoveLine("Rapier"), "I use my rapier to ");
  assert.equal(itemMoveLine("EVA suit"), "I use my EVA suit to ");
});

test("the Character tab opens where something waits, else on who you are until you have moved", () => {
  const quiet = { agendaFresh: false, newGear: false, acted: false };
  assert.equal(sectionOnEntry(null, quiet), "about", "a player who has not moved yet is still learning who they are");
  assert.equal(sectionOnEntry(null, { ...quiet, acted: true }), "gear");
  assert.equal(sectionOnEntry("skills", { ...quiet, acted: true }), "skills", "the section left last stays");
  assert.equal(sectionOnEntry("skills", { ...quiet, acted: true, newGear: true }), "gear", "a thing just picked up");
  assert.equal(sectionOnEntry("gear", { ...quiet, acted: true, newGear: true, agendaFresh: true }), "about", "a new act's agenda first");
});

test("what is new is what was picked up since the last look; the starting kit never is", () => {
  assert.deepEqual(newGearKeys(null, ["rapier", "rope"]), []);
  assert.deepEqual(newGearKeys(["rapier", "rope"], ["rapier", "keycard"]), ["keycard"]);
});

test("About reads the story, a face for each tie, and the personality from the notes", () => {
  const about = aboutParts(
    "Renn grew up in a Company furnace habitat.\n\nTies: Mara Voss, owes her a favour; Jonas Pike, a rival from the yards.",
    forged.notes,
  );
  assert.deepEqual(about.story, ["Renn grew up in a Company furnace habitat."]);
  assert.deepEqual(about.ties, [
    { to: "Mara Voss", line: "Owes her a favour" },
    { to: "Jonas Pike", line: "A rival from the yards" },
  ]);
  assert.equal(about.personality, "Patient, dry; never lets a debt go.");
  assert.deepEqual(aboutParts("Just a story.", "").ties, []);
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
