// Playing on after a death (docs/couch-mode-spec.md 2.12): a player whose
// crew member died takes over someone in the story and keeps playing.
//
//   who may be taken over: the met first, then the cast still to turn up;
//   never anyone hostile, fighting the crew, killed, archived, already on a
//   sheet, or the GM's secret about them;
//   the newcomer's agenda covers the acts left, the earlier ones marked as
//   before they joined; a reply that says the story has them dead is
//   handed back, and a model that cannot answer still seats someone;
//   the GM reads a death rule, never a dead crew member's agenda, and acts
//   and story points skip the dead; nobody waits on a dead player;
//   the phone picks the living character, and the TV drops a dead one
//   once their player plays on.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";
import { fakeModel, reply, failure } from "./lib/enforce-narrator.mjs";

const { test, finish } = suite("test-couch-takeover");

process.env.DEFAULT_IMAGE_BACKEND = "openai";
const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const model = await fakeModel();
model.pointAt(world);
const campaigns = await import("../src/lib/db/campaigns.ts");
process.env.OPENAI_COMPAT_BASE_URL = campaigns.getCampaignById(world.campaignId).settings.customBaseUrl;
process.env.OPENAI_COMPAT_MODEL = "fake";

const logic = await import("../src/lib/couch/takeover-logic.ts");
const takeover = await import("../src/lib/couch/takeover.ts");
const store = await import("../src/lib/couch/store.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const npcs = await import("../src/lib/db/npcs.ts");
const play = await import("../src/lib/couch/play.ts");
const { writtenForge } = await import("../src/lib/couch/scenarios/index.ts");
const { couchAgendaBlock, couchDeathRule } = await import("../src/lib/couch/prompt-logic.ts");
const { couchSheetFor, tvCrew } = await import("../src/components/couch/couch-logic.ts");
const { listRecentMessages } = await import("../src/lib/db/messages.ts");
const { currentTableWait } = await import("../src/lib/dm/table-wait.ts");

const DEAD = { successes: 0, failures: 3, stable: false, dead: true };

// ---- the pure half ----

const CAST = [
  { name: "Kade Orr", role: "Station steward", look: "A lean man in his late fifties.", voice: "Dry drawl.", agenda: "Keep the refuge sealed.", secret: "He siphoned the air." },
  { name: "Edda Sorn", role: "Pressure mechanic", look: "A broad-shouldered woman.", voice: "Welsh lilt.", agenda: "Keep the pumps running.", secret: "She copied the purge command." },
  { name: "Dr. Pell Ardin", role: "Brine scientist", look: "A narrow-faced person.", voice: "Soft.", agenda: "Destroy every seed.", secret: "The buoy holds the logs." },
];
const npc = (overrides) => ({ id: "n1", name: "Kade Orr", aliases: [], attitude: "friendly", role: "", trait: "Clipped and careful.", location: "Refuge", portraitUrl: "", gender: "Male", archived: false, ...overrides });

await test("The met come first, carrying the cast's wants and secret; the hostile, the archived, the killed and anyone on a sheet are left out", () => {
  const people = logic.takeoverCandidates({
    cast: CAST,
    npcs: [npc({}), npc({ id: "n2", name: "Edda Sorn", attitude: "hostile" }), npc({ id: "n3", name: "Rusk", archived: true }), npc({ id: "n4", name: "Mara Venn" })],
    unavailable: ["Mara Venn"],
  });
  assert.deepEqual(people.map((person) => person.name), ["Kade Orr", "Dr. Pell Ardin"]);
  const [kade, pell] = people;
  assert.equal(kade.key, "npc:n1");
  assert.equal(kade.met, true);
  assert.equal(kade.wants, "Keep the refuge sealed.");
  assert.equal(kade.secret, "He siphoned the air.");
  assert.equal(kade.role, "Station steward", "the cast's role when the row has none");
  assert.equal(pell.key, "cast:2");
  assert.equal(pell.met, false);
  // A hostile row hides its cast entry too: Edda is one person.
  const choice = logic.choiceOf(kade);
  assert.deepEqual(Object.keys(choice).sort(), ["key", "look", "met", "name", "portraitUrl", "role", "where"]);
  assert.doesNotMatch(JSON.stringify(choice), /siphoned|sealed/, "the phone never reads what they want or hide");
});

await test("The newcomer's agenda covers the acts left, behind a line for each act before they joined", () => {
  assert.deepEqual(logic.takeoverActs(["A", "B", "C"], 0), ["A", "B", "C"]);
  assert.deepEqual(logic.takeoverActs(["A", "B", "C"], 1), [logic.NOT_YET, "A", "B"]);
  assert.deepEqual(logic.takeoverActs(["A"], 0), ["A", "A", "A"]);
  assert.deepEqual(logic.takeoverActs(["A"], 2), [logic.NOT_YET, logic.NOT_YET, "A"]);
});

await test("A reply keeps the person's own name, reads a refusal, and refuses a new name already in the story", () => {
  const person = logic.takeoverCandidates({ cast: CAST, npcs: [npc({})], unavailable: [] })[0];
  const good = logic.readTakeover(
    JSON.stringify({ available: true, name: "Someone Else", gender: "Male", career: "Officer", crewRole: "Steward, now crew", look: "Grey mustache.", agenda: ["Seal the refuge.", "Hide the siphon."] }),
    { person, act: 1, taken: [] },
  );
  assert.ok(good.ok, JSON.stringify(good));
  assert.equal(good.member.name, "Kade Orr");
  assert.equal(good.member.career, "Officer");
  assert.equal(good.member.hiddenRole, "");
  assert.deepEqual(good.member.agenda, [logic.NOT_YET, "Seal the refuge.", "Hide the siphon."]);
  const refused = logic.readTakeover('{"available": false, "why": "Kade died in the airlock."}', { person, act: 0, taken: [] });
  assert.equal(refused.unavailable, "Kade died in the airlock.");
  const clash = logic.readTakeover(JSON.stringify({ name: "Renn Calder", agenda: ["Live."] }), { person: null, act: 0, taken: ["Renn Calder"] });
  assert.match(clash.error, /already in the story/);
  assert.equal(logic.readTakeover("no json here", { person, act: 0, taken: [] }).ok, false);
});

await test("Without the model, the person is built from the scenario, and someone new takes a free name", () => {
  const person = logic.takeoverCandidates({ cast: CAST, npcs: [], unavailable: [] })[0];
  const kade = logic.fallbackTakeover(person, 2, []);
  assert.equal(kade.name, "Kade Orr");
  assert.deepEqual(kade.agenda, [logic.NOT_YET, logic.NOT_YET, "Keep the refuge sealed."]);
  const first = logic.fallbackTakeover(null, 0, []);
  const second = logic.fallbackTakeover(null, 0, [first.name]);
  assert.notEqual(first.name, second.name);
  assert.equal(second.agenda.length, 3);
});

await test("The GM reads the rule for the fallen only while someone is down or dead, and no dead crew member's agenda", () => {
  assert.equal(couchDeathRule([{ id: "a", name: "Ada", isCompanion: false, currentHp: 7, deathSaves: null }]), "");
  assert.match(couchDeathRule([{ id: "a", name: "Ada", isCompanion: false, currentHp: 0, deathSaves: null }]), /never ask them what they do/);
  assert.match(couchDeathRule([{ id: "r", name: "Renn", isCompanion: false, currentHp: 0, deathSaves: DEAD }]), /plays on as someone in the story/);
  const agenda = { acts: ["Live."], act: 0, hiddenRole: "", storyPoints: 0 };
  const block = couchAgendaBlock([
    { id: "a", name: "Renn", isCompanion: false, agenda, deathSaves: DEAD },
    { id: "b", name: "Kade", isCompanion: false, agenda, deathSaves: null },
  ]);
  assert.doesNotMatch(block, /Renn/);
  assert.match(block, /Kade/);
});

await test("The phone plays the living character; the TV marks the dead until their player plays on", () => {
  const renn = { id: "r", userId: "u1", isCompanion: false, deathSaves: DEAD };
  const kade = { id: "k", userId: "u1", isCompanion: false, deathSaves: null };
  const ada = { id: "a", userId: "u2", isCompanion: false, deathSaves: null };
  assert.equal(couchSheetFor([renn], "u1", "r"), renn, "dead and alone: the dead one, for the takeover");
  assert.equal(couchSheetFor([renn, kade], "u1", "r"), kade, "a stale selection of the dead never wins");
  assert.deepEqual(tvCrew([renn, ada], "tv").map((sheet) => sheet.id), ["r", "a"]);
  assert.deepEqual(tvCrew([renn, kade, ada], "tv").map((sheet) => sheet.id), ["k", "a"]);
});

// ---- the night ----

const routes = { takeover: await world.route("campaigns/[campaignId]/couch/takeover") };

async function call(method, user, body) {
  world.signIn(user);
  const response = await routes.takeover[method](
    new Request("http://test/", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    { params: Promise.resolve({ campaignId: world.campaignId }) },
  );
  return { status: response.status, body: await response.json() };
}

// The job runs off the request; the view says when it is done.
async function settledFor(user) {
  for (let tries = 0; tries < 400; tries += 1) {
    const view = takeover.takeoverView(world.campaign(), user.id);
    if (view.pending?.status !== "writing") return view;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the takeover never settled");
}

const written = writtenForge("good-shepherd", 2);
assert.ok("forge" in written);
const { forge } = written;
const renn = world.addUser("renn");
const ada = world.addUser("ada");
for (const user of [renn, ada]) {
  const joined = campaigns.joinByInviteCode(user.id, world.campaign().inviteCode);
  assert.ok(!("error" in joined), JSON.stringify(joined));
}
const agendaOf = (line) => ({ acts: [line, line, line], act: 0, hiddenRole: "", storyPoints: 0 });
const rennSheet = sheets.createSheet(world.campaignId, renn.id, 1, { ...heroInput({ name: "Renn Calder" }), agenda: agendaOf("Audit the losses."), crewRole: "Loss auditor" });
sheets.createSheet(world.campaignId, ada.id, 1, { ...heroInput({ name: "Ada Quill" }), agenda: agendaOf("Get home."), crewRole: "Pilot" });
store.beginCouchForge(world.campaignId, { players: 2, seed: "", offLimits: "" });
store.finishCouchForge(world.campaignId, forge, []);
campaigns.setCampaignStatus(world.campaignId, "active");
// The orderly is on stage and has a voice; the doctor is still to turn up.
const tomas = npcs.upsertNpc({ campaignId: world.campaignId, name: "Tomas Bello", attitude: "friendly" });
npcs.setNpcVoice(world.campaignId, tomas.id, { voiceId: "am_adam", speed: 1 });

await test("A living player has nothing to take over, and nobody can ask for them", async () => {
  const view = await call("GET", renn);
  assert.equal(view.status, 200);
  assert.equal(view.body.fallen, null);
  assert.deepEqual(view.body.choices, []);
  const asked = await call("POST", renn, { choice: "new" });
  assert.equal(asked.status, 409);
  assert.match(asked.body.error, /still alive/);
});

await test("After a death, the dead player's phone lists who to play, the met first, and nobody waits on them", async () => {
  sheets.patchSheet(rennSheet.id, { currentHp: 0, deathSaves: DEAD });
  const view = await call("GET", renn);
  assert.equal(view.body.fallen.name, "Renn Calder");
  assert.equal(view.body.choices[0].name, "Tomas Bello");
  assert.equal(view.body.choices[0].met, true);
  assert.ok(view.body.choices.some((choice) => choice.name === "Dr. Celeste Arnaud" && !choice.met));
  assert.doesNotMatch(JSON.stringify(view.body), /oldest host|brews the tea/, "no secret reaches the phone");
  assert.equal((await call("GET", ada)).body.fallen, null, "only the dead player's phone");
  const wait = currentTableWait(world.campaignId);
  assert.ok(!wait || !wait.waitingOn.some((seat) => seat.userId === renn.id));
});

await test("The dead earn no story point and keep no act", () => {
  const point = play.awardStoryPoint(world.campaignId, rennSheet.id);
  assert.equal(point.ok, false);
  assert.match(point.error, /is dead/);
});

await test("Taking over a met NPC seats them as crew in the player's seat, with the cast's agenda, the NPC's voice, and a note for the room and the GM", async () => {
  const choice = (await call("GET", renn)).body.choices.find((entry) => entry.name === "Tomas Bello");
  model.script([
    reply({
      text: JSON.stringify({
        available: true,
        gender: "Male",
        career: "Roughneck",
        crewRole: "Orderly who threw in with the crew",
        look: "Huge gentle man, shaved head, pastel blue scrubs.",
        personality: "Kind, stubborn.",
        backstory: "He served the tea for years.",
        relationships: [{ to: "Ada Quill", line: "would carry her out" }],
        signatureItem: "a dented tea tray",
        voice: "Deep, slow.",
        agenda: ["Keep the crew from drinking the tea.", "Get the crew to the shuttle."],
      }),
    }),
  ]);
  const asked = await call("POST", renn, { choice: choice.key });
  assert.equal(asked.status, 202, asked.body.error);
  const view = await settledFor(renn);
  assert.equal(view.fallen, null, "the player plays on");
  const mine = sheets.listSheets(world.campaignId).filter((sheet) => sheet.userId === renn.id);
  assert.equal(mine.length, 2, "the dead sheet stays where it lies");
  const now = mine.find((sheet) => !sheet.deathSaves?.dead);
  assert.equal(now.name, "Tomas Bello");
  assert.equal(now.crewRole, "Orderly who threw in with the crew");
  assert.equal(now.agenda.acts.length, 3);
  assert.equal(now.agenda.hiddenRole, "");
  assert.equal(sheets.getSheetForUser(world.campaignId, renn.id).id, now.id, "the seat is theirs");
  assert.ok(!npcs.listCastNpcs(world.campaignId).some((entry) => entry.name === "Tomas Bello"), "nobody plays him twice");
  const card = store.listCouchCrew(world.campaignId).find((entry) => entry.sheetId === now.id);
  assert.equal(card.claimedBy, renn.id);
  const note = listRecentMessages(world.campaignId, 5).find((message) => message.authorType === "system" && /plays on as/.test(message.content));
  assert.match(note.content, /Renn Calder is gone\. renn\S* plays on as Tomas Bello/);
  const { voiceRoster } = await import("../src/lib/tts-roster.ts");
  assert.equal(voiceRoster(world.campaignId).find((entry) => entry.key === `pc:${now.id}`)?.voice?.voiceId, "am_adam");
  const block = couchAgendaBlock(sheets.listSheets(world.campaignId));
  assert.match(block, /Tomas Bello/);
  assert.doesNotMatch(block, /Renn Calder/);
  assert.equal((await call("POST", renn, { choice: "new" })).status, 409, "alive again: nothing more to take");
});

await test("A reply that says the story has the person dead is handed back, and they leave the list", async () => {
  const kill = sheets.listSheets(world.campaignId).find((sheet) => sheet.name === "Ada Quill");
  sheets.patchSheet(kill.id, { currentHp: 0, deathSaves: DEAD });
  const doctor = (await call("GET", ada)).body.choices.find((entry) => entry.name === "Dr. Celeste Arnaud");
  model.script([reply({ text: '{"available": false, "why": "She was taken into the Garden."}' })]);
  assert.equal((await call("POST", ada, { choice: doctor.key })).status, 202);
  const view = await settledFor(ada);
  assert.equal(view.pending.status, "failed");
  assert.match(view.pending.error, /taken into the Garden/);
  assert.ok(!view.choices.some((entry) => entry.name === "Dr. Celeste Arnaud"));
});

await test("A model that cannot answer still seats someone new", async () => {
  model.script([failure(500)]);
  assert.equal((await call("POST", ada, { choice: "new" })).status, 202);
  const view = await settledFor(ada);
  assert.equal(view.fallen, null, view.pending?.error);
  const now = sheets.getSheetForUser(world.campaignId, ada.id);
  assert.ok(!now.deathSaves?.dead);
  assert.equal(now.agenda.acts.length, 3);
});

model.close();
finish();
