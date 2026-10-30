// Couch mode's secret agendas (docs/couch-mode-spec.md 2.2): each crew
// member carries a mission per act, a hidden role at most one of them has,
// and story points, and the whole game is that nobody else can read yours.
//
//   a crew sheet stores its agenda, its public crew line and its look, and no
//   sheet edit, the owner's included, rewrites the agenda;
//   only the owner and a DM seat are sent the agenda, in the snapshot, the
//   live sheet events, their replay and the audit log; the TV (the lead of
//   an AI table) and every other player read null, and the crew line stays
//   public;
//   the GM reads the couch rules in the system prompt and every claimed crew
//   member's agenda in the game state, except in a prompt whose answer the
//   whole table reads;
//   the lobby's gate exempts the TV and asks only for crew cards taken.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";

const { test, finish } = suite("test-couch-agenda");

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const { sheetForViewer, publicAuditEntry } = await import("../src/lib/dm/sheet-view.ts");
const { tablePayload, payloadForViewer, viewerFor } = await import("../src/lib/table-delivery.ts");
const { buildDmSystem, buildGameStateBlock } = await import("../src/lib/dm/prompt.ts");
const { COUCH_RULES, couchAgendaBlock } = await import("../src/lib/couch/prompt-logic.ts");
const { lobbyBlocker } = await import("../src/lib/dm/viewer.ts");

const AGENDA = {
  acts: ["Get the sample case off the ship before anyone opens it.", "Make sure Dana never reaches the radio.", "Leave on the shuttle, alone if you must."],
  act: 0,
  hiddenRole: "A Company synthetic who believes they are human.",
  storyPoints: 1,
};

// The TV is the campaign's owner and lead; the crew are two phones.
const tv = world.owner;
const kara = world.addUser("kara");
const brakk = world.addUser("brakk");
for (const user of [kara, brakk]) {
  const joined = campaigns.joinByInviteCode(user.id, world.campaign().inviteCode);
  assert.ok(!("error" in joined), JSON.stringify(joined));
}
const karaSheet = sheets.createSheet(world.campaignId, kara.id, 1, {
  ...heroInput({ name: "Kara Voss", class: "fighter" }),
  appearance: "A woman in her forties, cropped grey hair, a scar through one eyebrow, olive flak vest, a dented thermos.",
  agenda: AGENDA,
  crewRole: "Colonial Marine, the ship's sergeant",
});
const brakkSheet = sheets.createSheet(world.campaignId, brakk.id, 1, {
  ...heroInput({ name: "Brakk Oduya", class: "barbarian" }),
  agenda: { acts: ["Find your brother in the lower decks."], act: 0, hiddenRole: "", storyPoints: 0 },
  crewRole: "Roughneck, the engine-room chief",
});
const AI_SEATS = campaigns.campaignSeats(world.campaign());

await test("a crew sheet stores its agenda, crew line and look; other sheets carry none", () => {
  const stored = world.sheet(karaSheet.id);
  assert.deepEqual(stored.agenda, AGENDA);
  assert.equal(stored.crewRole, "Colonial Marine, the ship's sergeant");
  assert.match(stored.appearance, /scar through one eyebrow/);
  const plain = sheets.createSheet(world.campaignId, world.addUser("plain").id, 1, heroInput({ name: "Plain" }));
  assert.equal(plain.agenda, undefined, "a sheet outside couch mode has no agenda");
  assert.equal(plain.crewRole, undefined);
  sheets.deleteSheetForUser?.(world.campaignId, plain.userId);
});

await test("a sheet edit never rewrites the agenda, and only the agenda setter moves it", async () => {
  world.patch(karaSheet.id, { currentHp: 5, notes: "my notes" });
  assert.deepEqual(world.sheet(karaSheet.id).agenda, AGENDA, "a patch keeps it");
  const route = await world.route("campaigns/[campaignId]/sheet");
  world.signIn(kara);
  const response = await route.PATCH(
    new Request("http://test/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ characterId: karaSheet.id, backstory: "Rewritten.", agenda: { acts: ["Win."], act: 0, hiddenRole: "", storyPoints: 10 } }),
    }),
    { params: Promise.resolve({ campaignId: world.campaignId }) },
  );
  assert.ok(response.status < 500, `the sheet route answered ${response.status}`);
  assert.deepEqual(world.sheet(karaSheet.id).agenda, AGENDA, "the owner cannot rewrite their own mission");
  const moved = sheets.setSheetAgenda(karaSheet.id, { ...AGENDA, act: 1 });
  assert.equal(moved.agenda.act, 1);
  sheets.setSheetAgenda(karaSheet.id, AGENDA);
});

await test("only the owner reads the agenda; the TV and the other player read null, the crew line stays", () => {
  const sheet = world.sheet(karaSheet.id);
  assert.deepEqual(sheetForViewer(sheet, AI_SEATS, kara.id).agenda, AGENDA, "the owner");
  const other = sheetForViewer(sheet, AI_SEATS, brakk.id);
  assert.equal(other.agenda, null, "another player");
  assert.equal(other.crewRole, "Colonial Marine, the ship's sergeant", "the crew line is public");
  assert.equal(sheetForViewer(sheet, AI_SEATS, tv.id).agenda, null, "the TV, the lead of an AI table, holds no DM seat");
  const dm = world.addUser("dm");
  assert.deepEqual(sheetForViewer(sheet, { dmMode: "human", humanDmUserId: dm.id, assistantDmUserId: null }, dm.id).agenda, AGENDA, "a person in the DM seat");
  const entry = publicAuditEntry({ characterId: karaSheet.id, delta: { agenda: AGENDA, gold: 3 } });
  assert.equal(entry.delta.agenda, null, "an audit row's delta is blanked too");
  assert.equal(entry.delta.gold, 3);
});

await test("the snapshot sends each seat its own agenda and nobody else's", async () => {
  const route = await world.route("campaigns/[campaignId]");
  async function snapshotFor(user) {
    world.signIn(user);
    const response = await route.GET(new Request("http://test/"), { params: Promise.resolve({ campaignId: world.campaignId }) });
    assert.equal(response.status, 200);
    return response.json();
  }
  const forKara = await snapshotFor(kara);
  assert.deepEqual(forKara.sheets.find((entry) => entry.id === karaSheet.id).agenda, AGENDA);
  assert.equal(forKara.sheets.find((entry) => entry.id === brakkSheet.id).agenda, null);
  const forTv = await snapshotFor(tv);
  for (const entry of forTv.sheets) {
    assert.equal(entry.agenda, null, `the TV reads no agenda (${entry.name})`);
  }
  assert.doesNotMatch(JSON.stringify(forTv), /Company synthetic|sample case/, "not anywhere in the TV's snapshot");
  const forBrakk = await snapshotFor(brakk);
  assert.doesNotMatch(JSON.stringify(forBrakk), /Company synthetic|sample case/, "nor in another player's");
});

await test("a live sheet update carries the agenda to its owner alone, live and on replay", () => {
  const event = { sheet: world.sheet(karaSheet.id) };
  const stored = tablePayload("sheet_updated", event);
  assert.equal(stored.sheet.agenda, null, "the table's stored copy holds none");
  assert.deepEqual(payloadForViewer("sheet_updated", stored, viewerFor(world.campaignId, kara.id), event).sheet.agenda, AGENDA);
  assert.deepEqual(payloadForViewer("sheet_updated", stored, viewerFor(world.campaignId, kara.id)).sheet.agenda, AGENDA, "on replay too");
  assert.equal(payloadForViewer("sheet_updated", stored, viewerFor(world.campaignId, brakk.id), event).sheet.agenda, null);
  assert.equal(payloadForViewer("sheet_updated", stored, viewerFor(world.campaignId, tv.id), event).sheet.agenda, null, "nor the TV");
});

function state(extra = {}) {
  return {
    campaign: world.campaign(),
    members: campaigns.listMembers(world.campaignId),
    sheets: world.sheets(),
    recentRolls: [],
    storySummary: "",
    contextLimitTokens: 32_000,
    ...extra,
  };
}

await test("the GM reads the couch rules above the turn heading, and only at a couch table", () => {
  const system = buildDmSystem(world.campaign(), []);
  assert.ok(system.includes(COUCH_RULES), "the rules ride the system prompt");
  assert.ok(system.indexOf(COUCH_RULES) < system.indexOf("THIS TURN") || !system.includes("THIS TURN"), "with the settings, where a cache keeps them");
  for (const line of [/three acts/, /Level-locked at 1/, /slow dread, then violence/, /The Company always has a second agenda/, /Use send_whisper for things only one crew member perceives/, /\[whispers\], \[breathing heavily\], \[shouting\], \[panicked\]/, /never hint at a hidden role/]) {
    assert.match(COUCH_RULES, line);
  }
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.ok(!buildDmSystem(plain, []).includes(COUCH_RULES), "not at an ordinary table");
  assert.ok(COUCH_RULES.length < 2200, `compact: ${COUCH_RULES.length} characters`);
});

await test("the game state lists each crew member's agenda in force, the later ones, the hidden role and story points", () => {
  const block = buildGameStateBlock(state());
  assert.match(block, /CREW AGENDAS \(secret/);
  assert.match(block, new RegExp(`Kara Voss \\(Colonial Marine, the ship's sergeant\\) characterId=${karaSheet.id}: act 1 agenda: Get the sample case off the ship`));
  assert.match(block, /later, act 2: Make sure Dana never reaches the radio\.; act 3: Leave on the shuttle/);
  assert.match(block, /HIDDEN ROLE: A Company synthetic/);
  assert.match(block, /story points 1/);
  assert.match(block, /Brakk Oduya .*act 1 agenda: Find your brother in the lower decks\. \| story points 0/);
  assert.doesNotMatch(block, /Brakk Oduya[^\n]*HIDDEN ROLE/, "no hidden role where there is none");
  sheets.setSheetAgenda(karaSheet.id, { ...AGENDA, act: 2 });
  assert.match(buildGameStateBlock(state()), /Kara Voss[^\n]*act 3 agenda: Leave on the shuttle[^\n]*\| HIDDEN ROLE/, "the act in force, nothing after the last");
  sheets.setSheetAgenda(karaSheet.id, AGENDA);
});

await test("a prompt whose answer the whole table reads leaves the agendas out, and so does an ordinary table", () => {
  assert.doesNotMatch(buildGameStateBlock(state({ withholdStorytellerSecrets: true })), /CREW AGENDAS|sample case/);
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.doesNotMatch(buildGameStateBlock(state({ campaign: plain })), /CREW AGENDAS/);
  assert.equal(couchAgendaBlock([{ id: "x", name: "Nobody", isCompanion: false }]), "", "no agendas, no block");
});

await test("a couch table runs on ship time: no fantasy calendar, daylight or weather in the game state", () => {
  const block = buildGameStateBlock(state());
  assert.match(block, /Time: ship time/);
  assert.doesNotMatch(block, /Date and time:|It is daylight/);
  const plain = { ...world.campaign(), gameSettings: { ...world.campaign().gameSettings, couchMode: false } };
  assert.match(buildGameStateBlock(state({ campaign: plain })), /Date and time:/, "an ordinary table keeps its calendar");
});

await test("the lobby gate exempts the TV and asks only that everyone who joined took a crew card", () => {
  const couch = { displayUserId: tv.id };
  const seat = (userId, hasSheet, ready) => ({ userId, hasSheet, ready });
  assert.equal(lobbyBlocker(AI_SEATS, [seat(tv.id, false, false)], couch), "Waiting for a player to join.");
  assert.equal(lobbyBlocker(AI_SEATS, [seat(tv.id, false, false), seat(kara.id, false, false)], couch), "Waiting for someone to take a crew card.");
  assert.equal(lobbyBlocker(AI_SEATS, [seat(tv.id, false, false), seat(kara.id, true, true), seat(brakk.id, false, false)], couch), "Everyone who joined needs to take a crew card first.");
  assert.equal(lobbyBlocker(AI_SEATS, [seat(tv.id, false, false), seat(kara.id, true, true)], couch), "", "one player and the TV may begin");
  assert.equal(lobbyBlocker(AI_SEATS, [seat(tv.id, false, false), seat(kara.id, true, false)], couch), "Waiting for everyone to ready up.");
  assert.equal(lobbyBlocker(AI_SEATS, [seat(tv.id, false, false), seat(kara.id, true, true)]), "Every player needs a character before the adventure starts.", "outside couch mode the rule is the old one");
});

await test("Begin opens a couch night with the TV holding no character, and plans no arc or setup over the forge's outline", async () => {
  for (const user of [kara, brakk]) {
    campaigns.setMemberReady(world.campaignId, user.id, true);
  }
  campaigns.setDmOutline(world.campaignId, "COUCH ONE-SHOT: the forge's spine.");
  const route = await world.route("campaigns/[campaignId]");
  world.signIn(tv);
  const response = await route.PATCH(
    new Request("http://test/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "active" }) }),
    { params: Promise.resolve({ campaignId: world.campaignId }) },
  );
  const body = await response.json();
  assert.equal(response.status, 200, body.error);
  assert.equal(world.campaign().status, "active");
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/app/api/campaigns/[campaignId]/route.ts", import.meta.url), "utf8");
  assert.match(source, /aiStorySetup && !forged\)/, "the setup pass stands aside");
  assert.match(source, /if \(!humanDm && !forged\) \{\n\s+enqueueDmJob\(campaignId, \(\) => generateStoryArc\(campaignId\)\);/, "and so does the arc planner");
});

finish();
