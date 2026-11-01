// An experiment, not the library: one or more takes per cue from a music
// model, written into public/ambience next to what the fetch script found,
// credited in the lock as generated and kept out of the sound pack unless
// asked for (scripts/pack-ambience.mjs --include-generated). The library
// proper is the open-licensed recordings scripts/fetch-ambience.mjs
// resolves. Each cue in src/lib/ambience/catalog.ts with a `prompt` can be
// generated; stings cannot, because the model's shortest piece is ten
// seconds and a sting is one.
//
// Talks to an ACE-Step 1.5 server through its OpenAI-shaped endpoint
// (acestep-openrouter, http://127.0.0.1:8002 by default; the model is MIT
// and its output carries no third-party claim, which is what lets
// scripts/pack-ambience.mjs put these tracks in a pack the project ships).
//
// Usage:
//   node scripts/generate-ambience.mjs                  every cue with no take yet
//   node scripts/generate-ambience.mjs --cue battle     just this one (adds a take)
//   node scripts/generate-ambience.mjs --layer music    one layer
//   node scripts/generate-ambience.mjs --takes 2        this many takes per cue
//   node scripts/generate-ambience.mjs --force          add a take even where one exists
//   node scripts/generate-ambience.mjs --dry-run        list what would be made
//   ACESTEP_URL=http://host:8002 node scripts/generate-ambience.mjs
//
// Or through ElevenLabs, which also makes stings: its sound-effects model
// for beds (looping) and stings, its music model for the score. A couch
// night's pack (src/lib/couch/sound-catalog.ts) is made this way:
//   node --env-file=.env.server scripts/generate-ambience.mjs --backend elevenlabs --pack scifi_horror
//   ... --takes 2 --layer bed       two takes of every bed
// A pack's files are pinned in src/lib/ambience/sources.json with their
// credit, so a fresh clone credits them without this machine's lock.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";

register("./lib/register-alias.mjs", import.meta.url);

const { AMBIENCE_CUES } = await import("../src/lib/ambience/catalog.ts");
const { libraryRoot, nextTrackFile, parseTrackFile, readLock, rebuildManifest, writeLock } =
  await import("../src/lib/ambience/library.ts");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

const BASE = (process.env.ACESTEP_URL || "http://127.0.0.1:8002").replace(/\/$/, "");
const backend = option("backend", "acestep");
if (!["acestep", "elevenlabs"].includes(backend)) {
  console.error(`[ambience] unknown backend "${backend}": acestep or elevenlabs.`);
  process.exit(1);
}
const ELEVEN_BASE = (process.env.ELEVENLABS_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
const onlyPack = option("pack");
const onlyCue = option("cue");
const onlyLayer = option("layer");
const takes = Math.max(1, Number(option("takes", "1")) || 1);
const force = flag("force") || Boolean(onlyCue);
const dryRun = flag("dry-run");
// A bed loops under a scene and wants length so the loop point is rare; a
// music cue is crossfaded between takes by the player and ninety seconds
// is a phrase or two past where the model starts repeating itself.
const SECONDS = { bed: 90, music: 90 };

const OUT_DIR = libraryRoot();
mkdirSync(OUT_DIR, { recursive: true });

// A plain request rather than fetch: a minute of audio takes this long to
// make on a small GPU, and fetch gives up on the headers after five.
function post(pathname, body) {
  const url = new URL(pathname, BASE);
  const payload = JSON.stringify(body);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.on("error", reject);
    request.end(payload);
  });
}

async function generate(cue, seed) {
  return backend === "elevenlabs" ? generateEleven(cue) : generateAceStep(cue, seed);
}

// ElevenLabs answers with the audio itself. A bed is a looping sound
// effect (at most 30 s, the model's limit), a sting a short one, and a
// score cue an instrumental piece from the music model.
async function generateEleven(cue) {
  const music = cue.layer === "music";
  const url = music
    ? `${ELEVEN_BASE}/v1/music?output_format=mp3_44100_128`
    : `${ELEVEN_BASE}/v1/sound-generation?output_format=mp3_44100_128`;
  const body = music
    ? { prompt: cue.prompt, music_length_ms: (cue.seconds ?? SECONDS.music) * 1000, force_instrumental: true, model_id: process.env.ELEVENLABS_MUSIC_MODEL || "music_v2_5" }
    : {
        text: cue.prompt,
        loop: cue.layer === "bed",
        duration_seconds: Math.min(30, Math.max(0.5, cue.seconds ?? (cue.layer === "bed" ? 30 : 4))),
        prompt_influence: 0.6,
        model_id: process.env.ELEVENLABS_SFX_MODEL || "eleven_text_to_sound_v2",
      };
  const response = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
    // The music model takes a minute or two for a two-minute piece.
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return toOpus(Buffer.from(await response.arrayBuffer()), cue.layer);
}

// How loud each layer is made before the catalog's gain trims it. The model
// hands back a breathing suit at -58 dB and a bridge at -10; the room should
// not have to ride the volume between them. A bed sits under the voice, the
// score under a sting.
const LOUDNESS = { bed: -26, music: -20, sting: -16 };

// The library's own format (every shipped file is Opus), at one loudness a
// layer: measured, then applied as one linear gain (two-pass loudnorm), so a
// loop's quiet moments stay quiet. A looping bed is cut to loop and keeps
// its ends; anything else gets a short fade so it never clicks in.
function toOpus(input, layer) {
  const stem = path.join(os.tmpdir(), `odm-ambience-${process.pid}-${Date.now()}`);
  writeFileSync(`${stem}.in`, input);
  try {
    const target = `I=${LOUDNESS[layer] ?? -20}:TP=-1.5:LRA=20`;
    // loudnorm reports on stderr.
    const report = spawnSync(
      "ffmpeg",
      ["-hide_banner", "-i", `${stem}.in`, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"],
      { encoding: "utf8" },
    ).stderr;
    const measured = JSON.parse(report.slice(report.lastIndexOf("{"), report.lastIndexOf("}") + 1));
    const filters = [
      `loudnorm=${target}:linear=true:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}`,
      ...(layer === "bed" ? [] : ["afade=t=in:d=0.05,areverse,afade=t=in:d=0.3,areverse"]),
    ];
    execFileSync(
      "ffmpeg",
      [
        "-loglevel", "error", "-y", "-i", `${stem}.in`, "-af", filters.join(","), "-ar", "48000",
        "-codec:a", "libopus", "-b:a", layer === "music" ? "96k" : "64k", `${stem}.opus`,
      ],
      { stdio: "inherit" },
    );
    return readFileSync(`${stem}.opus`);
  } finally {
    rmSync(`${stem}.in`, { force: true });
    rmSync(`${stem}.opus`, { force: true });
  }
}

// --normalize: bring a pack's files already on disk to their layer's
// loudness, without generating anything.
if (flag("normalize")) {
  for (const name of readdirSync(OUT_DIR).sort()) {
    const parsed = parseTrackFile(name);
    const cue = parsed && AMBIENCE_CUES.find((candidate) => candidate.id === parsed.cueId);
    if (!cue || (onlyPack && cue.pack !== onlyPack) || (onlyCue && cue.id !== onlyCue) || (onlyLayer && cue.layer !== onlyLayer)) continue;
    if (!cue.pack && !onlyCue) continue;
    console.log(`[ambience] normalizing ${name}`);
    if (!dryRun) writeFileSync(path.join(OUT_DIR, name), toOpus(readFileSync(path.join(OUT_DIR, name)), cue.layer));
  }
  process.exit(0);
}

async function generateAceStep(cue, seed) {
  const { status, text } = await post("/v1/chat/completions", {
    messages: [{ role: "user", content: cue.prompt }],
    lyrics: "[Instrumental]",
    // WAV from the server, mp3 from ffmpeg here: the server's own mp3 export
    // needs torchcodec, which the ROCm build does without.
    audio_config: { duration: SECONDS[cue.layer] ?? 60, instrumental: true, format: "wav" },
    use_cot_caption: false,
    seed,
  });
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${BASE} answered ${status}: ${text.slice(0, 200)}`);
  }
  if (json.error) {
    throw new Error(typeof json.error === "string" ? json.error : json.error.message ?? "generation failed");
  }
  const dataUrl = json.choices?.[0]?.message?.audio?.[0]?.audio_url?.url;
  if (!dataUrl || !String(dataUrl).startsWith("data:")) {
    throw new Error("the server returned no audio");
  }
  return toMp3(Buffer.from(String(dataUrl).split(",")[1], "base64"));
}

// 128 kbps joint stereo, with a short fade at both ends so a take that
// starts mid-phrase does not click when the player crosses into it.
function toMp3(wav) {
  const stem = path.join(os.tmpdir(), `odm-ambience-${process.pid}-${Date.now()}`);
  writeFileSync(`${stem}.wav`, wav);
  try {
    execFileSync(
      "ffmpeg",
      ["-loglevel", "error", "-y", "-i", `${stem}.wav`, "-af", "afade=t=in:d=0.3,areverse,afade=t=in:d=0.3,areverse", "-codec:a", "libmp3lame", "-b:a", "128k", `${stem}.mp3`],
      { stdio: "inherit" },
    );
    return readFileSync(`${stem}.mp3`);
  } finally {
    rmSync(`${stem}.wav`, { force: true });
    rmSync(`${stem}.mp3`, { force: true });
  }
}

// A pack's files ship with the project, so their credit goes in the pins
// beside the fetched library's.
const SOURCES = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src", "lib", "ambience", "sources.json");
function pinShipped(file, credit) {
  const pins = JSON.parse(readFileSync(SOURCES, "utf8"));
  pins[file] = { title: credit.title, author: credit.author, license: credit.license, source: credit.source };
  writeFileSync(SOURCES, `${JSON.stringify(pins, null, 2)}\n`);
}

function filesFor(cueId) {
  return existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((name) => parseTrackFile(name)?.cueId === cueId) : [];
}

if (backend === "acestep") {
  const health = await fetch(`${BASE}/health`).then((response) => response.ok).catch(() => false);
  if (!health && !dryRun) {
    console.error(`[ambience] no ACE-Step server at ${BASE}. Start acestep-openrouter or set ACESTEP_URL.`);
    process.exit(1);
  }
} else if (!ELEVEN_KEY && !dryRun) {
  console.error("[ambience] no ELEVENLABS_API_KEY. Run with node --env-file=.env.server.");
  process.exit(1);
}

const cues = AMBIENCE_CUES.filter(
  (cue) =>
    cue.prompt &&
    // ACE-Step's shortest piece is ten seconds; a sting is one beat.
    (backend === "elevenlabs" || cue.layer !== "sting") &&
    (!onlyPack || cue.pack === onlyPack) &&
    (!onlyCue || cue.id === onlyCue) &&
    (!onlyLayer || cue.layer === onlyLayer),
);
if (!cues.length) {
  console.error("[ambience] nothing to make: no cue matches, or none of them has a prompt.");
  process.exit(1);
}

const lock = readLock();
let made = 0;
let skipped = 0;
const failed = [];
const started = Date.now();

for (const cue of cues) {
  const existing = filesFor(cue.id);
  const wanted = force ? takes : Math.max(0, takes - existing.length);
  if (!wanted) {
    skipped += 1;
    continue;
  }
  for (let take = 0; take < wanted; take += 1) {
    const file = nextTrackFile(cue.id, backend === "elevenlabs" ? ".opus" : ".mp3", filesFor(cue.id));
    console.log(`[ambience] ${cue.id} (${cue.label}) -> ${file}`);
    if (dryRun) {
      continue;
    }
    const t0 = Date.now();
    try {
      const audio = await generate(cue, Math.floor(Math.random() * 2 ** 31));
      writeFileSync(path.join(OUT_DIR, file), audio);
      const title = `${cue.label} (take ${parseTrackFile(file)?.variant ?? 1})`;
      lock[file] =
        backend === "elevenlabs"
          ? {
              title,
              author: "Generated with ElevenLabs for Open Game Master",
              source: "https://elevenlabs.io",
              license: "Generated for this project under the ElevenLabs terms",
              origin: "generated",
            }
          : {
              title,
              author: "Made with ACE-Step 1.5 on this server",
              source: "https://github.com/ace-step/ACE-Step-1.5",
              license: "Generated locally; no third-party rights",
              origin: "generated",
            };
      writeLock(lock);
      if (cue.pack) pinShipped(file, lock[file]);
      // The manifest after every take, not at the end: a run of forty
      // minutes should let the table hear the first take while the rest
      // are made.
      rebuildManifest();
      made += 1;
      console.log(`  ${(audio.length / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (error) {
      console.warn(`  ! ${error.message}`);
      failed.push(cue.id);
      break;
    }
  }
}

if (!dryRun) {
  console.log(
    `\n[ambience] ${made} tracks made, ${skipped} cues already had enough, ${rebuildManifest()} cues playable, ${((Date.now() - started) / 60000).toFixed(1)} min.`,
  );
}
if (failed.length) {
  console.log(`[ambience] failed: ${failed.join(", ")}`);
}
