// The scenario forge (docs/couch-mode-spec.md 2.1): Start on the couch-night
// screen makes an AI-run campaign whose creator is the TV, the forge asks
// the story model for the scenario and the crew in one call, each crew
// member becomes a level 1 sheet the table's door admits, and the phones
// claim the cards.
//
// Held here, with the model a scripted stand-in (enforce-narrator.mjs
// fakeModel):
//   - the reply is read leniently and mended (a crew past the head count, a
//     second hidden role, a career in the model's own words) or refused with
//     a reason, and a refused reply is asked once more with that reason;
//   - every career builds a spell-free 5e sheet the table admits, and a
//     build the door refuses falls back to a ready-made hero reskinned;
//   - the night's settings are couch mode's defaults, and its art direction
//     is the forge's style lock;
//   - the lobby route shows the scenario's public face and the cards, never
//     an agenda, a hidden role or the truth;
//   - the cards open only once the TV has introduced the crew, which only
//     the lead moves on, one step at a time or skipped to the end;
//   - a card is claimed once, one per player, never by the TV, and the claim
//     seats the sheet with its agenda and marks the player ready;
//   - the GM's outline holds the scenario and no crew member's secret;
//   - the acts turn for every crew member, each told privately, and story
//     points land, through the functions the DM tools will call;
//   - a forge that failed, or one a restart cut off, is asked again by the
//     lead only, and never once a card is taken.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";
import { fakeModel, reply, settleQueue } from "./lib/enforce-narrator.mjs";

const { test, finish } = suite("test-couch-forge");

// No painter on this server: a portrait is never promised, never failed.
process.env.DEFAULT_IMAGE_BACKEND = "openai";
const world = await openWorld();
const model = await fakeModel();
// The server's own storyteller is the scripted one, so a campaign the couch
// route makes (on any account) talks to it.
model.pointAt(world);
const campaigns = await import("../src/lib/db/campaigns.ts");
process.env.OPENAI_COMPAT_BASE_URL = campaigns.getCampaignById(world.campaignId).settings.customBaseUrl;
process.env.OPENAI_COMPAT_MODEL = "fake";

const logic = await import("../src/lib/couch/forge-logic.ts");
const forgeMod = await import("../src/lib/couch/forge.ts");
const play = await import("../src/lib/couch/play.ts");
const store = await import("../src/lib/couch/store.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const { admitSheet } = await import("../src/lib/characters/admit.ts");
const { getDatabase } = await import("../src/lib/db/core.ts");
const { latestEventOfType } = await import("../src/lib/events.ts");
const kit = await import("../src/lib/couch/kit-logic.ts");
const { matchWeapon } = await import("../src/lib/srd/weapons.ts");
const { ammoKindForItem, ammoKindForWeapon } = await import("../src/lib/srd/ammunition.ts");

const crewMember = (overrides = {}) => ({
  name: "Kara Voss",
  gender: "Female",
  career: "Colonial Marine",
  crewRole: "Colonial Marine, the ship's sergeant",
  look: "A woman in her forties, cropped grey hair, a scar through one eyebrow, olive flak vest, a dented steel thermos.",
  personality: "Dry, loyal, stubborn; flaw: never admits fear.",
  backstory: "Kara did two tours on the outer colonies. She signed on to the hauler for the quiet. She knows the captain from the war.",
  relationships: [
    { to: "Brakk Oduya", line: "owes him her life" },
    { to: "Someone Else", line: "a stranger not aboard" },
  ],
  signatureItem: "Dented steel thermos",
  voice: "Low, gravelly, flat vowels",
  agenda: ["Keep the sample case sealed and in your sight.", "Make sure Dana never reaches the radio.", "Get yourself on the shuttle."],
  ...overrides,
});

const FORGE = {
  scenario: {
    title: "The Quiet of the Tamsin Reach",
    logline: "A hauler crew answers a beacon from a research tug that should not exist.",
    briefing:
      "You are the crew of the ore hauler Tamsin Reach, eleven weeks out from anywhere. Six hours ago the ship woke you early: a Company beacon, answering a code that was retired before any of you were born. The source is a research tug, the Halden, drifting with its lights on and its airlock open. The Company's standing order is plain: board, recover, report. Nobody mentions the bonus clause. The captain wants a team at the lock in twenty minutes.",
    setting: "The ore hauler Tamsin Reach and the research tug Halden, deep space, 2187, owned by the Varrow Combine.",
    truth: "The Halden carried a spore colony the Combine bred to digest ore; it learned to digest people. The Combine knew.",
    threat: "A pale, many-jointed thing grown from spores, that hides in vents and mimics the ship's own sounds.",
    acts: [
      { title: "The Open Lock", goal: "Board the Halden and find out what happened.", setPieces: ["the empty mess hall", "the frozen lab"], escalation: "Something follows them back.", clock: "The Halden's orbit decays in two hours.", twist: "The Halden's beacon was switched on by the Combine an hour ago." },
      { title: "Something Aboard", goal: "Find and contain what came back.", setPieces: ["the vents", "the medbay"], escalation: "Air scrubbers fail.", clock: "Six hours of air." },
      { title: "The Shuttle", goal: "Get off the Tamsin Reach alive.", setPieces: ["the reactor", "the shuttle bay"], escalation: "The Combine's override locks the doors.", clock: "Reactor purge in ten minutes." },
    ],
    cast: [
      { name: "Captain Ilse Marr", role: "captain", look: "tall, tired, grey braid", voice: "clipped", agenda: "the bonus", secret: "she read the Combine's sealed orders" },
      { name: "Dana Reyes", role: "comms officer", look: "young, headset always on", voice: "fast", agenda: "go home", secret: "she already called for help" },
      { name: "MOTHERBOARD", role: "ship computer", look: "amber text on green screens", voice: "flat", agenda: "obey the Combine", secret: "special order 12" },
    ],
    foes: [
      { name: "Spore-ridden tug crew", what: "Grey-skinned Halden hands, coughing spores, swinging tools.", act: 1 },
      { name: "Combine cleaner", what: "A masked contractor with a flamer.", act: "three" },
    ],
    locations: [
      { name: "Halden airlock", look: "frost on the inner door, emergency strobes" },
      { name: "Tamsin mess", look: "cassette deck, plastic trays, a flickering fluorescent tube" },
      { name: "Vents", look: "cramped, steam, a motion tracker's green glow" },
      { name: "Shuttle bay", look: "yellow hazard stripes, a stubby shuttle on its rails" },
    ],
  },
  styleLock: "late-1970s sci-fi film still, 35mm grain, sodium-vapor practical lighting, cassette-futurist consoles",
  crew: [
    crewMember(),
    crewMember({
      name: "Brakk Oduya",
      gender: "Male",
      career: "engineer",
      crewRole: "Chief engineer, the man who keeps her flying",
      look: "A broad man in his fifties, shaved head, grease-black coveralls, a wrench through his belt.",
      relationships: [{ to: "Kara", line: "trusts her with his life" }],
      signatureItem: "Lucky torque wrench",
      agenda: ["Find out why the Combine logged the Halden as scrapped.", "Keep the reactor running whatever the captain says.", "Make the Combine pay."],
    }),
    crewMember({
      name: "Lio Tanaka",
      gender: "Nonbinary",
      career: "Company Agent",
      crewRole: "Combine liaison, along for the audit",
      look: "Slim, mid-thirties, neat black bob, pressed grey Combine blazer, a sealed data slate.",
      relationships: [],
      signatureItem: "Sealed data slate",
      agenda: ["Recover a living sample, whatever it costs.", "Keep the crew from destroying it.", "Get the sample to the shuttle."],
    }),
    // A fourth the night has no seat for.
    crewMember({ name: "Extra Hand", career: "Kid" }),
  ],
  hiddenRole: { crewMember: "Lio Tanaka", role: "A Combine synthetic with orders to bring the organism home; the crew is expendable." },
};
const HIDDEN = FORGE.hiddenRole.role;
const forgeReply = (forge = FORGE) => reply({ text: `Here you go:\n\`\`\`json\n${JSON.stringify(forge)}\n\`\`\`` });

// ---- reading the reply ----

await test("the reply is read through a fence, the crew cut to the head count and mended", () => {
  const read = logic.readForge(forgeReply().text, 3);
  assert.equal(read.ok, true, read.error);
  const { forge } = read;
  assert.equal(forge.crew.length, 3, "the fourth crew member has no seat");
  assert.deepEqual(forge.crew.map((member) => member.career), ["Marine", "Roughneck", "Company Agent"], "careers in the model's own words read as the eight");
  assert.deepEqual(forge.crew.map((member) => member.hiddenRole), ["", "", HIDDEN], "the hidden role goes to the crew member it names");
  assert.deepEqual(forge.crew[0].relationships.map((tie) => tie.to), ["Brakk Oduya"], "a tie to someone not aboard is dropped");
  assert.equal(forge.scenario.acts.length, 3);
  assert.equal(forge.scenario.acts[0].twist, "The Halden's beacon was switched on by the Combine an hour ago.");
  assert.equal(forge.scenario.acts[1].twist, "", "an act the model gave no twist reads as none");
  assert.deepEqual(forge.scenario.foes.map((foe) => [foe.name, foe.act]), [["Spore-ridden tug crew", 1], ["Combine cleaner", 2]], "a foe with no act it can read comes in act 2");
  assert.equal(forge.styleLock, FORGE.styleLock);
  const cut = logic.readForge(JSON.stringify({ ...FORGE, hiddenRole: { crewMember: "Extra Hand", role: "A plant." } }), 3);
  assert.deepEqual(cut.forge.crew.map((member) => member.hiddenRole), ["", "", ""], "a hidden role for someone cut from the crew goes with them");
  const none = logic.readForge(JSON.stringify({ ...FORGE, hiddenRole: null }), 3);
  assert.deepEqual(none.forge.crew.map((member) => member.hiddenRole), ["", "", ""], "a night without one");
  const noStyle = logic.readForge(JSON.stringify({ ...FORGE, styleLock: "" }), 1);
  assert.equal(noStyle.forge.styleLock, logic.DEFAULT_STYLE_LOCK);
});

await test("a signature item the model ran long is cut at a clause or a word, never mid-word", () => {
  const long = "A hollow blue ceramic transit token, worn on a cord; its cracked edge can hide a folded slip of paper";
  assert.equal(logic.clipPhrase(long, 80), "A hollow blue ceramic transit token, worn on a cord");
  assert.equal(logic.clipPhrase("A tin of hard peppermints", 80), "A tin of hard peppermints");
  assert.equal(logic.clipPhrase("an extraordinarily long description without any commas at all running on", 40), "an extraordinarily long description");
});

await test("a reply the night cannot run on is refused with a reason", () => {
  assert.match(logic.readForge("I cannot do that.", 3).error, /not a JSON object/);
  assert.match(logic.readForge(JSON.stringify({ ...FORGE, scenario: { ...FORGE.scenario, acts: FORGE.scenario.acts.slice(0, 2) } }), 3).error, /2 acts, not three/);
  assert.match(logic.readForge(JSON.stringify({ ...FORGE, crew: FORGE.crew.slice(0, 2) }), 3).error, /2 usable members/);
  assert.match(logic.readForge(JSON.stringify({ ...FORGE, crew: [crewMember({ agenda: [] }), ...FORGE.crew.slice(1, 3)] }), 3).error, /2 usable members/, "a crew member with no agenda is not usable");
  assert.match(logic.readForge(JSON.stringify({ ...FORGE, scenario: { ...FORGE.scenario, truth: "" } }), 3).error, /the truth/);
});

await test("the careers read the model's words, and each stands on a class with no spells", () => {
  for (const [words, career] of [["Colonial Marine", "Marine"], ["MEDIC", "Medic"], ["Company agent on loan", "Company Agent"], ["Scientist", "Scientist"], ["Officer", "Officer"], ["stowaway kid", "Kid"], ["dropship pilot", "Pilot"], ["ship's doctor", "Roughneck"], ["???", "Roughneck"]]) {
    assert.equal(logic.careerFor(words), career, words);
  }
  assert.deepEqual([...logic.COUCH_CLASS_IDS].sort(), ["barbarian", "fighter", "ranger", "rogue"]);
});

await test("the prompt asks for the whole night, original, with tonight's limits", () => {
  const system = logic.forgeSystemPrompt(3, "spiders, harm to children");
  assert.match(system, /exactly 3, ordinary working people/);
  assert.match(system, /Any universe is welcome/);
  assert.doesNotMatch(system, /never one from a film|Name no real franchise/, "the table may build on an existing universe");
  assert.match(system, /exactly ONE crew member has one/, "the owner wants the hidden role in play");
  assert.match(logic.forgeSystemPrompt(1, ""), /hiddenRole: null/, "a crew of one has none");
  assert.match(system, /80 to 150 words/);
  // The night is action-packed (2026-10-31: "more NPCs, more plot twists,
  // more enemies").
  assert.match(system, /every act has a fight or a chase with something the crew CAN fight/);
  assert.match(system, /a twist: a reveal mid-act/);
  assert.match(system, /cast: four to six NPCs/);
  assert.match(system, /foes: four to six things the crew can fight/);
  assert.match(system, /"foes":\[\{"name":string,"what":string,"act":1\|2\|3\}\]/);
  assert.match(system, /Off limits tonight, never in the story in any form, not even implied: spiders, harm to children/);
  assert.match(logic.forgeUserPrompt(""), /surprise us/);
  assert.match(logic.forgeUserPrompt("A mining moon goes quiet"), /Story seed from the table: A mining moon goes quiet/);
});

await test("the night's settings are couch mode's own", () => {
  const settings = logic.couchGameSettings("No spiders, nothing happening to kids; gore");
  assert.equal(settings.couchMode, true);
  assert.equal(settings.dmMode, "ai");
  assert.equal(settings.genre, "custom");
  assert.equal(settings.companions, "off");
  assert.equal(settings.relationships, "off");
  assert.equal(settings.romance, "off");
  assert.equal(settings.mapsEnabled, false);
  assert.equal(settings.boardDrawing, false);
  assert.equal(settings.voice.enabled, false);
  assert.equal(settings.dicePolicy, "digital_only");
  assert.equal(settings.waitForTable, true);
  assert.equal(settings.waitForTableSeconds, 300);
  assert.equal(settings.campaignLength, "short");
  assert.equal(settings.ttsEnabled, true);
  assert.equal(settings.multiCharacter, "off");
  assert.deepEqual(settings.safety.lines, ["No spiders", "nothing happening to kids", "gore"], "one line per thing, in the words typed");
});

// ---- sheets ----

const counter = () => {
  let seed = 7;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
};
const tableJudge = (campaign) => (sheet) => {
  const verdict = admitSheet({ door: "table", level: 1, sheet, userId: campaign.ownerUserId, campaign });
  return verdict.ok ? verdict.sheet : null;
};

await test("every career builds a level 1 sheet with no spells that the table admits, carrying the forge's words", () => {
  const campaign = { ...world.campaign(), gameSettings: logic.couchGameSettings("") };
  for (const career of logic.CAREERS) {
    const member = { ...logic.readForge(JSON.stringify(FORGE), 3).forge.crew[0], career, name: `Crew ${career}` };
    let fellBack = false;
    const sheet = forgeMod.crewSheet(member, (input) => {
      const admitted = tableJudge(campaign)(input);
      if (!admitted && input.class === logic.CAREER_BUILD[career].classId) fellBack = true;
      return admitted;
    }, counter());
    assert.ok(sheet, `${career} was built`);
    assert.equal(fellBack, false, `${career}'s own build passed the door`);
    assert.equal(sheet.class, logic.CAREER_BUILD[career].classId, career);
    assert.equal(sheet.race, "human");
    // A level 1 ranger holds the class's empty casting block: no slot, no
    // spell, nothing to cast until level 2, which a one-shot never reaches.
    const casting = sheet.spellcasting;
    const spells = casting ? [...(casting.prepared ?? []), ...(casting.known ?? []), ...(casting.cantrips ?? [])] : [];
    const slots = casting ? Object.values(casting.slots ?? {}).reduce((sum, slot) => sum + (slot.max ?? 0), 0) : 0;
    assert.deepEqual({ spells, slots }, { spells: [], slots: 0 }, `${career} casts nothing: ${JSON.stringify(casting)}`);
    assert.equal(sheet.name, `Crew ${career}`);
    assert.deepEqual(sheet.agenda.acts, member.agenda);
    assert.equal(sheet.crewRole, member.crewRole);
    assert.equal(sheet.appearance, member.look);
    assert.match(sheet.backstory, /Ties: Brakk Oduya, owes him her life\./);
    assert.equal(sheet.equipment[0].name, "Dented steel thermos", "the signature item rides first");
    // The crew starts light (src/lib/couch/kit-logic.ts): armour, a weapon
    // to hit with, one to shoot or throw with, a little ammunition.
    assert.ok(sheet.equipment.length <= 5, `${career} carries ${sheet.equipment.map((item) => `${item.qty} ${item.name}`).join(", ")}`);
    assert.ok(sheet.equipment.some((item) => matchWeapon(item)), `${career} has a weapon`);
    assert.ok(!sheet.equipment.some((item) => /piton|ration|torch|bedroll|tinderbox|rope|backpack/i.test(item.name)), `${career} carries no adventurer's pack`);
    assert.ok(sheet.equipment.every((item) => !ammoKindForItem(item) || item.qty <= kit.STARTING_AMMO), `${career}'s ammunition is scarce`);
    // Named for the night's future, not the class's 5e kit (Scale Mail and
    // a Longbow on a salvage tug, 2026-10-31): the 5e row rides in srdName,
    // so the weapon still attacks and its ammunition still counts.
    for (const item of sheet.equipment.slice(1)) {
      assert.ok(item.srdName && item.srdName !== item.name, `${career}'s ${item.name} is named for the night`);
      assert.ok(!/mail|plate|leather|hide|padded|sword|greataxe|handaxe|bow|arrow|crossbow|rapier|mace|javelin/i.test(item.name), `${career} carries no medieval ${item.name}`);
    }
    const shooter = sheet.equipment.find((item) => matchWeapon(item)?.properties?.includes("ammunition"));
    if (shooter) {
      assert.ok(sheet.equipment.some((item) => ammoKindForItem(item) === ammoKindForWeapon(matchWeapon(shooter).name)), `${career}'s ${shooter.name} is loaded`);
    }
    // The light pack, under the 5e rows it stands for, passes the door as it
    // is (the signature item, free text, goes on after the door and is
    // never judged), and the door does not refill it. Its names are the
    // night's alone: a card is claimed without the door (src/lib/couch/
    // play.ts), and an edit's door takes the rows a sheet already carries.
    const pack = sheet.equipment.slice(1).map(({ srdName, ...item }) => ({ ...item, name: srdName ?? item.name }));
    const again = tableJudge(campaign)({ ...sheet, equipment: pack });
    assert.deepEqual(again?.equipment.map((item) => item.name), pack.map((item) => item.name), `${career}'s light pack passes the door as it is`);
    if (career === "Medic") {
      assert.ok(sheet.proficiencies.skills.includes("medicine"), "the medic has Medicine");
    }
  }
});

await test("a build the door refuses falls back to the nearest ready-made hero, reskinned", () => {
  const member = logic.readForge(JSON.stringify(FORGE), 1).forge.crew[0];
  const campaign = { ...world.campaign(), gameSettings: logic.couchGameSettings("") };
  const judge = tableJudge(campaign);
  // The door turns the engine's build away; the reskin is what is left.
  const sheet = forgeMod.crewSheet(member, (input) => (input.background === "soldier" && input.equipment.some((item) => /chain mail/i.test(item.name)) && input.maxHp === 12 ? judge(input) : null), counter());
  assert.ok(sheet, "the pregen was used");
  assert.equal(sheet.name, "Kara Voss");
  assert.equal(sheet.class, "fighter", "Kara, the fighter, the Marine's nearest");
  assert.deepEqual(sheet.agenda.acts, member.agenda);
  assert.equal(sheet.crewRole, member.crewRole);
});

// ---- the night ----

async function call(mod, method, user, body, params = {}, search = "") {
  world.signIn(user);
  const response = await mod[method](
    new Request(`http://test/${search}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    { params: Promise.resolve(params) },
  );
  return { status: response.status, body: await response.json() };
}

async function settled(campaignId) {
  for (let tries = 0; tries < 400; tries += 1) {
    if (!forgeMod.forgeRunning(campaignId)) return store.getCouchForge(campaignId);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the forge never settled");
}

const routes = {
  create: await world.route("couch"),
  view: await world.route("campaigns/[campaignId]/couch"),
  claim: await world.route("campaigns/[campaignId]/couch/claim"),
  intro: await world.route("campaigns/[campaignId]/couch/intro"),
  reforge: await world.route("campaigns/[campaignId]/couch/reforge"),
  campaign: await world.route("campaigns/[campaignId]"),
};
const tv = world.addUser("tv");
const [ana, ben, cal] = [world.addUser("ana"), world.addUser("ben"), world.addUser("cal")];
let night = "";

await test("Start makes an AI-run couch campaign with the TV as its lead, and answers before the forge is done", async () => {
  model.script([forgeReply()]);
  const bad = await call(routes.create, "POST", tv, { seed: "x".repeat(601), players: 3 });
  assert.equal(bad.status, 400);
  assert.equal((await call(routes.create, "POST", tv, { players: 6 })).status, 400);
  const made = await call(routes.create, "POST", tv, { seed: "A research tug with its lights on", players: 3, offLimits: "spiders" });
  assert.equal(made.status, 201, made.body.error);
  night = made.body.campaignId;
  assert.ok(night);
  const campaign = campaigns.getCampaignById(night);
  assert.equal(campaign.leadUserId, tv.id);
  assert.equal(campaign.gameSettings.couchMode, true);
  assert.equal(campaign.gameSettings.dmMode, "ai");
  assert.equal(campaign.maxPlayers, 4, "three phones and the TV");
  assert.deepEqual(campaign.gameSettings.safety.lines, ["spiders"]);
  assert.equal(campaign.settings.imageGenerationEnabled, true);
  assert.equal(sheets.listSheets(night).length, 0, "the TV plays no character");
  const forge = await settled(night);
  assert.equal(forge.status, "ready", forge.error);
  const request = model.requests.at(-1);
  assert.match(request.messages[0].content, /exactly 3, ordinary working people/);
  assert.match(request.messages[0].content, /Off limits tonight[^\n]*spiders/);
  assert.match(request.messages[1].content, /A research tug with its lights on/);
});

await test("the forge writes the title, the GM's outline without anyone's secret, and the art direction", () => {
  const campaign = campaigns.getCampaignById(night);
  assert.equal(campaign.title, FORGE.scenario.title);
  assert.equal(campaign.description, FORGE.scenario.logline);
  assert.match(campaign.dmOutline, /COUCH ONE-SHOT "The Quiet of the Tamsin Reach"/);
  assert.match(campaign.dmOutline, /The truth \(never tell it; let the crew dig it out\): The Halden carried a spore colony/);
  assert.match(campaign.dmOutline, /Act 3 "The Shuttle": Get off the Tamsin Reach alive\./);
  assert.match(campaign.dmOutline, /Captain Ilse Marr \(captain\)/);
  assert.match(campaign.dmOutline, /Halden airlock: frost on the inner door/);
  assert.match(campaign.dmOutline, /Twist \(spring it mid-act\): The Halden's beacon was switched on by the Combine/);
  assert.match(campaign.dmOutline, /Foes \(bring each in its act[^\n]*\n- act 1: Spore-ridden tug crew: Grey-skinned/);
  assert.doesNotMatch(campaign.dmOutline, /Combine synthetic|Recover a living sample|sample case sealed/, "agendas and the hidden role ride the sheets, not the outline");
  assert.equal(campaign.settings.artStyle, "custom");
  assert.equal(campaign.settings.artStyleScene, FORGE.styleLock);
  const ready = latestEventOfType(night, ["campaign_updated"]);
  assert.equal(ready.payload.couchStatus, "ready", "the lobbies are told");
});

await test("the lobby shows the scenario's public face and the cards, and nothing secret", async () => {
  const view = await call(routes.view, "GET", tv, undefined, { campaignId: night });
  assert.equal(view.status, 200);
  assert.deepEqual(Object.keys(view.body).sort(), ["crew", "error", "intro", "scenario", "status"]);
  assert.equal(view.body.intro.step, 0, "the TV opens on the briefing");
  assert.equal(view.body.intro.total, 4, "the briefing and three crew members");
  assert.match(view.body.intro.key, /^[0-9a-f]{16}$/);
  assert.equal(view.body.status, "ready");
  assert.equal(view.body.error, "");
  assert.deepEqual(view.body.scenario, { title: FORGE.scenario.title, logline: FORGE.scenario.logline, briefing: FORGE.scenario.briefing });
  assert.equal(view.body.crew.length, 3);
  for (const card of view.body.crew) {
    assert.deepEqual(Object.keys(card).sort(), ["backstory", "claimedBy", "crewRole", "id", "name", "personality", "portraitUrl", "signatureItem", "ties"]);
    assert.equal(card.claimedBy, null);
    assert.equal(card.portraitUrl, null, "no painter here, so no portrait");
  }
  assert.deepEqual(view.body.crew.map((card) => card.name), ["Kara Voss", "Brakk Oduya", "Lio Tanaka"]);
  assert.equal(view.body.crew[2].crewRole, "Combine liaison, along for the audit");
  // What the TV introduces them with: the backstory without its ties line,
  // which comes apart, only toward someone at the table.
  const kara = view.body.crew[0];
  assert.equal(kara.backstory, crewMember().backstory);
  assert.equal(kara.personality, "Dry, loyal, stubborn; flaw: never admits fear.");
  assert.equal(kara.signatureItem, "Dented steel thermos");
  assert.deepEqual(kara.ties, [{ to: "Brakk Oduya", line: "owes him her life" }]);
  const text = JSON.stringify(view.body);
  assert.doesNotMatch(text, /synthetic|Recover a living sample|spore colony|sample case/, "no agenda, hidden role or truth");
  const outsider = await call(routes.view, "GET", world.addUser("outsider"), undefined, { campaignId: night });
  assert.equal(outsider.status, 404, "members only");
  const plain = await call(routes.view, "GET", world.owner, undefined, { campaignId: world.campaignId });
  assert.equal(plain.status, 404, "an ordinary table has no couch lobby");
});

await test("the cards open once the TV has introduced the crew, and only the lead moves it on", async () => {
  const campaign = campaigns.getCampaignById(night);
  for (const user of [ana, ben, cal]) {
    assert.ok(!("error" in campaigns.joinByInviteCode(user.id, campaign.inviteCode)));
  }
  const params = { campaignId: night };
  const card = store.listCouchCrew(night)[0];
  const early = await call(routes.claim, "POST", ana, { crewId: card.id }, params);
  assert.equal(early.status, 409, "no card is taken during the introductions");
  assert.match(early.body.error, /introduced on the TV/);
  assert.equal((await call(routes.intro, "POST", ana, { from: 0, to: 1 }, params)).status, 403, "a phone does not move the TV on");
  assert.equal((await call(routes.intro, "POST", tv, { from: 0, to: 9 }, params)).status, 400, "not past the last step");
  const moved = await call(routes.intro, "POST", tv, { from: 0, to: 1 }, params);
  assert.equal(moved.status, 200, moved.body.error);
  const stale = await call(routes.intro, "POST", tv, { from: 0, to: 1 }, params);
  assert.equal(stale.status, 409, "a second TV tab finishing the same clip moves it once");
  assert.equal(stale.body.step, 1);
  assert.equal(latestEventOfType(night, ["campaign_updated"]).payload.couchStatus, "ready", "the phones are told to read again");
  const view = await call(routes.view, "GET", ana, undefined, params);
  assert.equal(view.body.intro.step, 1, "on the first crew member");
  // With narration off there is nothing to hear: the TV reads each step on
  // a timer instead.
  assert.equal((await call(routes.intro, "GET", tv, undefined, params, "?step=1")).status, 409);
  assert.equal((await call(routes.intro, "POST", tv, { from: 1, to: 4 }, params)).status, 200, "Skip to choosing");
  assert.equal((await call(routes.view, "GET", ana, undefined, params)).body.intro.step, 4);
});

let cards = [];
await test("a card is claimed once, one per player, never by the TV, and seats the sheet with its agenda", async () => {
  cards = store.listCouchCrew(night);
  const params = { campaignId: night };
  assert.equal((await call(routes.claim, "POST", ana, {}, params)).status, 400);
  const byTv = await call(routes.claim, "POST", tv, { crewId: cards[0].id }, params);
  assert.equal(byTv.status, 409, "the TV plays no character");
  assert.match(byTv.body.error, /TV/);
  const first = await call(routes.claim, "POST", ana, { crewId: cards[2].id }, params);
  assert.equal(first.status, 200, first.body.error);
  assert.equal(first.body.ok, true);
  const sheet = sheets.getSheetById(first.body.sheetId);
  assert.equal(sheet.userId, ana.id);
  assert.equal(sheet.name, "Lio Tanaka");
  assert.equal(sheet.agenda.hiddenRole, HIDDEN);
  assert.equal(sheet.agenda.act, 0);
  assert.equal(sheet.crewRole, "Combine liaison, along for the audit");
  assert.equal(sheet.level, 1);
  assert.equal(campaigns.getMember(night, ana.id).ready, true, "choosing the card is readying up");
  const taken = await call(routes.claim, "POST", ben, { crewId: cards[2].id }, params);
  assert.equal(taken.status, 409);
  assert.match(taken.body.error, /Lio Tanaka is already taken/);
  const second = await call(routes.claim, "POST", ana, { crewId: cards[0].id }, params);
  assert.equal(second.status, 409, "one card each");
  assert.equal((await call(routes.claim, "POST", ben, { crewId: "nope" }, params)).status, 404);
  const view = await call(routes.view, "GET", ben, undefined, params);
  assert.deepEqual(view.body.crew[2].claimedBy, { userId: ana.id, name: ana.username });
  // The other phones are sent the sheet without the agenda.
  const snapshot = await call(routes.campaign, "GET", ben, undefined, params);
  assert.equal(snapshot.body.sheets.find((entry) => entry.id === sheet.id).agenda, null);
  assert.doesNotMatch(JSON.stringify(snapshot.body), /Combine synthetic|Recover a living sample/);
});

await test("a forge that already has a taken card is not asked again, and only the lead may ask", async () => {
  const params = { campaignId: night };
  assert.equal((await call(routes.reforge, "POST", ana, undefined, params)).status, 403);
  const kept = await call(routes.reforge, "POST", tv, undefined, params);
  assert.equal(kept.status, 409);
  assert.match(kept.body.error, /already taken/);
});

await test("Begin waits for everyone who joined, then opens with the TV holding nothing", async () => {
  const params = { campaignId: night };
  const early = await call(routes.campaign, "PATCH", tv, { status: "active" }, params);
  assert.equal(early.status, 400);
  assert.match(early.body.error, /crew card/);
  assert.equal((await call(routes.claim, "POST", ben, { crewId: cards[0].id }, params)).status, 200);
  assert.equal((await call(routes.claim, "POST", cal, { crewId: cards[1].id }, params)).status, 200);
  model.script([]);
  const begun = await call(routes.campaign, "PATCH", tv, { status: "active" }, params);
  assert.equal(begun.status, 200, begun.body.error);
  assert.equal(sheets.getSheetForUser(night, tv.id), null);
  // The opening scene runs on the scripted model; it is done before the
  // next test scripts the forge's replies.
  await settleQueue(night);
  const tasks = model.requests.map((request) => request.messages?.[0]?.content ?? "");
  assert.ok(!tasks.some((content) => /You design the seed of a D&D 5e campaign/.test(content)), "no setup pass over the forge's outline");
});

const whispersFor = (userId) =>
  getDatabase().prepare(`SELECT content FROM dm_whispers WHERE campaign_id = ? AND user_id = ? ORDER BY created_at`).all(night, userId).map((row) => row.content);

await test("the act turns for every crew member, each told their new agenda privately, and the TV shows the act", () => {
  assert.equal(play.advanceCouchAct(night), 1);
  const lio = sheets.getSheetForUser(night, ana.id);
  const kara = sheets.getSheetForUser(night, ben.id);
  assert.equal(lio.agenda.act, 1);
  assert.equal(kara.agenda.act, 1);
  assert.deepEqual(whispersFor(ana.id), ["Act II begins. Your agenda now: Keep the crew from destroying it."]);
  assert.deepEqual(whispersFor(ben.id), ["Act II begins. Your agenda now: Make sure Dana never reaches the radio."]);
  assert.deepEqual(whispersFor(tv.id), [], "the TV is never whispered");
  const card = latestEventOfType(night, ["title_card"]);
  assert.equal(card.payload.title, "Act II");
  assert.equal(card.payload.subtitle, "Something Aboard");
  assert.equal(card.payload.tone, "act");
  assert.equal(play.advanceCouchAct(night), 2);
  assert.equal(play.advanceCouchAct(night), 2, "nothing past the last act");
  assert.equal(whispersFor(ana.id).length, 2, "the last act is told once");
  assert.equal(sheets.getSheetForUser(night, ana.id).agenda.act, 2);
});

await test("a story point lands on the crew member's agenda, three at most (ALIEN's cap), and only on crew", () => {
  const lio = sheets.getSheetForUser(night, ana.id);
  assert.deepEqual(play.awardStoryPoint(night, lio.id), { ok: true, storyPoints: 1 });
  assert.equal(sheets.getSheetById(lio.id).agenda.storyPoints, 1);
  for (let index = 0; index < 12; index += 1) play.awardStoryPoint(night, lio.id);
  assert.equal(sheets.getSheetById(lio.id).agenda.storyPoints, 3);
  // A night from before the cap keeps what it holds.
  sheets.setSheetAgenda(lio.id, { ...sheets.getSheetById(lio.id).agenda, storyPoints: 4 });
  assert.deepEqual(play.awardStoryPoint(night, lio.id), { ok: true, storyPoints: 4 });
  assert.equal(play.awardStoryPoint(night, "nobody").ok, false);
  const other = world.addHero({ name: "Elsewhere" });
  assert.equal(play.awardStoryPoint(night, other.id).ok, false, "another table's sheet");
});

await test("a reply that cannot be read is asked once more with the reason, and a second failure fails the night plainly", async () => {
  const user = world.addUser("tv2");
  model.script([reply({ text: "Sorry, no." }), forgeReply()]);
  const made = await call(routes.create, "POST", user, { seed: "", players: 3 });
  assert.equal(made.status, 201);
  const forge = await settled(made.body.campaignId);
  assert.equal(forge.status, "ready", forge.error);
  assert.match(model.requests.at(-1).messages[1].content, /Your last reply could not be used: The reply was not a JSON object\./);
  assert.match(model.requests.at(-1).messages[1].content, /surprise us/);

  model.script([reply({ text: "nope" }), reply({ text: "{}" })]);
  const failing = await call(routes.create, "POST", user, { players: 2 });
  const failed = await settled(failing.body.campaignId);
  assert.equal(failed.status, "failed");
  const view = await call(routes.view, "GET", user, undefined, { campaignId: failing.body.campaignId });
  assert.equal(view.body.status, "failed");
  assert.match(view.body.error, /could not be read/);
  assert.deepEqual(view.body.crew, []);
  assert.equal(view.body.scenario, null);

  model.script([forgeReply()]);
  const again = await call(routes.reforge, "POST", user, undefined, { campaignId: failing.body.campaignId });
  assert.equal(again.status, 200, again.body.error);
  const redone = await settled(failing.body.campaignId);
  assert.equal(redone.status, "ready", redone.error);
  assert.equal(store.listCouchCrew(failing.body.campaignId).length, 2, "two players, two cards");
  // A friend who takes a card after the acts have turned starts on the act
  // the rest of the crew is on.
  const late = world.addUser("late");
  assert.ok(!("error" in campaigns.joinByInviteCode(late.id, campaigns.getCampaignById(failing.body.campaignId).inviteCode)));
  assert.equal(play.advanceCouchAct(failing.body.campaignId), 1);
  assert.equal((await call(routes.intro, "POST", user, { from: 0, to: 3 }, { campaignId: failing.body.campaignId })).status, 200);
  const claimed = await call(routes.claim, "POST", late, { crewId: store.listCouchCrew(failing.body.campaignId)[0].id }, { campaignId: failing.body.campaignId });
  assert.equal(claimed.status, 200, claimed.body.error);
  assert.equal(sheets.getSheetById(claimed.body.sheetId).agenda.act, 1);
});

await test("a forge a restart cut off reads as failed, so the lead can ask again", async () => {
  const user = world.addUser("tv3");
  const campaign = campaigns.createCampaign(user.id, { title: "Cut off", description: "", theme: "", maxPlayers: 4, startingLevel: 1, difficulty: "normal", gameSettings: logic.couchGameSettings("") });
  store.beginCouchForge(campaign.id, { players: 3, seed: "", offLimits: "" });
  const view = await call(routes.view, "GET", user, undefined, { campaignId: campaign.id });
  assert.equal(view.body.status, "failed");
  assert.match(view.body.error, /restarted/);
});

// ---- the ready-made nights ----

const readyCards = await import("../src/lib/couch/scenario-cards.ts");
const written = await import("../src/lib/couch/scenarios/index.ts");

await test("every ready-made card has its story and every story its card", () => {
  assert.deepEqual(
    readyCards.SCENARIO_CARDS.map((card) => card.id).sort(),
    written.WRITTEN_SCENARIOS.map((scenario) => scenario.id).sort(),
  );
  for (const card of readyCards.SCENARIO_CARDS) {
    assert.ok(card.players.min >= 1 && card.players.max <= 5 && card.players.min <= card.players.max, card.id);
    assert.ok(written.writtenScenario(card.id).reply.crew.length >= card.players.max, `${card.id} writes a crew for its largest table`);
    // A card without its painted cover shows an empty gradient in the picker:
    // paint it with scripts/paint-scenario-covers.mjs.
    assert.ok(existsSync(new URL(`../public${readyCards.scenarioCover(card)}`, import.meta.url)), `${card.id} has its cover painted`);
  }
});

await test("a ready-made story reads whole at every table size it offers: nothing cut, one hidden role, and no agenda names someone not seated", () => {
  for (const card of readyCards.SCENARIO_CARDS) {
    const raw = written.writtenScenario(card.id).reply;
    const everyone = raw.crew.map((member) => member.name);
    for (let players = card.players.min; players <= card.players.max; players += 1) {
      const read = written.writtenForge(card.id, players);
      assert.ok(!("error" in read), `${card.id} for ${players}: ${read.error}`);
      const { forge } = read;
      assert.equal(forge.crew.length, players);
      assert.equal(forge.crew.filter((member) => member.hiddenRole).length, 1, `${card.id} for ${players} keeps its hidden role`);
      // Read exactly as written: the reader's length limits cut nothing.
      assert.equal(forge.scenario.briefing, raw.scenario.briefing, `${card.id} briefing`);
      assert.equal(forge.scenario.truth, raw.scenario.truth, `${card.id} truth`);
      assert.equal(forge.scenario.acts.length, 3);
      assert.deepEqual(forge.scenario.acts, raw.scenario.acts, `${card.id} acts`);
      assert.deepEqual(forge.scenario.cast, raw.scenario.cast, `${card.id} cast`);
      assert.deepEqual(forge.scenario.locations, raw.scenario.locations, `${card.id} locations`);
      assert.deepEqual(forge.scenario.foes, raw.scenario.foes, `${card.id} foes`);
      assert.equal(forge.styleLock, raw.styleLock);
      const absent = everyone.slice(players).map((name) => name.split(" ")[0]);
      forge.crew.forEach((member, index) => {
        const source = raw.crew[index];
        assert.equal(member.career, source.career, `${member.name}'s career is one of the eight`);
        assert.equal(member.look, source.look, `${member.name}'s look`);
        assert.equal(member.backstory, source.backstory, `${member.name}'s backstory`);
        assert.deepEqual(member.agenda, source.agenda, `${member.name}'s agenda`);
        for (const name of absent) {
          for (const agenda of member.agenda) {
            assert.doesNotMatch(agenda, new RegExp(`\\b${name}\\b`), `${card.id} for ${players}: ${member.name} is sent after ${name}, who is not seated`);
          }
        }
        assert.ok(member.relationships.every((tie) => !absent.includes(tie.to.split(" ")[0])), `${member.name}'s ties are to the seated crew`);
      });
    }
    assert.match(written.writtenForge(card.id, card.players.max + 1).error ?? "", /is written for/);
    // Every act has its twist and something to fight, and the cast is full.
    assert.ok(raw.scenario.acts.every((act) => act.twist), `${card.id}: a twist in every act`);
    assert.deepEqual([...new Set(raw.scenario.foes.map((foe) => foe.act))].sort(), [1, 2, 3], `${card.id}: foes in every act`);
    assert.ok(raw.scenario.cast.length >= 4 && raw.scenario.cast.length <= 6, `${card.id}: ${raw.scenario.cast.length} cast`);
  }
  // The short test night runs its act clock to forty-five minutes.
  const short = written.writtenForge("dead-air", 3).forge;
  assert.equal(short.scenario.minutes, 45);
  assert.match(logic.couchOutline(short), /three acts, about 45 minutes; land the ending in act 3/);
  assert.equal(written.writtenForge("unto-us", 3).forge.scenario.minutes, undefined, "a full night says nothing");
  assert.match(logic.couchOutline(written.writtenForge("unto-us", 3).forge), /about two and a half hours/);
  assert.match(written.writtenForge("nope", 3).error, /not on this server/);
});

await test("every ready-made crew member becomes a sheet the table admits", () => {
  const campaign = campaigns.getCampaignById(world.campaignId);
  const judge = (sheet) => {
    const verdict = admitSheet({ door: "table", level: 1, sheet, userId: campaign.ownerUserId, campaign });
    return verdict.ok ? verdict.sheet : null;
  };
  for (const card of readyCards.SCENARIO_CARDS) {
    for (const member of written.writtenForge(card.id, card.players.max).forge.crew) {
      const sheet = forgeMod.crewSheet(member, judge);
      assert.ok(sheet, `${card.id}: ${member.name}`);
      assert.deepEqual(sheet.agenda.acts, member.agenda);
    }
  }
});

await test("Start with a ready-made story seats its crew without asking the story model, and a reforge reads it again", async () => {
  const user = world.addUser("tv-ready");
  const before = model.requests.length;
  assert.equal((await call(routes.create, "POST", user, { scenario: "nope", players: 3 })).status, 400);
  assert.equal((await call(routes.create, "POST", user, { scenario: "good-shepherd", players: 1 })).status, 400, "below its crew");
  const made = await call(routes.create, "POST", user, { scenario: "good-shepherd", seed: "ignored", players: 4, offLimits: "spiders" });
  assert.equal(made.status, 201, made.body.error);
  const forge = await settled(made.body.campaignId);
  assert.equal(forge.status, "ready", forge.error);
  assert.equal(forge.scenarioId, "good-shepherd");
  assert.equal(forge.seed, "", "the seed is not read for a written story");
  assert.equal(model.requests.length, before, "no model call");
  const campaign = campaigns.getCampaignById(made.body.campaignId);
  assert.equal(campaign.title, "The Good Shepherd");
  assert.deepEqual(campaign.gameSettings.safety.lines, ["spiders"]);
  assert.match(campaign.dmOutline, /COUCH ONE-SHOT "The Good Shepherd"/);
  assert.equal(store.listCouchCrew(made.body.campaignId).length, 4);
  const view = await call(routes.view, "GET", user, undefined, { campaignId: made.body.campaignId });
  assert.doesNotMatch(JSON.stringify(view.body), /Concord Combine plant|inhibitor/, "the lobby shows no secret");

  const again = await call(routes.reforge, "POST", user, undefined, { campaignId: made.body.campaignId });
  assert.equal(again.status, 200, again.body.error);
  const redone = await settled(made.body.campaignId);
  assert.equal(redone.status, "ready", redone.error);
  assert.equal(redone.scenarioId, "good-shepherd");
  assert.equal(model.requests.length, before);
});

model.close();
finish();
