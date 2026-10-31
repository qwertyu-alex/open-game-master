import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { cloudflaredConnected, cloudflaredLogRecord, cloudflareTunnel, DEFAULT_CLOUDFLARE_TUNNEL, DEFAULT_CLOUDFLARE_TUNNEL_URL, localDevOrigins, localServerEnv, localStartOptions } from "../src/lib/local-start-logic.ts";

let passed = 0;
async function test(name, run) {
  await run();
  passed += 1;
  console.log(`ok: ${name}`);
}

await test("port overrides stay aligned and invalid ports fail before publishing", () => {
  assert.equal(localStartOptions([]).port, 3005);
  assert.equal(localStartOptions([], "3010").port, 3010);
  assert.deepEqual(localStartOptions(["--port", "3011", "--webpack"], "3010"), { port: 3011, nextArgs: ["--webpack"] });
  assert.equal(localStartOptions(["--port=3012"]).port, 3012);
  assert.equal(localStartOptions(["-p", "3013"]).port, 3013);
  for (const value of ["", "0", "65536", "invalid", "3005x"]) {
    assert.throws(() => localStartOptions(["-p", value]), /port between/);
  }
});

await test("the tunnel is a named tunnel and a bare HTTPS origin, the defaults unless the environment says otherwise", () => {
  if (DEFAULT_CLOUDFLARE_TUNNEL && DEFAULT_CLOUDFLARE_TUNNEL_URL) {
    assert.deepEqual(cloudflareTunnel(undefined, undefined), { tunnel: DEFAULT_CLOUDFLARE_TUNNEL, url: DEFAULT_CLOUDFLARE_TUNNEL_URL });
  } else {
    assert.throws(() => cloudflareTunnel(undefined, undefined), /CLOUDFLARE_TUNNEL/, "no quick tunnel: it would not carry the event stream");
  }
  assert.throws(() => cloudflareTunnel("", "couch.example.com"), /CLOUDFLARE_TUNNEL/);
  assert.throws(() => cloudflareTunnel("couch-night", "  "), /CLOUDFLARE_TUNNEL/);
  assert.deepEqual(cloudflareTunnel("couch-night", "couch.example.com"), { tunnel: "couch-night", url: "https://couch.example.com" });
  assert.deepEqual(cloudflareTunnel(" 8fe4658c-d83f-49f1-be5e-18e07be2f069 ", "https://couch.example.com/"), { tunnel: "8fe4658c-d83f-49f1-be5e-18e07be2f069", url: "https://couch.example.com" });
  for (const name of ["--config", "two words", "-x"]) {
    assert.throws(() => cloudflareTunnel(name, "couch.example.com"), /name or UUID/, name);
  }
  for (const value of ["http://couch.example.com", "https://couch.example.com/play", "https://u:p@couch.example.com", "localhost:3005", "https://couch.example.com:8443", "not a url"]) {
    assert.throws(() => cloudflareTunnel("couch-night", value), /CLOUDFLARE_TUNNEL_URL/, value);
  }
});

await test("only a registered connection marks the tunnel live", () => {
  for (const line of ["not JSON", "null", '{}', '{"level":"info","message":"Starting tunnel"}', '{"message":"Registered tunnel connection"}']) {
    assert.equal(cloudflaredConnected(line), false, line);
  }
  assert.ok(cloudflaredConnected(JSON.stringify({ level: "info", message: "Registered tunnel connection", connIndex: 0 })));
  assert.deepEqual(cloudflaredLogRecord('{"level":"error","message":"no such tunnel","time":"x"}'), { level: "error", message: "no such tunnel" });
  assert.equal(cloudflaredLogRecord("plain text"), null);
  const original = { ALLOWED_DEV_ORIGINS: "phone.example", OTHER: "keep" };
  const env = localServerEnv(original, "https://play.example");
  assert.equal(env.ODM_TUNNEL_PUBLIC_URL, "https://play.example");
  assert.equal(env.ALLOWED_DEV_ORIGINS, "phone.example");
  // Next loads .env.local itself. Merge there, after its origins are known,
  // rather than shadowing the user's file with a launcher environment value.
  assert.deepEqual(localDevOrigins("phone.example, other.example ", env.ODM_TUNNEL_PUBLIC_URL), ["phone.example", "other.example", "play.example"]);
  assert.deepEqual(localDevOrigins(), []);
  assert.equal(env.OTHER, "keep");
  assert.equal(original.ODM_TUNNEL_PUBLIC_URL, undefined);
});

const scratch = mkdtempSync(path.join(os.tmpdir(), "ogm-local-start-"));
const fixture = path.join(scratch, "process.mjs");
const runner = path.join(scratch, "runner.mjs");
writeFileSync(fixture, `
import { appendFileSync } from 'node:fs';
const role = process.argv[2];
const scenario = process.env.SCENARIO;
const record = (event) => appendFileSync(process.env.EVENTS, JSON.stringify({ role, event, pid: process.pid, args: process.argv.slice(3), url: process.env.ODM_TUNNEL_PUBLIC_URL, origins: process.env.ALLOWED_DEV_ORIGINS }) + '\\n');
record('start');
process.on('SIGTERM', () => {
  record('stop');
  if (scenario !== 'stubborn') process.exit(0);
});
setInterval(() => {}, 1000);
if (role === 'cloudflared') {
  if (scenario === 'auth') {
    console.error(JSON.stringify({ level: 'error', message: 'Tunnel credentials file not found' }));
    setTimeout(() => process.exit(1), 20);
  } else if (scenario !== 'timeout') {
    console.error(JSON.stringify({ level: 'info', message: 'Starting tunnel' }));
    const line = JSON.stringify({ level: 'info', message: 'Registered tunnel connection', connIndex: 0 }) + '\\n';
    process.stderr.write(line.slice(0, 10));
    setTimeout(() => process.stderr.write(line.slice(10)), 10);
  }
} else {
  console.log('fixture-server-ready');
  if (scenario === 'server-exit') setTimeout(() => process.exit(7), 30);
  if (scenario === 'tunnel-exit') {
    // Ask our sibling to disappear as if the cloudflared connector crashed.
    const { readFileSync } = await import('node:fs');
    const events = readFileSync(process.env.EVENTS, 'utf8').trim().split('\\n').map(JSON.parse);
    process.kill(events.find((event) => event.role === 'cloudflared').pid, 'SIGKILL');
  }
}
`);
writeFileSync(runner, `
import { runLocal } from ${JSON.stringify(new URL("./start-local.mjs", import.meta.url).href)};
try {
  process.exitCode = await runLocal({
    mode: process.env.MODE || 'start', args: ['--port', process.argv[2], '--webpack'],
    commands: {
      cloudflared: process.env.SCENARIO === 'missing' ? [${JSON.stringify(path.join(scratch, "missing-cloudflared"))}] : [process.execPath, ${JSON.stringify(fixture)}, 'cloudflared'],
      next: [process.execPath, ${JSON.stringify(fixture)}, 'next'],
    },
    startupTimeout: 1000, shutdownTimeout: 200, runFile: process.env.RUN_FILE,
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
`);

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  return server;
}

async function exercise(scenario, { signal, occupied, mode, env = {}, port: fixedPort, onReady } = {}) {
  const reservation = fixedPort ? null : await reservePort();
  const port = fixedPort ?? reservation.address().port;
  if (reservation && !occupied) await new Promise((resolve) => reservation.close(resolve));
  const eventsFile = path.join(scratch, `${scenario}-${mode || "start"}.jsonl`);
  writeFileSync(eventsFile, "");
  const child = spawn(process.execPath, [runner, String(port)], {
    env: { ...process.env, SCENARIO: scenario, MODE: mode || "start", EVENTS: eventsFile, RUN_FILE: path.join(scratch, "run.json"), ODM_ENV_FILE: path.join(scratch, "settings.env"), CLOUDFLARE_TUNNEL: "couch-night", CLOUDFLARE_TUNNEL_URL: "https://play.example", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let sent = false;
  const capture = (chunk) => {
    output += chunk;
    if (!sent && output.includes("fixture-server-ready")) {
      sent = true;
      if (onReady) onReady();
      else if (signal) child.kill(signal);
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const timeout = setTimeout(() => child.kill("SIGKILL"), onReady ? 15000 : 7000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
  } finally {
    clearTimeout(timeout);
    if (occupied) await new Promise((resolve) => reservation.close(resolve));
  }
  const events = readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  for (const event of events.filter((item) => item.event === "start")) {
    assert.throws(() => process.kill(event.pid, 0), /ESRCH/, `child ${event.role} must be stopped`);
  }
  return { code, output, events, port };
}

try {
  for (const [mode, signal, code] of [["start", "SIGINT", 130], ["dev", "SIGTERM", 143]]) {
    await test(`${mode} publishes the selected port, supplies invite and dev origins, and cleans up on ${signal}`, async () => {
      const result = await exercise("normal", { signal, mode });
      assert.equal(result.code, code, result.output);
      assert.match(result.output, /Public game address: https:\/\/play.example/);
      const tunnel = result.events.find((event) => event.role === "cloudflared" && event.event === "start");
      const next = result.events.find((event) => event.role === "next" && event.event === "start");
      assert.ok(tunnel.args.includes(`http://127.0.0.1:${result.port}`));
      assert.deepEqual(next.args, [mode, "-H", "0.0.0.0", "-p", String(result.port), "--webpack"]);
      assert.equal(next.url, "https://play.example");
      assert.ok(localDevOrigins(next.origins, next.url).includes("play.example"));
      assert.equal(result.events.filter((event) => event.event === "stop").length, 2);
    });
  }
  await test("cloudflared runs the named tunnel and nothing starts without one", async () => {
    const fixed = await exercise("normal", { signal: "SIGINT", env: { CLOUDFLARE_TUNNEL: "couch-night", CLOUDFLARE_TUNNEL_URL: "couch.example.com" } });
    assert.match(fixed.output, /Public game address: https:\/\/couch.example.com/);
    const args = fixed.events.find((event) => event.role === "cloudflared" && event.event === "start").args;
    assert.deepEqual(args.slice(-2), ["run", "couch-night"]);
    assert.equal(fixed.events.find((event) => event.role === "next" && event.event === "start").url, "https://couch.example.com");
    writeFileSync(path.join(scratch, "settings.env"), "CLOUDFLARE_TUNNEL=saved-night\nCLOUDFLARE_TUNNEL_URL=https://saved.example.com\n");
    const saved = await exercise("normal", { signal: "SIGINT", env: { CLOUDFLARE_TUNNEL: "", CLOUDFLARE_TUNNEL_URL: "" } });
    rmSync(path.join(scratch, "settings.env"));
    assert.match(saved.output, /Public game address: https:\/\/saved.example.com/, "the settings file fills in what the environment leaves out");
    assert.deepEqual(saved.events.find((event) => event.role === "cloudflared" && event.event === "start").args.slice(-2), ["run", "saved-night"]);
    for (const env of [{ CLOUDFLARE_TUNNEL: "" }, { CLOUDFLARE_TUNNEL_URL: "http://couch.example.com" }]) {
      const wrong = await exercise("normal", { env });
      assert.equal(wrong.code, 1);
      assert.match(wrong.output, /Set CLOUDFLARE_TUNNEL/);
      assert.equal(wrong.events.length, 0, "nothing is started without a usable tunnel");
    }
  });
  for (const [scenario, message] of [["auth", /credentials file not found/], ["timeout", /did not connect/], ["missing", /Install cloudflared/]]) {
    await test(`${scenario} stops without starting a game server`, async () => {
      const result = await exercise(scenario);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, message);
      assert.ok(!result.events.some((event) => event.role === "next"));
    });
  }
  await test("an occupied port cannot expose an unrelated service", async () => {
    const result = await exercise("occupied", { occupied: true });
    assert.equal(result.code, 1);
    assert.match(result.output, /Port .* is in use/);
    assert.equal(result.events.length, 0);
  });
  await test("a rerun stops the night already running and takes its place", async () => {
    const port = (await (async () => {
      const reservation = await reservePort();
      const free = reservation.address().port;
      await new Promise((resolve) => reservation.close(resolve));
      return free;
    })());
    let second;
    const first = await exercise("normal", {
      port,
      onReady: () => { second = exercise("normal", { port, mode: "dev", signal: "SIGINT" }); },
    });
    assert.equal(first.code, 143, first.output);
    assert.equal(first.events.filter((event) => event.event === "stop").length, 2, "the old server and tunnel stopped");
    const result = await second;
    assert.equal(result.code, 130, result.output);
    assert.match(result.output, /Stopping the server already running/);
    assert.ok(result.events.some((event) => event.role === "next" && event.event === "start"));
  });
  await test("a server failure propagates its exit code and closes the tunnel", async () => {
    const result = await exercise("server-exit");
    assert.equal(result.code, 7, result.output);
    assert.ok(result.events.some((event) => event.role === "cloudflared" && event.event === "stop"));
  });
  await test("a tunnel failure stops the server", async () => {
    const result = await exercise("tunnel-exit");
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /cloudflared disconnected/);
    assert.ok(result.events.some((event) => event.role === "next" && event.event === "stop"));
  });
  await test("children ignoring termination are forcibly cleaned up", async () => {
    const result = await exercise("stubborn", { signal: "SIGINT" });
    assert.equal(result.code, 130, result.output);
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`test-start-local: ${passed} passed`);
