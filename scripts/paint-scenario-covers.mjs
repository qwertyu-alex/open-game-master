// Paints the ready-made couch nights' cover pictures (src/lib/couch/
// scenario-cards.ts) through the server's own agent program, the painter
// every couch night uses, and ships them as WebP in public/assets/couch/
// scenarios/<id>.webp, where the story picker and the home screen find them.
//
//   node --env-file=.env.server scripts/paint-scenario-covers.mjs [--only <id>] [--force]
//
// A cover shows the place and the mood only: never the threat, a body or a
// twist, so it spoils nothing (the cards' own rule), and never a creature,
// so it needs nothing from docs/art/creature-art-guidance.md. A cover that
// exists is skipped unless --force. Needs cwebp on the PATH.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./lib/register-alias.mjs", import.meta.url);
const { generateHarnessImage } = await import("../src/lib/harness/images.ts");
const { SCENARIO_CARDS } = await import("../src/lib/couch/scenario-cards.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "couch", "scenarios");

const STYLE = "late-1970s science fiction film still, 35mm film grain, anamorphic, practical lighting, deep shadows, cinematic establishing shot, no people in focus, no text, no logos, no lettering";

// What each cover shows: the opening place, as the briefing paints it.
const COVERS = {
  "dead-air":
    "A small dark relay station of three linked modules and a tall antenna mast in deep space, a battered orange salvage tug clamped to its frosted airlock, red warning strobes, a single green light in one window",
  "haddon-outpost":
    "A squat mining outpost of prefab steel modules and a tall ore conveyor on a grey airless moon under a black starfield, every window lit warm white, a small survey lander parked on the dust beside its airlock, long hard shadows, perfectly still",
  "crew-expendable":
    "Seen through the frosted canopy of a small cockpit full of green screens: a huge black derelict spaceship turning slowly against the stars, its running lights dead, one airlock blinking amber, a thin flexible umbilical tube stretched across to it",
};

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";
const force = args.includes("--force");

mkdirSync(OUT_DIR, { recursive: true });
let failed = 0;
for (const card of SCENARIO_CARDS) {
  if (only && card.id !== only) continue;
  const target = path.join(OUT_DIR, `${card.id}.webp`);
  if (existsSync(target) && !force) {
    console.log(`skip ${card.id}: cover exists`);
    continue;
  }
  const scene = COVERS[card.id];
  if (!scene) {
    console.error(`no cover prompt for ${card.id}: add one to COVERS`);
    failed += 1;
    continue;
  }
  console.log(`painting ${card.id}...`);
  try {
    const image = await generateHarnessImage({ prompt: `${STYLE}. ${scene}`, mode: "slow", aspect: "landscape", force: true });
    const source = path.join(ROOT, "public", image.url);
    // 1280 wide is crisp on a TV-sized picker card and still small.
    execFileSync("cwebp", ["-quiet", "-q", "78", "-resize", "1280", "0", source, "-o", target]);
    rmSync(source, { force: true });
    console.log(`  wrote ${path.relative(ROOT, target)}`);
  } catch (error) {
    failed += 1;
    console.error(`  ${card.id} failed: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed ? 1 : 0);
