// The agent sign-in tool (scripts/agent-session.mjs, its work in
// scripts/lib/agent-session.mjs): a coding agent signs in as a couch night's
// TV or one of its phones with no password and no web route, and takes the
// sign-in back afterwards.
//
//   a minted token is accepted by the app's own session lookup, as the TV
//   (the lead) or as a player found by character name or user id;
//   a login lasts two hours by default and never more than twelve;
//   revoke takes back the tool's sessions, one or all, and a session a
//   person signed in with survives it, and is refused as a --token;
//   an unknown campaign or seat says so, and names who is there.
import assert from "node:assert/strict";
import { heroInput, openWorld } from "./lib/enforce-world.mjs";
import { suite } from "./lib/enforce-harness.mjs";
import {
  DEFAULT_HOURS,
  MAX_HOURS,
  campaignSeats,
  hashToken,
  listCampaigns,
  loginReport,
  mintAgentSession,
  revokeAgentSessions,
} from "./lib/agent-session.mjs";

const { test, finish } = suite("test-agent-session");

const world = await openWorld({ status: "lobby", gameSettings: { couchMode: true, genre: "custom" } });
const campaigns = await import("../src/lib/db/campaigns.ts");
const sheets = await import("../src/lib/db/sheets.ts");
const { getDatabase } = await import("../src/lib/db/core.ts");
const { getSessionUser, insertSession } = await import("../src/lib/db/users.ts");
const db = getDatabase();

// The TV is the campaign's owner and lead; Kara plays from a phone.
const tv = world.owner;
const kara = world.addUser("kara");
const joined = campaigns.joinByInviteCode(kara.id, world.campaign().inviteCode);
assert.ok(!("error" in joined), JSON.stringify(joined));
sheets.createSheet(world.campaignId, kara.id, 1, heroInput({ name: "Kara Voss", class: "fighter" }));

const HOUR = 60 * 60 * 1000;
const sessionCount = () => db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get().n;

await test("list shows the couch night and its seats", () => {
  const listed = listCampaigns(db).find((entry) => entry.id === world.campaignId);
  assert.ok(listed, "the campaign is listed");
  assert.equal(listed.couchMode, true);
  const seats = campaignSeats(db, world.campaignId);
  assert.equal(seats.host.userId, tv.id);
  assert.deepEqual(seats.players.map((player) => [player.userId, player.characters]), [[kara.id, ["Kara Voss"]]]);
  assert.ok(!JSON.stringify(seats).includes("password"), "no password field is read");
});

await test("a host login is accepted by the app's own session lookup, as the lead", () => {
  const minted = mintAgentSession(db, { campaignId: world.campaignId, as: "host" });
  assert.equal(getSessionUser(hashToken(minted.token))?.id, tv.id);
  assert.equal(minted.person.seat, "host");
  const report = loginReport(minted, world.campaignId);
  assert.equal(report.cookieName, "odm_session");
  assert.equal(report.urls.tv, `http://localhost:3005/campaigns/${world.campaignId}/table`);
  assert.equal(report.urls.phone, `http://localhost:3005/campaigns/${world.campaignId}`);
  assert.match(report.setCookieJs, /^document\.cookie = "odm_session=[\w-]+; path=\/; max-age=\d+; samesite=lax"$/);
});

await test("a player is found by character name (any case) or by user id", () => {
  const byName = mintAgentSession(db, { campaignId: world.campaignId, as: "kara voss" });
  assert.equal(getSessionUser(hashToken(byName.token))?.id, kara.id);
  assert.equal(byName.person.seat, "player");
  const byId = mintAgentSession(db, { campaignId: world.campaignId, as: kara.id });
  assert.equal(getSessionUser(hashToken(byId.token))?.id, kara.id);
});

await test("a login lasts two hours by default and never more than twelve", () => {
  const now = new Date("2026-10-31T20:00:00.000Z");
  const plain = mintAgentSession(db, { campaignId: world.campaignId, as: "host", now });
  assert.equal(Date.parse(plain.expiresAt) - now.getTime(), DEFAULT_HOURS * HOUR);
  const long = mintAgentSession(db, { campaignId: world.campaignId, as: "host", hours: "999", now });
  assert.equal(long.hours, MAX_HOURS);
  assert.equal(Date.parse(long.expiresAt) - now.getTime(), MAX_HOURS * HOUR);
  const stored = db.prepare(`SELECT expires_at FROM sessions WHERE token_hash = ?`).get(hashToken(long.token));
  assert.equal(stored.expires_at, long.expiresAt);
  assert.throws(() => mintAgentSession(db, { campaignId: world.campaignId, as: "host", hours: "-1" }), /positive number/);
});

await test("an expired agent login is refused and swept by the next login", () => {
  const past = new Date(Date.now() - 3 * HOUR);
  const old = mintAgentSession(db, { campaignId: world.campaignId, as: "host", hours: 1, now: past });
  assert.equal(getSessionUser(hashToken(old.token)), null);
  mintAgentSession(db, { campaignId: world.campaignId, as: "host" });
  assert.equal(db.prepare(`SELECT 1 FROM sessions WHERE token_hash = ?`).get(hashToken(old.token)), undefined);
});

await test("revoke takes back the tool's sessions only; a person's own session survives", () => {
  const own = "a-person-signed-in-with-a-password";
  insertSession(hashToken(own), kara.id, new Date(Date.now() + 30 * 24 * HOUR).toISOString());
  const one = mintAgentSession(db, { campaignId: world.campaignId, as: "host" });
  const other = mintAgentSession(db, { campaignId: world.campaignId, as: "Kara Voss" });

  assert.throws(() => revokeAgentSessions(db, { token: own }), /not minted by agent-session/);
  assert.equal(getSessionUser(hashToken(own))?.id, kara.id, "a refused --token changes nothing");

  assert.equal(revokeAgentSessions(db, { token: one.token }).revoked, 1);
  assert.equal(getSessionUser(hashToken(one.token)), null);
  assert.equal(getSessionUser(hashToken(other.token))?.id, kara.id, "one --token leaves the others");

  const before = sessionCount();
  const tagged = db.prepare(`SELECT COUNT(*) AS n FROM agent_sessions`).get().n;
  assert.equal(revokeAgentSessions(db).revoked, tagged);
  assert.equal(sessionCount(), before - tagged);
  assert.equal(getSessionUser(hashToken(other.token)), null);
  assert.equal(getSessionUser(hashToken(own))?.id, kara.id, "the person's session survives revoke-all");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM agent_sessions`).get().n, 0);
});

await test("an unknown campaign or seat says so, and names who is there", () => {
  assert.throws(() => mintAgentSession(db, { campaignId: "no-such-campaign", as: "host" }), /No campaign with id no-such-campaign/);
  assert.throws(() => mintAgentSession(db, { campaignId: world.campaignId, as: "Ripley" }), /No one at campaign .* is "Ripley"\. Characters here: Kara Voss/);
  assert.throws(() => mintAgentSession(db, { campaignId: world.campaignId, as: world.addUser("stranger").id }), /No one at campaign/);
  assert.throws(() => mintAgentSession(db, { campaignId: world.campaignId, as: " " }), /Say who to sign in as/);
});

world.close();
finish();
