// Couch mode's shot planner (src/lib/dm/scene-shot-logic.ts): which GM
// passages earn a picture, the frame the passage's own last paragraphs give
// when the utility model cannot be asked, how the model's answer is read,
// and the words the picture is painted from. A passage handed to the image
// model whole came back as a collage of everything that happened in it; a
// shot is one frame of the moment the passage ends on. A thing found in the
// place on screen is an insert, shown beside that place rather than over it.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const {
  heuristicShot,
  mentionedCast,
  onScreenFrame,
  parseShotReply,
  sceneComposition,
  sceneShotPrompt,
  SCENE_SHOT_MIN_CHARS,
  shotAspect,
  SHOT_PLANNER_SYSTEM,
  shotPlannerInput,
  shotText,
  wantsSceneShot,
} = await import("../src/lib/dm/scene-shot-logic.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const kara = { id: "sheet-kara", name: "Kara Voss", look: "a wiry woman in her forties, shaved head, burn scar on her left cheek" };
const brakk = { id: "sheet-brakk", name: "Brakk Tamsin", look: "" };
const hope = { id: "npc-hope", name: "Hope", aliases: ["the synthetic"], look: "a pale man with a fixed smile" };
const sam = { id: "sheet-sam", name: "Sam Okafor", look: "a tall man with a grey beard" };
const cast = [kara, brakk, hope, sam];

const passage = [
  "The cargo lift groans to a halt on C-deck. Brakk Tamsin checks the charge on his flamer while Sam Okafor reads the deck plan aloud.",
  "[roll:abc123]",
  "Water drips somewhere in the dark. Kara crouches by the airlock and runs a gloved finger through a smear on the floor. \"It's still warm,\" she says.",
  "Behind her, Hope watches from the shadows, not blinking, his smile fixed.",
].join("\n\n");

test("a scene earns a picture; a line, a roll alone or table talk does not", () => {
  assert.equal(wantsSceneShot(passage), true);
  assert.equal(wantsSceneShot("You wait. Nothing moves."), false, "a line or two is not a new scene");
  assert.equal(wantsSceneShot(`[roll:${"x".repeat(200)}]\n\nYou hit.`), false, "the dice card's marker is not story");
  assert.equal(wantsSceneShot(`(ooc) ${"The rules say a push costs one stress. ".repeat(6)}`), false, "an out-of-character answer is table talk");
  assert.equal(wantsSceneShot("y".repeat(SCENE_SHOT_MIN_CHARS)), true);
  assert.equal(shotText("A\n\n[roll:r1]\n\nB"), "A\n\nB");
});

test("the heuristic frames the last two paragraphs and the people they name, in order", () => {
  const shot = heuristicShot(passage, cast);
  assert.deepEqual(shot.subjects, ["sheet-kara", "npc-hope"], "Brakk and Sam are named only in the first paragraph");
  assert.equal(shot.shot, "medium");
  assert.match(shot.prompt, /^Water drips somewhere in the dark\. Kara crouches by the airlock/);
  assert.match(shot.prompt, /Hope watches from the shadows/);
  assert.doesNotMatch(shot.prompt, /still warm/, "speech is heard, not seen, and an image model letters what is quoted");
  assert.doesNotMatch(shot.prompt, /roll:/);
});

test("a first or last name finds a person, case matters, and nobody named means a wide shot", () => {
  assert.deepEqual(mentionedCast("Voss swears.", cast).map((member) => member.id), ["sheet-kara"]);
  assert.deepEqual(mentionedCast("They hope the door holds.", cast), [], "the crew's Hope is not found in 'hope'");
  assert.deepEqual(mentionedCast("Then the synthetic turns.", cast).map((member) => member.id), ["npc-hope"], "an alias counts");
  assert.deepEqual(mentionedCast("Samuel waits.", cast), [], "a name inside another word is not a mention");
  const empty = heuristicShot("The corridor stretches on, lights failing one by one, steam hissing from a burst pipe somewhere ahead of the empty bulkhead.", cast);
  assert.deepEqual(empty.subjects, []);
  assert.equal(empty.shot, "wide");
});

test("at most three people are in frame, and a long passage is cut at a sentence", () => {
  const crowd = `${"Kara, Brakk, Sam and Hope stand at the hatch. ".repeat(3)}\n\n${"The hatch shudders under a blow from the other side. ".repeat(20)}`;
  const shot = heuristicShot(crowd, cast);
  assert.equal(shot.subjects.length, 3);
  assert.ok(shot.prompt.length <= 600, `prompt is ${shot.prompt.length} characters`);
  assert.match(shot.prompt, /\.$/);
});

test("the planner is asked with refs for the cast, the place, and the end of a long passage", () => {
  const input = shotPlannerInput(passage, cast, "C-deck cargo hold. A cavernous hold lined with crates.");
  assert.match(input, /^CAST:\n- c1: Kara Voss\n- c2: Brakk Tamsin\n- c3: Hope\n- c4: Sam Okafor/);
  assert.match(input, /PLACE: C-deck cargo hold\./);
  assert.match(input, /NARRATION:\nThe cargo lift groans/);
  assert.doesNotMatch(input, /roll:/);
  assert.ok(!input.includes("sheet-kara"), "ids stay out of the model's way");
  const long = shotPlannerInput(`Start of it all. ${"More happens. ".repeat(400)}The end.`, []);
  assert.match(long, /CAST:\n\(nobody\)/);
  assert.match(long, /The end\.$/);
  assert.doesNotMatch(long, /Start of it all/, "the end of a long passage is the moment on screen");
  assert.match(SHOT_PLANNER_SYSTEM, /implied, never shown/);
});

test("the planner is told what the screen shows, and that a find there is an insert beside it", () => {
  const input = shotPlannerInput(passage, cast, "C-deck cargo hold.", "Kara crouches by the airlock under red light.");
  assert.match(input, /PLACE: C-deck cargo hold\.\n\nON SCREEN NOW: Kara crouches by the airlock under red light\.\n\nNARRATION:\n/);
  assert.match(shotPlannerInput(passage, cast), /ON SCREEN NOW: none\n/, "nothing of this place painted yet");
  assert.match(SHOT_PLANNER_SYSTEM, /insert is shown beside the picture ON SCREEN NOW/);
  assert.match(SHOT_PLANNER_SYSTEM, /found, opened, read or examined/);
  assert.match(SHOT_PLANNER_SYSTEM, /ON SCREEN NOW is none.*never answer insert/);
});

test("what is on screen: the place's own frame, nothing once the party has moved on", () => {
  const hatch = { prompt: "film still. Medium shot: ...", shot: { kind: "medium", frame: "Renn crouches at the outer hatch, wrench in hand.", placeId: "spine" } };
  assert.equal(onScreenFrame(hatch, "spine"), "Renn crouches at the outer hatch, wrench in hand.");
  assert.equal(onScreenFrame(hatch, "vault"), null, "the hatch is not where the party stands now");
  assert.equal(onScreenFrame(hatch, null), "Renn crouches at the outer hatch, wrench in hand.", "a table that keeps no places");
  assert.equal(onScreenFrame(null, "spine"), null);
  assert.equal(onScreenFrame({ prompt: "A flooded stair, one lantern." }, "spine"), "A flooded stair, one lantern.", "an older picture or a person's, by its words");
  assert.equal(onScreenFrame({ prompt: "" }, "spine"), "a picture of this place");
  assert.ok(onScreenFrame({ prompt: "Long. ".repeat(200) }, null).length <= 300);
});

test("the screen's place is the newest picture that is not an insert; a newer insert stands beside it", () => {
  const picture = (url, kind) => ({ generatedImage: kind ? { url, shot: { kind, frame: url } } : { url } });
  const hatch = picture("/hatch.webp", "medium");
  const collar = picture("/collar.webp", "insert");
  assert.deepEqual(sceneComposition([hatch, { generatedImage: null }, collar]), { stage: hatch.generatedImage, insert: collar.generatedImage });
  assert.deepEqual(sceneComposition([collar, hatch]), { stage: hatch.generatedImage, insert: null }, "a place painted after the find retires it");
  assert.deepEqual(sceneComposition([picture("/upload.webp")]).stage?.url, "/upload.webp", "a picture with no shot kept is a place");
  assert.deepEqual(sceneComposition([]), { stage: null, insert: null });
});

test("an insert has nobody in it, is square, and is a close-up when there is nothing to stand beside", () => {
  const reply = '{"shot": "insert", "subjects": ["c1"], "prompt": "A spring-loaded collar around a pipe coupling, alignment marks painted beside it."}';
  const insert = parseShotReply(reply, cast);
  assert.equal(insert.shot, "insert");
  assert.deepEqual(insert.subjects, [], "a face as a reference would paint the person instead of the thing");
  assert.equal(parseShotReply(reply, cast, { onScreen: false }).shot, "close", "no place on screen for it to sit beside");
  assert.equal(parseShotReply('{"shot":"medium","subjects":["c1"],"prompt":"Kara turns the wheel by the hatch."}', cast, { onScreen: false }).shot, "medium");
  assert.equal(shotAspect("insert"), "square");
  assert.equal(shotAspect("wide"), undefined, "every other shot keeps the request's shape");
});

test("the planner's answer is read by ref, id or name; anything else is dropped", () => {
  const shot = parseShotReply(
    'Here you go:\n```json\n{"shot": "Close", "subjects": ["c1", "Hope", "sheet-sam", "c1", "c9", "Ripley"], "prompt": "Kara Voss crouches by the airlock, staring at her gloved fingertip. \\"Warm,\\" she says."}\n```',
    cast,
  );
  assert.deepEqual(shot, {
    shot: "close",
    subjects: ["sheet-kara", "npc-hope", "sheet-sam"],
    prompt: "Kara Voss crouches by the airlock, staring at her gloved fingertip. she says.",
  });
  const many = parseShotReply('{"shot":"wide","subjects":["c1","c2","c3","c4"],"prompt":"The whole crew at the hatch."}', cast);
  assert.equal(many.subjects.length, 3, "three faces at most");
  assert.deepEqual(parseShotReply('{"shot":"medium","prompt":"An empty corridor, lights failing."}', cast).subjects, []);
});

test("an unreadable answer is null, so the heuristic stands in", () => {
  assert.equal(parseShotReply("", cast), null);
  assert.equal(parseShotReply("I would show Kara at the airlock.", cast), null);
  assert.equal(parseShotReply('{"shot":"aerial","subjects":[],"prompt":"From above, the ship."}', cast), null, "an unknown shot");
  assert.equal(parseShotReply('{"shot":"wide","subjects":[],"prompt":"Ship."}', cast), null, "no prompt worth painting");
  assert.equal(parseShotReply('{"shot":"wide","subjects":[],"prompt":', cast), null);
  assert.equal(parseShotReply('["wide"]', cast), null);
});

test("the picture's words: the frame, each subject's fixed look, and danger by suggestion", () => {
  const prompt = sceneShotPrompt({ shot: "medium", subjects: ["sheet-kara", "sheet-brakk", "npc-hope"], prompt: "Kara crouches by the airlock while Hope watches" }, cast);
  assert.equal(
    prompt,
    "Medium shot: Kara crouches by the airlock while Hope watches. Kara Voss: a wiry woman in her forties, shaved head, burn scar on her left cheek. Hope: a pale man with a fixed smile. Any danger is shown by suggestion: shadows, aftermath and faces reacting.",
  );
  assert.doesNotMatch(prompt, /Brakk Tamsin:/, "no look, no line");
  assert.doesNotMatch(prompt, /gore|blood|wound/i, "a diffusion model paints the nouns it is given, negated or not");
  assert.match(sceneShotPrompt({ shot: "insert", subjects: [], prompt: "A gloved fingertip, wet and dark." }, cast), /^Insert shot of a detail: A gloved fingertip, wet and dark\. Any danger/);
});

console.log(`\n${passed} scene shot checks passed`);
