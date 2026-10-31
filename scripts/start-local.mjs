import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { cloudflaredConnected, cloudflaredLogRecord, cloudflareTunnel, localServerEnv, localStartOptions } from "../src/lib/local-start-logic.ts";

const require = createRequire(import.meta.url);

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is in use. Stop the existing server or choose --port before sharing.`)));
    probe.listen(port, "0.0.0.0", () => probe.close(resolve));
  });
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

async function waitFor(check, timeout) {
  const deadline = Date.now() + timeout;
  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  return check();
}

function readRun(runFile) {
  try {
    const run = JSON.parse(readFileSync(runFile, "utf8"));
    return Array.isArray(run?.pids) ? run.pids.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid) : [];
  } catch {
    return [];
  }
}

// Rerunning start:lan or dev:lan replaces the night already running from
// this checkout: its server holds the port and its cloudflared connector
// would keep serving the tunnel beside the new one, so the new run could not
// start cleanly. Only processes this launcher recorded are stopped; an unrelated
// service on the port still refuses the start below.
async function stopPreviousRun(runFile, timeout) {
  const [launcher, ...children] = readRun(runFile);
  const pids = [launcher, ...children].filter((pid) => pid && alive(pid));
  if (!pids.length) return false;
  console.log("[local] Stopping the server already running from this checkout.");
  // The old launcher stops its own children; signal them too in case it
  // was killed and left them behind.
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch { /* Already gone. */ }
  }
  if (!await waitFor(() => !pids.some(alive), timeout + 1_000)) {
    for (const pid of pids.filter(alive)) {
      try { process.kill(pid, "SIGKILL"); } catch { /* Already gone. */ }
    }
    await waitFor(() => !pids.some(alive), 1_000);
  }
  return true;
}

function recordRun(runFile, children) {
  try {
    mkdirSync(path.dirname(runFile), { recursive: true });
    writeFileSync(runFile, JSON.stringify({ pids: [process.pid, ...children.map(({ child }) => child.pid).filter(Boolean)] }));
  } catch { /* Without the record a rerun only fails on the busy port. */ }
}

// A newer run may already have replaced this one's record.
function clearRun(runFile) {
  try {
    if (JSON.parse(readFileSync(runFile, "utf8")).pids?.[0] === process.pid) rmSync(runFile, { force: true });
  } catch { /* Nothing recorded. */ }
}

// The tunnel's names live in .env.server beside the app's keys (or the file
// ODM_ENV_FILE names), read the way src/lib/server-env.ts reads it: the
// environment first, then the file.
function settingsFile(env, cwd) {
  try {
    return parseEnv(readFileSync(env.ODM_ENV_FILE ? path.resolve(cwd, env.ODM_ENV_FILE) : path.join(cwd, ".env.server"), "utf8"));
  } catch {
    return {};
  }
}

function track(child, name) {
  const done = new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(name === "cloudflared"
      ? `Could not start cloudflared (${error.code}). Install cloudflared and create the tunnel (docs/install.md), then retry.`
      : `Could not start the game server: ${error.message}`)));
    child.once("close", (code, signal) => resolve({ name, code, signal }));
  });
  // A process may fail before the launcher starts awaiting its exit.
  done.catch(() => {});
  return { child, done };
}

async function stop({ child, done }, timeout) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), timeout);
  try {
    await done.catch(() => {});
  } finally {
    clearTimeout(force);
  }
}

export async function runLocal({
  mode = "start", args = [], env = process.env, cwd = process.cwd(),
  commands = { cloudflared: ["cloudflared"], next: [process.execPath, require.resolve("next/dist/bin/next")] },
  startupTimeout = 30_000, shutdownTimeout = 5_000,
  runFile = path.join(cwd, ".next", "local-start.json"),
} = {}) {
  if (mode !== "start" && mode !== "dev") throw new Error("Choose start or dev.");
  const { port, nextArgs } = localStartOptions(args, env.PORT);
  const settings = settingsFile(env, cwd);
  const { tunnel: tunnelName, url: publicUrl } = cloudflareTunnel(
    env.CLOUDFLARE_TUNNEL || settings.CLOUDFLARE_TUNNEL, env.CLOUDFLARE_TUNNEL_URL || settings.CLOUDFLARE_TUNNEL_URL,
  );
  const replaced = await stopPreviousRun(runFile, shutdownTimeout);
  // Next dev can choose another port if one is occupied. A tunnel must
  // never accidentally publish the unrelated service already on that port.
  // A replaced server may take a moment to release it.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await checkPort(port);
      break;
    } catch (error) {
      if (!replaced || attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const children = [];
  let finish;
  const interrupted = new Promise((resolve) => { finish = resolve; });
  const onInterrupt = () => finish({ name: "signal", code: 130 });
  const onTerminate = () => finish({ name: "signal", code: 143 });
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  let lines;
  let timer;
  try {
    const [tunnelCommand, ...tunnelArgs] = commands.cloudflared;
    // --url sends the tunnel to the port checked above. Ingress rules in a
    // ~/.cloudflared/config.yml would take precedence over it.
    const tunnel = track(spawn(tunnelCommand, [
      ...tunnelArgs, "tunnel", "--no-autoupdate", "--output", "json", "--url", `http://127.0.0.1:${port}`, "run", tunnelName,
    ], { cwd, env, stdio: ["ignore", "ignore", "pipe"] }), "cloudflared");
    children.push(tunnel);
    recordRun(runFile, children);
    lines = createInterface({ input: tunnel.child.stderr });
    const connected = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("cloudflared did not connect within 30 seconds. Check the tunnel's name and credentials and retry.")), startupTimeout);
      lines.on("line", (line) => {
        if (cloudflaredConnected(line)) resolve(publicUrl);
        // Print cloudflared's explanation (a missing tunnel or credentials)
        // without dumping every connection record.
        const record = cloudflaredLogRecord(line);
        if (record ? record.level === "error" || record.level === "fatal" : line.trim()) console.error(`[cloudflared] ${record?.message ?? line.trim()}`);
      });
    });
    const first = await Promise.race([connected, tunnel.done, interrupted]);
    clearTimeout(timer);
    if (typeof first !== "string") {
      if (first.name === "signal") return first.code;
      throw new Error("cloudflared stopped before connecting. Check the tunnel's name and credentials and retry.");
    }

    console.log(`\nPublic game address: ${first}\nKeep this command running while your friends play.\n`);
    const [nextCommand, ...nextCommandArgs] = commands.next;
    const server = track(spawn(nextCommand, [
      ...nextCommandArgs, mode, "-H", "0.0.0.0", "-p", String(port), ...nextArgs,
    ], { cwd, env: localServerEnv(env, first), stdio: "inherit" }), "server");
    children.push(server);
    recordRun(runFile, children);
    const ended = await Promise.race([server.done, tunnel.done, interrupted]);
    if (ended.name === "cloudflared") throw new Error("cloudflared disconnected. The game server has stopped; retry this command to share again.");
    return ended.code ?? 1;
  } finally {
    clearTimeout(timer);
    lines?.close();
    await Promise.all(children.map((child) => stop(child, shutdownTimeout)));
    if (children.length) clearRun(runFile);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocal({ mode: process.argv[2], args: process.argv.slice(3) })
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error(`[local] ${error.message}`);
      process.exitCode = 1;
    });
}
