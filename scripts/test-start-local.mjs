import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { localDevOrigins, localServerEnv, localStartOptions, ngrokPublicUrl } from "../src/lib/local-start-logic.ts";

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

await test("only a started HTTPS tunnel becomes the public origin", () => {
  for (const line of ["not JSON", "null", '{}', '{"url":"https://fake.example"}', '{"msg":"started tunnel","url":"http://plain.example"}']) {
    assert.equal(ngrokPublicUrl(line), null);
  }
  assert.equal(ngrokPublicUrl(JSON.stringify({ msg: "started tunnel", url: "https://play.example/" })), "https://play.example");
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
if (role === 'ngrok') {
  if (scenario === 'auth') {
    console.log(JSON.stringify({ lvl: 'error', msg: 'Authentication failed' }));
    setTimeout(() => process.exit(2), 20);
  } else if (scenario !== 'timeout') {
    const line = JSON.stringify({ msg: 'started tunnel', url: 'https://play.example' }) + '\\n';
    process.stdout.write(line.slice(0, 10));
    setTimeout(() => process.stdout.write(line.slice(10)), 10);
  }
} else {
  console.log('fixture-server-ready');
  if (scenario === 'server-exit') setTimeout(() => process.exit(7), 30);
  if (scenario === 'tunnel-exit') {
    // Ask our sibling to disappear as if the ngrok agent crashed.
    const { readFileSync } = await import('node:fs');
    const events = readFileSync(process.env.EVENTS, 'utf8').trim().split('\\n').map(JSON.parse);
    process.kill(events.find((event) => event.role === 'ngrok').pid, 'SIGKILL');
  }
}
`);
writeFileSync(runner, `
import { runLocal } from ${JSON.stringify(new URL("./start-local.mjs", import.meta.url).href)};
try {
  process.exitCode = await runLocal({
    mode: process.env.MODE || 'start', args: ['--port', process.argv[2], '--webpack'],
    commands: {
      ngrok: process.env.SCENARIO === 'missing' ? [${JSON.stringify(path.join(scratch, "missing-ngrok"))}] : [process.execPath, ${JSON.stringify(fixture)}, 'ngrok'],
      next: [process.execPath, ${JSON.stringify(fixture)}, 'next'],
    },
    startupTimeout: 1000, shutdownTimeout: 200,
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
`);

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  return server;
}

async function exercise(scenario, { signal, occupied, mode } = {}) {
  const reservation = await reservePort();
  const port = reservation.address().port;
  if (!occupied) await new Promise((resolve) => reservation.close(resolve));
  const eventsFile = path.join(scratch, `${scenario}-${mode || "start"}.jsonl`);
  writeFileSync(eventsFile, "");
  const child = spawn(process.execPath, [runner, String(port)], {
    env: { ...process.env, SCENARIO: scenario, MODE: mode || "start", EVENTS: eventsFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let sent = false;
  const capture = (chunk) => {
    output += chunk;
    if (signal && !sent && output.includes("fixture-server-ready")) {
      sent = true;
      child.kill(signal);
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const timeout = setTimeout(() => child.kill("SIGKILL"), 7000);
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
      const tunnel = result.events.find((event) => event.role === "ngrok" && event.event === "start");
      const next = result.events.find((event) => event.role === "next" && event.event === "start");
      assert.ok(tunnel.args.includes(`http://127.0.0.1:${result.port}`));
      assert.deepEqual(next.args, [mode, "-H", "0.0.0.0", "-p", String(result.port), "--webpack"]);
      assert.equal(next.url, "https://play.example");
      assert.ok(localDevOrigins(next.origins, next.url).includes("play.example"));
      assert.equal(result.events.filter((event) => event.event === "stop").length, 2);
    });
  }
  for (const [scenario, message] of [["auth", /Authentication failed/], ["timeout", /did not open/], ["missing", /Install ngrok/]]) {
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
  await test("a server failure propagates its exit code and closes ngrok", async () => {
    const result = await exercise("server-exit");
    assert.equal(result.code, 7, result.output);
    assert.ok(result.events.some((event) => event.role === "ngrok" && event.event === "stop"));
  });
  await test("an ngrok failure stops the server", async () => {
    const result = await exercise("tunnel-exit");
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /ngrok disconnected/);
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
