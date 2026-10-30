// Couch mode's picture of every GM turn (docs/couch-mode-spec.md 2.4),
// through a real DM turn with the scripted fake agent (HARNESS_FAKE) as the
// storyteller and the painter. Before, a picture came only when the
// narrator thought to ask, and nothing kept a face from one picture to the
// next. Now the passage is framed as one shot, the people in it are painted
// from their portraits, the narrator is not also offered generate_image,
// and when turns come faster than pictures only the newest one waits. A
// thing found in the place on screen is painted as an insert beside it.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { removeTempDir } from "./lib/remove-temp-dir.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odm-couch-pictures-"));
const scriptFile = path.join(dir, "script.json");
process.env.SQLITE_DB_PATH = path.join(dir, "test.sqlite");
process.env.DB_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.HARNESS_FAKE = "1";
process.env.HARNESS_FAKE_SCRIPT = scriptFile;
process.env.DM_THINKING = "0";
process.env.TTS_PROVIDER = "off";
const setScript = (turns) => fs.writeFileSync(scriptFile, JSON.stringify(turns));
// Pictures and portraits live under <cwd>/public.
const home = process.cwd();
register(pathToFileURL(path.join(home, "scripts", "lib", "register-alias.mjs")).href, pathToFileURL(path.join(home, "scripts", "x.mjs")).href);
process.chdir(dir);

const { saveGlobalConfig } = await import("../src/lib/db/app-settings.ts");
const { createUser } = await import("../src/lib/db/users.ts");
const { createCampaign, setCampaignStatus, updateStorySettings, updateGameSettings, allocateSeq, getCampaignById } =
  await import("../src/lib/db/campaigns.ts");
const { createSheet, patchSheet } = await import("../src/lib/db/sheets.ts");
const { upsertNpc, setNpcPortrait } = await import("../src/lib/db/npcs.ts");
const { upsertCurrentLocation } = await import("../src/lib/db/locations.ts");
const { createSheetSchema } = await import("../src/lib/schemas/sheet.ts");
const { insertCampaignMessage, getLatestDmMessage, getCampaignMessage } = await import("../src/lib/db/messages.ts");
const { startDmTurn, dmTurnTools } = await import("../src/lib/dm/turn.ts");
const { fulfillSceneShot, handleGenerateImage, sceneShotRequest } = await import("../src/lib/dm/images.ts");
const { planSceneShot, sceneShotCast } = await import("../src/lib/dm/scene-shot.ts");
const { enqueueMediaJob, mediaQueueStats } = await import("../src/lib/media-queue.ts");
const { fakePng } = await import("../src/lib/harness/adapters/fake.ts");
const { handleMcpRequest } = await import("../src/lib/agents/mcp-server.ts");
const { subscribe } = await import("../src/lib/events.ts");
const { imageVariantsSettled } = await import("../src/lib/image-variants.ts");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok: ${name}`);
}

async function until(check, what, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = check();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

// The fake agent reaches the table's tools through ODM's MCP route.
const mcp = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const response = await handleMcpRequest(
    new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise((resolve) => mcp.listen(0, "127.0.0.1", resolve));
process.env.HARNESS_MCP_URL = `http://127.0.0.1:${mcp.address().port}/api/mcp`;

const log = () => globalThis.__odmFakeHarnessLog ?? [];
// The picture runs since the log was cleared: what each was handed.
function pictureRuns() {
  const runs = [];
  for (const entry of log()) {
    if (entry.kind === "start") {
      runs.push(entry.detail.images ? { pictures: [], prompt: "", system: entry.detail.system } : null);
    } else if (runs.at(-1) && entry.kind === "pictures") {
      runs.at(-1).pictures = entry.detail;
    } else if (runs.at(-1) && entry.kind === "prompt" && !runs.at(-1).prompt) {
      runs.at(-1).prompt = entry.detail;
    }
  }
  return runs.filter(Boolean);
}

const NARRATION = [
  "The cargo lift groans to a halt on C-deck. The lights here run on the emergency circuit, a dull red that makes every shadow twice as deep.",
  "Water drips somewhere in the dark. Kara crouches by the airlock and runs a gloved finger through a dark smear on the floor; it is still warm.",
  "Behind her, Hope watches from the doorway, not blinking, his smile fixed. Somewhere beyond the bulkhead, something heavy shifts its weight.",
].join("\n\n");

try {
  const lead = createUser("rowan", "x", { isAdmin: true });
  saveGlobalConfig({
    harness: { id: "codex", model: "fake-model", images: "native", imagesVerifiedAt: new Date().toISOString() },
    text: { provider: "harness" },
    images: { defaultBackend: "harness" },
  });
  const campaign = createCampaign(lead.id, {
    title: "Dead Signal",
    description: "A salvage crew answers a distress call.",
    theme: "sci-fi horror",
    maxPlayers: 4,
    startingLevel: 1,
    difficulty: "normal",
    gameSettings: {},
  });
  updateGameSettings(campaign.id, { couchMode: true });
  updateStorySettings(campaign.id, {
    textProvider: "harness",
    imageBackend: "harness",
    imageGenerationEnabled: true,
    autoImages: true,
    artStyle: "custom",
    artStyleScene: "late-70s sci-fi film still, 35mm grain",
  });
  setCampaignStatus(campaign.id, "active");
  const kara = createSheet(
    campaign.id,
    lead.id,
    1,
    createSheetSchema.parse({
      name: "Kara Voss",
      race: "human",
      class: "fighter",
      gender: "Female",
      appearance: "a wiry woman in her forties, shaved head, burn scar on her left cheek",
      abilities: { str: 14, dex: 15, con: 13, int: 12, wis: 12, cha: 10 },
      maxHp: 12,
      ac: 14,
      hitDice: { die: "d10", total: 1, spent: 0 },
      proficiencies: { saves: ["str", "con"], skills: ["athletics"], languages: ["common"], tools: [], armor: [], weapons: [] },
      equipment: [],
      gold: 5,
    }),
  );
  fs.mkdirSync(path.join(dir, "public", "uploads"), { recursive: true });
  // The server's own cwd, as it builds the path (macOS's temp folder is a link).
  const karaFace = path.join(process.cwd(), "public", "uploads", "kara-face.png");
  fs.writeFileSync(karaFace, fakePng(16, 16));
  patchSheet(kara.id, { portrait: { url: "/uploads/kara-face.png" } });
  // A face the row names but the disk no longer has: left out, not fatal.
  const hope = upsertNpc({ campaignId: campaign.id, name: "Hope", trait: "a fixed smile", gender: "Male" });
  setNpcPortrait(hope.id, "/uploads/hope-face.png");
  const table = () => getCampaignById(campaign.id);
  const names = (tools) => tools.map((tool) => tool.function.name);

  await test("couch mode offers the narrator no generate_image; a table out of couch mode still has it", () => {
    assert.ok(!names(dmTurnTools(table(), false, true, false)).includes("generate_image"));
    updateGameSettings(campaign.id, { couchMode: false });
    assert.ok(names(dmTurnTools(table(), false, true, false)).includes("generate_image"));
    updateGameSettings(campaign.id, { couchMode: true });
  });

  await test("a scene earns a wide picture; a line, table talk, or a table that paints nothing does not", () => {
    assert.deepEqual(
      { ...sceneShotRequest(table(), NARRATION), prompt: undefined },
      { needed: true, prompt: undefined, mode: table().settings.imageMode, backend: "harness", aspect: "landscape", reason: "scene", characterIds: [] },
    );
    assert.equal(sceneShotRequest(table(), "You wait."), undefined);
    assert.equal(sceneShotRequest(table(), `(ooc) ${"A push costs one stress. ".repeat(10)}`), undefined);
    assert.equal(sceneShotRequest({ ...table(), gameSettings: { ...table().gameSettings, couchMode: false } }, NARRATION), undefined);
    assert.equal(sceneShotRequest({ ...table(), settings: { ...table().settings, autoImages: false } }, NARRATION), undefined, "Auto scenes off");
    assert.equal(sceneShotRequest({ ...table(), settings: { ...table().settings, imageGenerationEnabled: false } }, NARRATION), undefined);
  });

  await test("a GM turn's passage is painted with the faces of the people in frame", async () => {
    insertCampaignMessage({
      campaignId: campaign.id,
      seq: allocateSeq(campaign.id),
      authorType: "player",
      userId: lead.id,
      characterId: kara.id,
      content: "I check the airlock.",
    });
    const ready = [];
    const off = subscribe(campaign.id, (chunk) => {
      if (/event: image_ready/.test(chunk)) ready.push(JSON.parse(/data: (.*)/.exec(chunk)?.[1] ?? "{}"));
    });
    // The paint step only paints in a picture run (its image tool on): the
    // turn narrates, the shot planner gets prose back and frames the
    // passage itself, and the picture run paints.
    setScript([[{ paint: [48, 32] }, { text: NARRATION }]]);
    globalThis.__odmFakeHarnessLog = [];
    await startDmTurn(campaign.id);
    const turnTools = log().find((entry) => entry.kind === "tools")?.detail ?? [];
    assert.ok(turnTools.length > 0 && !turnTools.includes("generate_image"), "the narrator was offered generate_image");
    const message = await until(() => {
      const latest = getLatestDmMessage(campaign.id);
      return latest?.generatedImage ? latest : null;
    }, "the passage's picture");
    off();
    assert.match(message.content, /Kara crouches by the airlock/);
    assert.equal(message.imageRequest.reason, "scene");
    assert.equal(message.imageRequest.aspect, "landscape");
    assert.equal(message.generatedImage.backend, "harness");
    assert.equal(message.generatedImage.width, 48);
    assert.ok(fs.existsSync(path.join(dir, "public", message.generatedImage.url)));
    assert.deepEqual(ready.map((event) => event.messageId), [message.id], "every device's background follows image_ready");
    const runs = pictureRuns();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].pictures, [karaFace], "Kara's portrait rides along; Hope's missing file is left out");
    assert.match(runs[0].system, /attached pictures are references/);
    assert.match(runs[0].prompt, /^Reference 1 is Kara Voss: keep their face/);
    assert.match(runs[0].prompt, /\nDraw: late-70s sci-fi film still, 35mm grain\. Medium shot: Water drips somewhere in the dark\. Kara crouches/);
    assert.match(
      runs[0].prompt,
      /Kara Voss: a wiry woman in her forties, shaved head, burn scar on her left cheek\./,
      "the look rides in the words too, for a backend without references",
    );
    assert.match(runs[0].prompt, /Shape: landscape/);
  });

  await test("the planner's frame is used when it answers, and the passage's own when it fails", async () => {
    const cast = sceneShotCast(campaign.id, NARRATION);
    assert.deepEqual(cast.map((member) => member.name), ["Kara Voss", "Hope"], "the crew, and the NPCs the passage names");
    setScript([[{ text: '{"shot": "close", "subjects": ["c1"], "prompt": "Kara Voss stares at her wet glove under a failing red lamp."}' }]]);
    assert.deepEqual(await planSceneShot(table(), NARRATION, cast), {
      shot: "close",
      subjects: [kara.id],
      prompt: "Kara Voss stares at her wet glove under a failing red lamp.",
    });
    setScript([[{ fail: "crash" }]]);
    const fallback = await planSceneShot(table(), NARRATION, cast);
    assert.equal(fallback.shot, "medium");
    assert.deepEqual(fallback.subjects, [kara.id, hope.id]);
  });

  await test("when turns come faster than pictures, only the newest passage waits", async () => {
    let release = () => {};
    void enqueueMediaJob("a picture already painting", () => new Promise((resolve) => (release = resolve)));
    const passage = (text) => {
      const request = sceneShotRequest(table(), text);
      return insertCampaignMessage({ campaignId: campaign.id, seq: allocateSeq(campaign.id), authorType: "dm", content: text, imageRequest: request, speech: [] });
    };
    const older = passage(`The hatch seals behind them with a hiss. ${NARRATION}`);
    const newer = passage(`The red light gutters and dies. ${NARRATION}`);
    setScript([[{ paint: [40, 30] }, { text: "done" }]]);
    globalThis.__odmFakeHarnessLog = [];
    const settled = [
      fulfillSceneShot(campaign.id, older.id, older.imageRequest, table().settings),
      fulfillSceneShot(campaign.id, newer.id, newer.imageRequest, table().settings),
    ];
    await until(() => (mediaQueueStats().gpu?.waiting ?? 0) >= 2, "both pictures to queue");
    release();
    await Promise.all(settled);
    assert.equal(pictureRuns().length, 1, "one picture painted, not two");
    const newest = getCampaignMessage(newer.id);
    assert.ok(newest.generatedImage, "the newest passage got its picture");
    const replaced = getCampaignMessage(older.id);
    assert.ok(!replaced.generatedImage);
    assert.equal(replaced.imageRequest.needed, false, "the replaced passage's placeholder would spin forever");
    assert.equal(replaced.imageRequest.failed, undefined, "being replaced is not a failure");
  });

  await test("a find in the place on screen is painted square beside it, with nobody in it; a new place is never an insert", async () => {
    const spine = upsertCurrentLocation({ campaignId: campaign.id, name: "Docking spine", layoutDescription: "A ribbed corridor ending at the outer hatch." });
    const passage = (text) =>
      insertCampaignMessage({ campaignId: campaign.id, seq: allocateSeq(campaign.id), authorType: "dm", content: text, imageRequest: sceneShotRequest(table(), text), speech: [] });
    const plannerPrompt = () => String(log().find((entry) => entry.kind === "prompt" && String(entry.detail).includes("ON SCREEN NOW:"))?.detail ?? "");
    const FIND = [
      "Kara pries the loose panel away. Behind it she finds alignment marks and a spring-loaded collar around the coupling.",
      "The collar must be drawn outward as the wheel turns. Above the hatch, the lock timer keeps blinking amber.",
    ].join("\n\n");
    // The place, painted the turn before.
    const hatch = passage(`Kara reaches the outer hatch at the end of the spine. ${NARRATION}`);
    setScript([[{ paint: [48, 32] }, { text: '{"shot":"medium","subjects":["c1"],"prompt":"Kara crouches at the outer hatch, wrench in hand, amber light above."}' }]]);
    await fulfillSceneShot(campaign.id, hatch.id, hatch.imageRequest, table().settings);
    assert.deepEqual(getCampaignMessage(hatch.id).generatedImage.shot, {
      kind: "medium",
      frame: "Kara crouches at the outer hatch, wrench in hand, amber light above.",
      placeId: spine.id,
    }, "the framing is kept with the picture for the next turn's planner and the screens");

    const found = passage(FIND);
    setScript([[{ paint: [40, 40] }, { text: '{"shot":"insert","subjects":["c1"],"prompt":"A spring-loaded collar around a pipe coupling, alignment marks painted beside it."}' }]]);
    globalThis.__odmFakeHarnessLog = [];
    await fulfillSceneShot(campaign.id, found.id, found.imageRequest, table().settings);
    assert.match(plannerPrompt(), /ON SCREEN NOW: Kara crouches at the outer hatch, wrench in hand/, "the planner knows the hatch is up");
    const insert = getCampaignMessage(found.id).generatedImage;
    assert.equal(insert.shot.kind, "insert");
    assert.equal(insert.aspect, "square");
    const [run] = pictureRuns();
    assert.deepEqual(run.pictures, [], "a face as a reference would paint Kara instead of the collar");
    assert.match(run.prompt, /Insert shot of a detail: A spring-loaded collar/);
    assert.doesNotMatch(run.prompt, /Kara Voss:/);
    assert.match(run.prompt, /Shape: square/);

    // Through the hatch: the spine is not where the party stands, so a find
    // in the new place has no picture to sit beside and stands on its own.
    upsertCurrentLocation({ campaignId: campaign.id, name: "Warden-4 airlock", layoutDescription: "A cramped airlock, frost on every surface." });
    const through = passage(`The hatch gives at last. ${FIND}`);
    globalThis.__odmFakeHarnessLog = [];
    await fulfillSceneShot(campaign.id, through.id, through.imageRequest, table().settings);
    assert.match(plannerPrompt(), /ON SCREEN NOW: none\n/);
    const own = getCampaignMessage(through.id).generatedImage;
    assert.equal(own.shot.kind, "close");
    assert.equal(own.aspect, "landscape");
  });

  await test("the narrator's own picture keeps the faces of the characters it named", async () => {
    updateGameSettings(campaign.id, { couchMode: false });
    setScript([[{ paint: [36, 24] }, { text: "done" }]]);
    globalThis.__odmFakeHarnessLog = [];
    // The picture hangs under the newest passage, which has none yet.
    insertCampaignMessage({ campaignId: campaign.id, seq: allocateSeq(campaign.id), authorType: "dm", content: "Kara steps up to the outer door.", speech: [] });
    const result = handleGenerateImage(table(), JSON.stringify({ prompt: "A woman with a shaved head at an airlock", characterIds: [kara.id] }));
    assert.ok(result.ok, JSON.stringify(result));
    const message = await until(() => {
      const latest = getCampaignMessage(result.illustrating);
      return latest?.generatedImage ? latest : null;
    }, "the narrator's picture");
    assert.deepEqual(message.imageRequest.characterIds, [kara.id]);
    assert.deepEqual(pictureRuns()[0].pictures, [karaFace]);
    assert.match(pictureRuns()[0].prompt, /^Reference 1 is Kara Voss/);
    updateGameSettings(campaign.id, { couchMode: true });
  });

  console.log(`\n${passed} couch picture checks passed`);
} finally {
  await imageVariantsSettled();
  mcp.close();
  process.chdir(home);
  removeTempDir(dir);
}
