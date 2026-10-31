// Signs a coding agent in to the local server as a campaign's host (the TV)
// or one of its players (a phone), so it can check a real run in a browser
// without anyone's password, and takes those sign-ins back afterwards.
//
//   node scripts/agent-session.mjs list [--campaign <id>] [--limit N]
//   node scripts/agent-session.mjs login --campaign <id> --as host|<character>|<user id> [--hours N] [--origin URL]
//   node scripts/agent-session.mjs revoke [--token <token>]
//
// Why a CLI and not a route: the server on 3005 is public through the
// Cloudflare tunnel, and tunnel requests arrive from loopback, so no web
// door can tell an agent on this machine from a stranger. This tool needs
// the database file and its key, which only someone on this machine has.
//
// It opens the same database the server does (SQLITE_DB_PATH, else
// data/local-roleplay.sqlite, keyed by DB_ENCRYPTION_KEY from the
// environment or .env.server) but not through getDatabase: that runs the
// boot pass (schema migrations and the character sheet resync), which can
// rewrite rows. Here the only writes are the tool's own session rows and its
// agent_sessions tag table. Logins last DEFAULT_HOURS, at most MAX_HOURS
// (scripts/lib/agent-session.mjs).
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  campaignSeats,
  listCampaigns,
  loginReport,
  mintAgentSession,
  revokeAgentSessions,
} from "./lib/agent-session.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
// The server runs from the repository root, and server-env reads
// .env.server from the working directory.
process.chdir(repoRoot);
register("./lib/register-alias.mjs", import.meta.url);

const USAGE = `Usage:
  node scripts/agent-session.mjs list [--campaign <id>] [--limit N]
  node scripts/agent-session.mjs login --campaign <id> --as host|<character name>|<user id> [--hours N]
  node scripts/agent-session.mjs revoke [--token <token>]   (no token: every agent session)`;

async function openWorldDatabase() {
  const { openDatabase } = await import("../src/lib/db/driver.ts");
  const { serverEnv } = await import("../src/lib/server-env.ts");
  const dbPath = process.env.SQLITE_DB_PATH || path.join(repoRoot, "data", "local-roleplay.sqlite");
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No database at ${dbPath}. Start the server once, or set SQLITE_DB_PATH.`);
  }
  const db = openDatabase(dbPath, { fileMustExist: true });
  if (db.encrypted) {
    const key = serverEnv("DB_ENCRYPTION_KEY");
    if (!key) {
      db.close();
      throw new Error("DB_ENCRYPTION_KEY is not set in the environment or .env.server.");
    }
    db.pragma("cipher='chacha20'");
    db.pragma(`key='${key.replaceAll("'", "''")}'`);
  }
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch {
    db.close();
    throw new Error(`Could not read ${dbPath}: wrong DB_ENCRYPTION_KEY, or an engine without the cipher.`);
  }
  // The running server holds the same file in WAL mode; wait out its writes
  // rather than fail on a busy lock.
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  return db;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      campaign: { type: "string" },
      as: { type: "string" },
      hours: { type: "string" },
      token: { type: "string" },
      limit: { type: "string" },
      origin: { type: "string" },
    },
  });
  if (!["list", "login", "revoke"].includes(command)) {
    console.error(USAGE);
    return 2;
  }
  const db = await openWorldDatabase();
  try {
    if (command === "list") {
      print(
        values.campaign
          ? campaignSeats(db, values.campaign)
          : listCampaigns(db, Math.max(1, Math.min(100, Number(values.limit) || 15))),
      );
    } else if (command === "login") {
      if (!values.campaign || !values.as) {
        console.error(USAGE);
        return 2;
      }
      const minted = mintAgentSession(db, { campaignId: values.campaign, as: values.as, hours: values.hours });
      print(loginReport(minted, values.campaign, values.origin));
    } else {
      print(revokeAgentSessions(db, { token: values.token }));
    }
    return 0;
  } finally {
    db.close();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`agent-session: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
