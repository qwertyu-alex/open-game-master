import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { localServerEnv, localStartOptions, ngrokPublicUrl } from "../src/lib/local-start-logic.ts";

const require = createRequire(import.meta.url);

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is in use. Stop the existing server or choose --port before sharing.`)));
    probe.listen(port, "0.0.0.0", () => probe.close(resolve));
  });
}

function track(child, name) {
  const done = new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(name === "ngrok"
      ? `Could not start ngrok (${error.code}). Install ngrok and connect your account, then retry.`
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
  commands = { ngrok: ["ngrok"], next: [process.execPath, require.resolve("next/dist/bin/next")] },
  startupTimeout = 30_000, shutdownTimeout = 5_000,
} = {}) {
  if (mode !== "start" && mode !== "dev") throw new Error("Choose start or dev.");
  const { port, nextArgs } = localStartOptions(args, env.PORT);
  // Next dev can choose another port if one is occupied. A tunnel must
  // never accidentally publish the unrelated service already on that port.
  await checkPort(port);

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
    const [ngrokCommand, ...ngrokArgs] = commands.ngrok;
    const tunnel = track(spawn(ngrokCommand, [
      ...ngrokArgs, "http", `http://127.0.0.1:${port}`, "--log", "stdout", "--log-format", "json",
    ], { cwd, env, stdio: ["ignore", "pipe", "inherit"] }), "ngrok");
    children.push(tunnel);
    lines = createInterface({ input: tunnel.child.stdout });
    const address = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("ngrok did not open a public address within 30 seconds. Check its account configuration and retry.")), startupTimeout);
      lines.on("line", (line) => {
        const url = ngrokPublicUrl(line);
        if (url) resolve(url);
        // Print ngrok's explanation (e.g. authentication or account limits)
        // without dumping its configuration or arbitrary log records.
        try {
          const record = JSON.parse(line);
          if (record.lvl === "error" || record.lvl === "crit") console.error(`[ngrok] ${record.msg}`);
        } catch { /* Non-JSON output is not a tunnel address. */ }
      });
    });
    const first = await Promise.race([address, tunnel.done, interrupted]);
    clearTimeout(timer);
    if (typeof first !== "string") {
      if (first.name === "signal") return first.code;
      throw new Error("ngrok stopped before opening a public address. Check its account configuration and retry.");
    }

    console.log(`\nPublic game address: ${first}\nKeep this command running while your friends play.\n`);
    const [nextCommand, ...nextCommandArgs] = commands.next;
    const server = track(spawn(nextCommand, [
      ...nextCommandArgs, mode, "-H", "0.0.0.0", "-p", String(port), ...nextArgs,
    ], { cwd, env: localServerEnv(env, first), stdio: "inherit" }), "server");
    children.push(server);
    const ended = await Promise.race([server.done, tunnel.done, interrupted]);
    if (ended.name === "ngrok") throw new Error("ngrok disconnected. The game server has stopped; retry this command to share again.");
    return ended.code ?? 1;
  } finally {
    clearTimeout(timer);
    lines?.close();
    await Promise.all(children.map((child) => stop(child, shutdownTimeout)));
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
