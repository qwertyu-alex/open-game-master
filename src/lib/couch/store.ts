import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import type { Forge } from "@/lib/couch/forge-logic";
import type { CreateSheetInput } from "@/lib/schemas/sheet";

// A couch night's forge and its crew cards (docs/couch-mode-spec.md 2.1).
//
// couch_forges: one row per couch campaign, the forge's state ("forging",
// "ready", "failed") and, once ready, its whole output, the scenario the GM
// keeps secret included. Only src/lib/couch reads it, and nothing it holds
// leaves the server except the title, logline and briefing.
//
// couch_crew: one row per crew card. A card is a finished, admitted sheet
// (sheet_json) that belongs to nobody until a player claims it; the claim
// makes the campaign sheet (src/lib/couch/play.ts). Keeping unclaimed crew
// out of character_sheets is what keeps them out of the GM's party, the
// table's wait and every seat's snapshot: a card nobody took never plays.
//
// Made here on first use rather than in src/lib/db/core.ts, whose sheet
// columns are the only part of the schema couch mode touches. The campaign
// foreign keys cascade, so deleting the campaign takes both with it.

export type CouchStatus = "forging" | "ready" | "failed";

export type CouchForgeRow = {
  campaignId: string;
  status: CouchStatus;
  error: string;
  players: number;
  seed: string;
  offLimits: string;
  forge: Forge | null;
  // The act in force, 0 to 2 (src/lib/couch/play.ts advanceCouchAct).
  act: number;
  updatedAt: string;
};

export type CouchCrewRow = {
  id: string;
  campaignId: string;
  position: number;
  name: string;
  crewRole: string;
  backstory: string;
  career: string;
  gender: string;
  look: string;
  // The admitted sheet the claim seats, agenda and crew role included.
  sheet: CreateSheetInput;
  portraitUrl: string | null;
  claimedBy: string | null;
  sheetId: string | null;
};

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_forges (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        players INTEGER NOT NULL,
        seed TEXT NOT NULL DEFAULT '',
        off_limits TEXT NOT NULL DEFAULT '',
        forge_json TEXT NOT NULL DEFAULT '',
        act INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS couch_crew (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        crew_role TEXT NOT NULL DEFAULT '',
        backstory TEXT NOT NULL DEFAULT '',
        career TEXT NOT NULL DEFAULT '',
        gender TEXT NOT NULL DEFAULT '',
        look TEXT NOT NULL DEFAULT '',
        sheet_json TEXT NOT NULL,
        portrait_url TEXT,
        claimed_by TEXT,
        sheet_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_couch_crew_campaign ON couch_crew (campaign_id, position);
    `);
    ensured.add(database);
  }
  return database;
}

type ForgeRow = {
  campaign_id: string;
  status: string;
  error: string;
  players: number;
  seed: string;
  off_limits: string;
  forge_json: string;
  act: number;
  updated_at: string;
};

type CrewRow = {
  id: string;
  campaign_id: string;
  position: number;
  name: string;
  crew_role: string;
  backstory: string;
  career: string;
  gender: string;
  look: string;
  sheet_json: string;
  portrait_url: string | null;
  claimed_by: string | null;
  sheet_id: string | null;
};

function mapForge(row: ForgeRow): CouchForgeRow {
  return {
    campaignId: row.campaign_id,
    status: row.status === "ready" || row.status === "failed" ? row.status : "forging",
    error: row.error,
    players: row.players,
    seed: row.seed,
    offLimits: row.off_limits,
    forge: parseJson<Forge | null>(row.forge_json, null),
    act: row.act,
    updatedAt: row.updated_at,
  };
}

function mapCrew(row: CrewRow): CouchCrewRow {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    position: row.position,
    name: row.name,
    crewRole: row.crew_role,
    backstory: row.backstory,
    career: row.career,
    gender: row.gender,
    look: row.look,
    sheet: parseJson<CreateSheetInput>(row.sheet_json, {} as CreateSheetInput),
    portraitUrl: row.portrait_url,
    claimedBy: row.claimed_by,
    sheetId: row.sheet_id,
  };
}

export function getCouchForge(campaignId: string): CouchForgeRow | null {
  const row = db().prepare(`SELECT * FROM couch_forges WHERE campaign_id = ?`).get(campaignId) as ForgeRow | undefined;
  return row ? mapForge(row) : null;
}

// A new night, or the same night asked again (a reforge): the forge starts
// over and the old cards go.
export function beginCouchForge(campaignId: string, input: { players: number; seed: string; offLimits: string }): void {
  const now = nowIso();
  const database = db();
  database.transaction(() => {
    database.prepare(`DELETE FROM couch_crew WHERE campaign_id = ?`).run(campaignId);
    database
      .prepare(
        `INSERT INTO couch_forges (campaign_id, status, error, players, seed, off_limits, forge_json, act, created_at, updated_at)
         VALUES (?, 'forging', '', ?, ?, ?, '', 0, ?, ?)
         ON CONFLICT (campaign_id) DO UPDATE SET status = 'forging', error = '', players = excluded.players,
           seed = excluded.seed, off_limits = excluded.off_limits, forge_json = '', act = 0, updated_at = excluded.updated_at`,
      )
      .run(campaignId, input.players, input.seed, input.offLimits, now, now);
  })();
}

export function failCouchForge(campaignId: string, error: string): void {
  db()
    .prepare(`UPDATE couch_forges SET status = 'failed', error = ?, updated_at = ? WHERE campaign_id = ?`)
    .run(error.slice(0, 400), nowIso(), campaignId);
}

// The forge's output and its cards, written together: a reader never sees a
// ready night with half its crew.
export function finishCouchForge(
  campaignId: string,
  forge: Forge,
  crew: Array<Omit<CouchCrewRow, "id" | "campaignId" | "position" | "portraitUrl" | "claimedBy" | "sheetId">>,
): CouchCrewRow[] {
  const now = nowIso();
  const database = db();
  database.transaction(() => {
    database.prepare(`DELETE FROM couch_crew WHERE campaign_id = ?`).run(campaignId);
    const insert = database.prepare(
      `INSERT INTO couch_crew (id, campaign_id, position, name, crew_role, backstory, career, gender, look, sheet_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    crew.forEach((member, position) => {
      insert.run(
        crypto.randomUUID(),
        campaignId,
        position,
        member.name,
        member.crewRole,
        member.backstory,
        member.career,
        member.gender,
        member.look,
        JSON.stringify(member.sheet),
        now,
      );
    });
    database
      .prepare(`UPDATE couch_forges SET status = 'ready', error = '', forge_json = ?, act = 0, updated_at = ? WHERE campaign_id = ?`)
      .run(JSON.stringify(forge), now, campaignId);
  })();
  return listCouchCrew(campaignId);
}

export function setCouchAct(campaignId: string, act: number): void {
  db().prepare(`UPDATE couch_forges SET act = ?, updated_at = ? WHERE campaign_id = ?`).run(act, nowIso(), campaignId);
}

export function listCouchCrew(campaignId: string): CouchCrewRow[] {
  return (db().prepare(`SELECT * FROM couch_crew WHERE campaign_id = ? ORDER BY position ASC`).all(campaignId) as CrewRow[]).map(mapCrew);
}

export function getCouchCrew(crewId: string): CouchCrewRow | null {
  const row = db().prepare(`SELECT * FROM couch_crew WHERE id = ?`).get(crewId) as CrewRow | undefined;
  return row ? mapCrew(row) : null;
}

export function setCrewPortrait(crewId: string, url: string): void {
  db().prepare(`UPDATE couch_crew SET portrait_url = ? WHERE id = ?`).run(url, crewId);
}

// The claim itself: the card goes to this player only if it is still free
// and they hold no other card here, in one statement, so two phones pressing
// the same card at once cannot both win it. The caller makes the sheet and
// then records it with recordCrewSheet.
export function takeCrewCard(campaignId: string, crewId: string, userId: string): boolean {
  const result = db()
    .prepare(
      `UPDATE couch_crew SET claimed_by = ?
        WHERE id = ? AND campaign_id = ? AND claimed_by IS NULL
          AND NOT EXISTS (SELECT 1 FROM couch_crew WHERE campaign_id = ? AND claimed_by = ?)`,
    )
    .run(userId, crewId, campaignId, campaignId, userId);
  return result.changes === 1;
}

export function releaseCrewCard(crewId: string): void {
  db().prepare(`UPDATE couch_crew SET claimed_by = NULL, sheet_id = NULL WHERE id = ?`).run(crewId);
}

export function recordCrewSheet(crewId: string, sheetId: string): void {
  db().prepare(`UPDATE couch_crew SET sheet_id = ? WHERE id = ?`).run(sheetId, crewId);
}
