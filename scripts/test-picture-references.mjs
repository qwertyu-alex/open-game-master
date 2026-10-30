// Reference pictures for the agent program's pictures
// (src/lib/harness/picture-prompt-logic.ts, the Codex adapter's input
// items): which references a picture run may carry and the words that name
// them. Couch mode keeps the crew's faces from one turn's picture to the
// next by handing Codex their portraits (checked live on Codex 0.165.0: two
// portraits, no appearance text, both faces kept). Without the names the
// model had no way to tell whose face belonged to whom in the scene.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { removeTempDir } from "./lib/remove-temp-dir.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odm-picture-references-"));
process.env.SQLITE_DB_PATH = path.join(dir, "test.sqlite");
process.env.DB_ENCRYPTION_KEY = randomBytes(32).toString("hex");
register("./lib/register-alias.mjs", import.meta.url);

const { MAX_PICTURE_REFERENCES, pictureReferences, picturePrompt, pictureRequest } = await import(
  "../src/lib/harness/picture-prompt-logic.ts"
);
const { codexAdapter, pictureInputs } = await import("../src/lib/harness/adapters/codex.ts");
const { grokAdapter } = await import("../src/lib/harness/adapters/grok.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const face = (name) => `/srv/odm/public/uploads/${name}.png`;

try {
  test("a run carries pictures only, each once, each named, four at most", () => {
    const kept = pictureReferences([
      { path: face("kara"), label: "  Kara\n Voss " },
      { path: face("kara"), label: "Kara again" },
      { path: "/srv/odm/public/uploads/notes.pdf", label: "Not a picture" },
      { path: face("nameless"), label: "   " },
      { path: face("brakk"), label: "Brakk Tamsin" },
      { path: "/srv/odm/public/generated/galley.webp", label: "the galley", kind: "place" },
      { path: face("sam"), label: "Sam Okafor" },
      { path: face("hope"), label: "Hope" },
    ]);
    assert.deepEqual(kept, [
      { path: face("kara"), label: "Kara Voss", kind: "person" },
      { path: face("brakk"), label: "Brakk Tamsin", kind: "person" },
      { path: "/srv/odm/public/generated/galley.webp", label: "the galley", kind: "place" },
      { path: face("sam"), label: "Sam Okafor", kind: "person" },
    ]);
    assert.equal(kept.length, MAX_PICTURE_REFERENCES);
    assert.deepEqual(pictureReferences(undefined), []);
    assert.equal(pictureReferences([{ path: face("x"), label: "y".repeat(300) }])[0].label.length, 80, "a label lands in the prompt, so it is cut short");
  });

  test("without references the run is told exactly what it was told before", () => {
    assert.equal(
      picturePrompt(false),
      "You make one picture for a tabletop role-playing game. Use your image generation tool exactly once to draw what is asked, then reply with the single word done. Do not use any other tool.",
    );
    assert.equal(
      pictureRequest({ prompt: "A flooded crypt", aspect: "landscape", negative: "gore" }),
      "Draw: A flooded crypt\nShape: landscape (3:2, wider than tall).\nLeave out: gore.",
    );
    assert.equal(pictureRequest({ prompt: "A face", aspect: "square", references: [] }), "Draw: A face\nShape: square (1:1).");
  });

  test("fast images ask for a quick render while keeping aspect and reference identity", () => {
    const fast = pictureRequest({ prompt: "An original pilot", aspect: "portrait", mode: "fast" });
    assert.match(fast, /lowest supported image quality \(low\)/);
    assert.match(fast, /smallest supported size that keeps the requested shape/);
    assert.match(fast, /without refinement passes/);
    assert.match(fast, /Preserve reference identities/);
    assert.match(fast, /portrait \(2:3, taller than wide\)/);
    assert.doesNotMatch(pictureRequest({ prompt: "An original pilot", aspect: "portrait", mode: "slow" }), /lowest supported image quality/);
  });

  test("with references each one is named in the order it is attached, before what to draw", () => {
    assert.match(picturePrompt(true), /Do not use any other tool\. The attached pictures are references for who and where/);
    const text = pictureRequest({
      prompt: "Kara Voss and Brakk Tamsin in the galley",
      aspect: "landscape",
      references: pictureReferences([
        { path: face("kara"), label: "Kara Voss" },
        { path: face("brakk"), label: "Brakk Tamsin" },
        { path: "/srv/odm/public/generated/galley.png", label: "the galley", kind: "place" },
      ]),
    });
    const lines = text.split("\n");
    assert.match(lines[0], /^Reference 1 is Kara Voss: keep their face, hair, skin tone, build and clothing exactly/);
    assert.match(lines[0], /Take the pose, framing and background from the scene, not from the reference\.$/);
    assert.match(lines[1], /^Reference 2 is Brakk Tamsin: keep their face/);
    assert.equal(lines[2], "Reference 3 is the galley: keep the place's layout, materials and lighting.");
    assert.equal(lines[3], "Draw: Kara Voss and Brakk Tamsin in the galley");
    assert.equal(lines[4], "Shape: landscape (3:2, wider than tall).");
  });

  test("Codex attaches each reference as a local image, in order, ahead of the text", () => {
    assert.deepEqual(pictureInputs([face("kara"), face("brakk")]), [
      { type: "localImage", path: face("kara") },
      { type: "localImage", path: face("brakk") },
    ]);
    assert.deepEqual(pictureInputs([]), []);
    assert.equal(codexAdapter.attachesPictures, true);
    assert.ok(!grokAdapter.attachesPictures, "a program whose input takes no pictures paints from the words alone");
  });

  console.log(`\n${passed} picture reference checks passed`);
} finally {
  removeTempDir(dir);
}
