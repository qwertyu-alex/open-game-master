// Stand-in players for a couch night, for testing on one machine: sits in
// the seats you name, and whenever the GM waits on one of them writes its
// move (an AI player, or you at the terminal), throws its rolls and answers
// its truces. The TV shows the night as the room would see it.
//
//   node scripts/couch-autoplay.mjs --campaign <id> [--as "Teddy,Anouk"] [--prompt]
//       [--model haiku] [--delay 8] [--note "split up and be reckless"] [--origin URL] [--dry-run]
//
// --dry-run prints what each stand-in would do and posts nothing.
// Seats default to every player. --prompt asks you for each move (an empty
// line lets the AI write it, "pass" passes, "say ..." speaks); without it the
// AI plays and you can still type at any time:
//   Teddy: open the cocoon    the next move for Teddy, word for word
//   !note be reckless         direction every AI move follows (!note alone clears it)
//   !pause / !resume          hold the stand-ins (rolls too) / let them go on
//   !prompt / !auto           switch between asking you and letting the AI play
//   !quit                     stop, and take the sign-ins back
//
// It signs in through scripts/agent-session.mjs (no password, no web route)
// and revokes exactly those sessions on the way out. AI moves come from the
// Claude Code CLI (`claude -p`), run with no tools.
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";
import { addressed, botRolls, botTruceAnswers, dueBots, gmText, lastGmSeq, nightPaused, parseMove, playerPrompt, TRUCE_ACCEPT_CHANCE, typedMove } from "../src/lib/couch/autoplay-logic.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    campaign: { type: "string" },
    as: { type: "string" },
    prompt: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    model: { type: "string", default: "haiku" },
    delay: { type: "string", default: "8" },
    note: { type: "string", default: "" },
    origin: { type: "string", default: "http://localhost:3005" },
    hours: { type: "string", default: "4" },
  },
});
if (!values.campaign) {
  console.error("Usage: node scripts/couch-autoplay.mjs --campaign <id> [--as \"Name,Name\"] [--prompt] [--model haiku] [--delay 8] [--note TEXT]\n(node scripts/agent-session.mjs list shows the campaigns)");
  process.exit(2);
}
const campaignId = values.campaign;
const origin = values.origin.replace(/\/$/, "");
// Seconds a bot waits after the GM finishes before it answers: the TV reads
// the passage aloud, and a crew that answers mid-sentence is not a room.
const delayMs = Math.max(0, Number(values.delay) || 0) * 1000;
const state = { prompt: values.prompt, note: values.note, paused: false, quitting: false };

function agentSession(args) {
  return execFileSync(process.execPath, [path.join(repoRoot, "scripts/agent-session.mjs"), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// ---- seats ----

const seats = JSON.parse(agentSession(["list", "--campaign", campaignId]));
const wanted = values.as ? values.as.split(",").map((name) => name.trim().toLowerCase()).filter(Boolean) : null;
const chosen = seats.players.filter(
  (player) => player.characters.length && (!wanted || wanted.some((name) => player.characters.some((c) => c.toLowerCase() === name || c.toLowerCase().split(/\s+/).includes(name)) || player.userId === name)),
);
if (!chosen.length) {
  console.error(`No player seat matched. Seats here: ${seats.players.map((p) => p.characters.join("/") || p.username).join(", ") || "none"}`);
  process.exit(1);
}
const bots = chosen.map((player) => {
  const report = JSON.parse(agentSession(["login", "--campaign", campaignId, "--as", player.userId, "--hours", values.hours, "--origin", origin]));
  return { userId: player.userId, name: player.characters[0], token: report.token };
});
const botIds = bots.map((bot) => bot.userId);
const byUser = new Map(bots.map((bot) => [bot.userId, bot]));

function revoke() {
  for (const bot of bots) {
    try {
      agentSession(["revoke", "--token", bot.token]);
    } catch {
      // Already gone (or expired): nothing to take back.
    }
  }
}
function quit(code = 0) {
  if (state.quitting) return;
  state.quitting = true;
  revoke();
  log("Stand-ins stood up; their sign-ins are revoked.");
  process.exit(code);
}
process.on("SIGINT", () => quit(0));
process.on("SIGTERM", () => quit(0));

// ---- terminal ----

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let asking = null; // { resolve } while a --prompt question is open
const queued = new Map(); // userId → typed move for that seat's next turn

function log(line) {
  if (process.stdout.isTTY) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }
  console.log(line);
  if (asking) rl.prompt(true);
}

rl.on("line", (raw) => {
  const line = raw.trim();
  if (line.startsWith("!")) return command(line);
  if (asking) {
    const answer = asking.resolve;
    asking = null;
    return answer(line);
  }
  if (!line) return;
  const target = addressed(line, latest?.sheets?.filter((sheet) => botIds.includes(sheet.userId)) ?? []);
  if (!target) return log('Say who: "Teddy: open the cocoon" (or !note, !pause, !resume, !prompt, !auto, !quit).');
  const move = typedMove(target.text);
  if (move) {
    queued.set(target.sheet.userId, move);
    log(`Queued for ${target.sheet.name}: ${move.kind} ${move.content}`);
  }
});
rl.on("close", () => quit(0));

function command(line) {
  const [word, ...rest] = line.slice(1).split(/\s+/);
  const text = rest.join(" ").trim();
  if (word === "note") {
    state.note = text;
    log(text ? `Every AI move now follows: ${text}` : "Direction cleared.");
  } else if (word === "pause") {
    state.paused = true;
    log("Paused: the stand-ins wait (rolls too) until !resume.");
  } else if (word === "resume") {
    state.paused = false;
    log("Resumed.");
  } else if (word === "prompt" || word === "auto") {
    state.prompt = word === "prompt";
    log(state.prompt ? "Asking you for each move (empty line: the AI writes it)." : "The AI plays; type \"Name: move\" to step in.");
  } else if (word === "quit") {
    quit(0);
  } else {
    log("Commands: !note TEXT, !pause, !resume, !prompt, !auto, !quit");
  }
}

function ask(question) {
  return new Promise((resolve) => {
    asking = { resolve };
    rl.setPrompt(question);
    rl.prompt();
  });
}

// ---- the server ----

async function api(bot, route, body) {
  const response = await fetch(`${origin}/api/campaigns/${campaignId}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${bot.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function aiMove(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--output-format", "text", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--disable-slash-commands", "--model", values.model],
      { env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_AUTO_CONNECT_IDE: "0" }, stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      const move = parseMove(out);
      if (code === 0 && move) resolve(move);
      else reject(new Error(err.trim().split("\n").at(-1) || `claude exited ${code} with no move`));
    });
    child.stdin.end(prompt);
  });
}

// ---- the loop ----

let latest = null;
let shownSeq = 0;
let lastPause = "";
const handled = {}; // userId → the GM seq that seat has answered
const busy = new Set(); // userIds (and roll / truce ids) being worked on
const dueSince = new Map(); // userId → when it first came due this beat

async function takeTurn(bot, gmSeq) {
  const sheet = latest.sheets.find((entry) => entry.userId === bot.userId && !entry.isCompanion);
  if (!sheet) return;
  let move = queued.get(bot.userId) ?? null;
  queued.delete(bot.userId);
  if (!move && state.prompt) {
    move = typedMove(await ask(`${sheet.name} > `));
    if (latest && lastGmSeq(latest.messages) !== gmSeq) return log(`(${sheet.name}'s moment passed.)`);
  }
  if (!move) {
    try {
      move = await aiMove(playerPrompt({ view: latest, sheet, note: state.note }));
    } catch (error) {
      return log(`AI move for ${sheet.name} failed: ${error.message}`);
    }
  }
  if (state.paused) return;
  if (values["dry-run"]) {
    handled[bot.userId] = gmSeq;
    return log(`(dry run) ${sheet.name} would ${move.kind}: ${move.content}`);
  }
  try {
    if (move.kind === "pass") {
      await api(bot, "/pass", {});
      log(`${sheet.name} passes.`);
    } else {
      await api(bot, "/actions", { content: move.content, kind: move.kind, characterId: sheet.id });
      log(`${sheet.name} ${move.kind === "say" ? "says" : "does"}: ${move.content}`);
    }
    handled[bot.userId] = gmSeq;
  } catch (error) {
    log(`${sheet.name}'s move was refused: ${error.message}`);
    handled[bot.userId] = gmSeq;
  }
}

async function tick() {
  latest = await api(bots[0], "");
  const pause = nightPaused(latest);
  if (pause !== lastPause) {
    lastPause = pause;
    if (pause) log(`Waiting: ${pause}.`);
  }
  // New GM passages as they land; on the first read only the newest.
  const fresh = latest.messages.filter((message) => message.authorType === "dm" && message.seq > shownSeq);
  for (const message of shownSeq ? fresh : fresh.slice(-1)) log(`\n— GM —\n${gmText(message.content)}\n`);
  shownSeq = Math.max(shownSeq, lastGmSeq(latest.messages));
  if (state.paused) return;

  // A dry run leaves the dice and the truces to the people at the table.
  const live = !values["dry-run"];
  for (const roll of live ? botRolls(latest, botIds) : []) {
    if (busy.has(roll.id)) continue;
    busy.add(roll.id);
    const bot = byUser.get(roll.userId);
    api(bot, `/pending-rolls/${roll.id}`, { fallback: "digital" })
      .then(() => log(`${bot.name} rolls ${roll.expression}${roll.reason ? ` (${roll.reason})` : ""}.`))
      .catch((error) => log(`${bot.name}'s roll failed: ${error.message}`));
  }

  const botSheetIds = latest.sheets.filter((sheet) => botIds.includes(sheet.userId)).map((sheet) => sheet.id);
  for (const { truce, member } of live ? botTruceAnswers(latest, botSheetIds) : []) {
    const key = `${truce.id}:${member.characterId}`;
    if (busy.has(key)) continue;
    busy.add(key);
    const bot = byUser.get(latest.sheets.find((sheet) => sheet.id === member.characterId).userId);
    const accept = Math.random() < TRUCE_ACCEPT_CHANCE;
    api(bot, "/couch/truce", { truceId: truce.id, accept })
      .then(() => log(`${member.name} ${accept ? "accepts" : "refuses"} the truce.`))
      .catch((error) => log(`${member.name}'s truce answer failed: ${error.message}`));
  }

  const gmSeq = lastGmSeq(latest.messages);
  const due = new Set(dueBots(latest, botIds, handled));
  for (const id of dueSince.keys()) if (!due.has(id)) dueSince.delete(id);
  for (const userId of due) {
    if (busy.has(userId)) continue;
    if (!dueSince.has(userId)) dueSince.set(userId, Date.now() + Math.random() * 3000);
    if (!state.prompt && !queued.has(userId) && Date.now() - dueSince.get(userId) < delayMs) continue;
    if (state.prompt && asking) continue;
    busy.add(userId);
    takeTurn(byUser.get(userId), gmSeq).finally(() => busy.delete(userId));
  }
}

log(`Sitting in for ${bots.map((bot) => bot.name).join(", ")} at ${seats.campaign.title}. ${state.prompt ? "Asking you for each move." : `AI players (${values.model}).`} !quit to stop.`);
log(`TV: ${origin}/campaigns/${campaignId}/table`);
while (!state.quitting) {
  try {
    await tick();
  } catch (error) {
    log(`Could not read the night: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
