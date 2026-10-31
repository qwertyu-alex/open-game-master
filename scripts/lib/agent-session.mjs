// The work behind scripts/agent-session.mjs: read a world's campaigns and
// seats, mint a short sign-in for one seat, and take those sign-ins back.
// Every function takes an open database handle (src/lib/db/driver.ts), so
// the CLI can open the real world without its boot pass and the test can
// hand in a throwaway one.
//
// A session minted here is an ordinary row in `sessions`, made the way
// src/lib/auth.ts mintSession makes one (a random token, its sha256 hex as
// token_hash), so the server accepts it as a cookie or a bearer token with
// no code of its own. The tool's rows are also recorded in agent_sessions,
// so revoking them never touches a session a person signed in with.
import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "odm_session";
export const DEFAULT_HOURS = 2;
// Long enough for a night's testing, short enough that a forgotten token
// dies on its own.
export const MAX_HOURS = 12;

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function tableExists(db, name) {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

// Made on first use, like the couch tables (src/lib/couch/store.ts): no
// migration in the app knows about it, and a world that never used the tool
// never has it.
function ensureTagTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

function readSettings(raw) {
  try {
    return JSON.parse(raw || "{}") ?? {};
  } catch {
    return {};
  }
}

export function listCampaigns(db, limit = 15) {
  const forges = tableExists(db, "couch_forges") && columnExists(db, "couch_forges", "scenario_id");
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.status, c.game_settings_json, c.created_at
              ${forges ? ", f.scenario_id" : ""}
         FROM campaigns c
         ${forges ? "LEFT JOIN couch_forges f ON f.campaign_id = c.id" : ""}
        ORDER BY c.created_at DESC
        LIMIT ?`,
    )
    .all(limit);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    couchMode: readSettings(row.game_settings_json).couchMode === true,
    scenarioId: row.scenario_id || null,
    createdAt: row.created_at,
  }));
}

// Who sits where: the host is the campaign's lead (src/lib/db/campaigns.ts
// mapCampaign: party_lead_user_id, else the owner), the TV's account on a
// couch night; the players are the other members, with their characters.
export function campaignSeats(db, campaignId) {
  const lead = columnExists(db, "campaigns", "party_lead_user_id") ? "party_lead_user_id" : "NULL";
  const campaign = db
    .prepare(`SELECT id, title, status, owner_user_id, ${lead} AS lead_user_id FROM campaigns WHERE id = ?`)
    .get(campaignId);
  if (!campaign) {
    throw new Error(`No campaign with id ${campaignId}. Run \`list\` to see the campaigns.`);
  }
  const hostId = campaign.lead_user_id ?? campaign.owner_user_id;
  const username = (userId) => db.prepare(`SELECT username FROM users WHERE id = ?`).get(userId)?.username ?? null;
  const companion = columnExists(db, "character_sheets", "is_companion") ? "AND COALESCE(is_companion, 0) = 0" : "";
  const characters = db
    .prepare(`SELECT user_id, name FROM character_sheets WHERE campaign_id = ? ${companion} ORDER BY created_at`)
    .all(campaignId);
  const members = db
    .prepare(`SELECT user_id, role FROM campaign_members WHERE campaign_id = ? ORDER BY joined_at`)
    .all(campaignId);
  const players = members
    .filter((member) => member.user_id !== hostId)
    .map((member) => ({
      userId: member.user_id,
      username: username(member.user_id),
      role: member.role,
      characters: characters.filter((sheet) => sheet.user_id === member.user_id).map((sheet) => sheet.name),
    }));
  return {
    campaign: { id: campaign.id, title: campaign.title, status: campaign.status },
    host: {
      userId: hostId,
      username: username(hostId),
      characters: characters.filter((sheet) => sheet.user_id === hostId).map((sheet) => sheet.name),
    },
    players,
  };
}

// "host", a member's user id, or a character's name (any case).
export function resolveSeat(db, campaignId, as) {
  const seats = campaignSeats(db, campaignId);
  const wanted = String(as ?? "").trim();
  if (!wanted) {
    throw new Error('Say who to sign in as: --as host, a character name, or a user id.');
  }
  if (wanted.toLowerCase() === "host") {
    return { seat: "host", userId: seats.host.userId, username: seats.host.username, characters: seats.host.characters };
  }
  const everyone = [{ ...seats.host, seat: "host" }, ...seats.players.map((player) => ({ ...player, seat: "player" }))];
  const byId = everyone.find((person) => person.userId === wanted);
  if (byId) {
    return { seat: byId.seat, userId: byId.userId, username: byId.username, characters: byId.characters };
  }
  const name = wanted.toLowerCase();
  const byName = everyone.filter((person) => person.characters.some((character) => character.toLowerCase() === name));
  if (byName.length > 1) {
    throw new Error(`More than one seat plays "${wanted}" here; use a user id: ${byName.map((person) => person.userId).join(", ")}.`);
  }
  if (byName.length === 1) {
    const [person] = byName;
    return { seat: person.seat, userId: person.userId, username: person.username, characters: person.characters };
  }
  const known = everyone.flatMap((person) => person.characters);
  throw new Error(
    `No one at campaign ${campaignId} is "${wanted}". ` +
      (known.length ? `Characters here: ${known.join(", ")}.` : "No one has a character here yet.") +
      " Use host, a character name, or a user id.",
  );
}

export function clampHours(hours) {
  const value = hours === undefined || hours === null || hours === "" ? DEFAULT_HOURS : Number(hours);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--hours must be a positive number (default ${DEFAULT_HOURS}, at most ${MAX_HOURS}).`);
  }
  return Math.min(value, MAX_HOURS);
}

// Tagged rows past their date, and the session rows behind them.
function pruneExpired(db, now) {
  const expired = db.prepare(`SELECT token_hash FROM agent_sessions WHERE expires_at < ?`).all(now);
  const dropSession = db.prepare(`DELETE FROM sessions WHERE token_hash = ?`);
  const dropTag = db.prepare(`DELETE FROM agent_sessions WHERE token_hash = ?`);
  db.transaction(() => {
    for (const { token_hash: hash } of expired) {
      dropSession.run(hash);
      dropTag.run(hash);
    }
  })();
  return expired.length;
}

export function mintAgentSession(db, { campaignId, as, hours, now = new Date() }) {
  ensureTagTable(db);
  const person = resolveSeat(db, campaignId, as);
  const span = clampHours(hours);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + span * 60 * 60 * 1000).toISOString();
  const token = randomBytes(32).toString("base64url");
  const hash = hashToken(token);
  pruneExpired(db, createdAt);
  db.transaction(() => {
    db.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
      hash,
      person.userId,
      createdAt,
      expiresAt,
    );
    db.prepare(
      `INSERT INTO agent_sessions (token_hash, user_id, campaign_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(hash, person.userId, campaignId, createdAt, expiresAt);
  })();
  return { token, expiresAt, hours: span, person };
}

// Takes back one minted token, or every one. A token the tool did not mint
// is refused: this never signs a person out.
export function revokeAgentSessions(db, { token, now = new Date() } = {}) {
  ensureTagTable(db);
  if (token) {
    const hash = hashToken(token);
    if (!db.prepare(`SELECT 1 FROM agent_sessions WHERE token_hash = ?`).get(hash)) {
      throw new Error("That token was not minted by agent-session (or is already revoked); nothing was changed.");
    }
    db.transaction(() => {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hash);
      db.prepare(`DELETE FROM agent_sessions WHERE token_hash = ?`).run(hash);
    })();
    return { revoked: 1, expiredCleared: pruneExpired(db, now.toISOString()) };
  }
  let revoked = 0;
  db.transaction(() => {
    revoked = db.prepare(`SELECT COUNT(*) AS n FROM agent_sessions`).get().n;
    db.prepare(`DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM agent_sessions)`).run();
    db.prepare(`DELETE FROM agent_sessions`).run();
  })();
  return { revoked };
}

export function loginReport({ token, expiresAt, hours, person }, campaignId, origin = "http://localhost:3005") {
  const maxAge = Math.max(1, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  return {
    token,
    cookieName: SESSION_COOKIE,
    expiresAt,
    hours,
    user: { id: person.userId, username: person.username, seat: person.seat, characters: person.characters },
    urls: {
      tv: `${origin}/campaigns/${campaignId}/table`,
      phone: `${origin}/campaigns/${campaignId}`,
    },
    setCookieJs: `document.cookie = "${SESSION_COOKIE}=${token}; path=/; max-age=${maxAge}; samesite=lax"`,
    curl: `curl -s -H "cookie: ${SESSION_COOKIE}=${token}" ${origin}/api/campaigns/${campaignId}`,
  };
}
