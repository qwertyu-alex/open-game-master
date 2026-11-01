import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import type { Forge } from "@/lib/couch/forge-logic";
import { isCouchMood, type MoodState } from "@/lib/couch/mood-logic";
import type { CreateSheetInput } from "@/lib/schemas/sheet";
import { readObjective, type CouchObjective } from "@/lib/couch/pacing-logic";
import { readActPoints, readActRecaps } from "@/lib/couch/act-break-logic";

// A couch night's forge and its crew cards (docs/couch-mode-spec.md 2.1).
//
// couch_forges: one row per couch campaign, the forge's state ("forging",
// "ready", "failed") and, once ready, its whole output, the scenario the GM
// keeps secret included. Only src/lib/couch reads it, and nothing it holds
// leaves the server except the title, logline and briefing.
//
// couch_moods: the music director's state (src/lib/couch/mood.ts), one row
// per couch campaign once the first turn has set it.
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
  // A ready-made story's id (src/lib/couch/scenarios), or "" for one the
  // story model writes tonight from the seed.
  scenarioId: string;
  forge: Forge | null;
  // The act in force, 0 to 2 (src/lib/couch/play.ts advanceCouchAct).
  act: number;
  // How far the TV's introductions have got (src/lib/couch/intro-logic.ts):
  // 0 is the briefing, then one step per crew member. The cards open once
  // it passes the last.
  introStep: number;
  // When the act in force began (src/lib/couch/pacing.ts): "" until the
  // first turn of the night reads it.
  actSince: string;
  // What every screen shows the crew is trying to do now (set_objective).
  objective: CouchObjective | null;
  // When anything last came at the crew (src/lib/couch/tension.ts): "" until
  // the first strike, when the act clock stands in for it.
  pressureAt: string;
  // The deck beats already played, as "act.index" (tension-logic.ts beatId).
  beatsUsed: string[];
  // The story points of each act that has ended, by act index
  // (src/lib/couch/act-break-logic.ts), as the GM wrote them at the break.
  recaps: string[][];
  // Story points awarded in the act in force, by sheet id: the act break's
  // roll call (src/lib/couch/act-break-logic.ts actRollCall).
  actPoints: Record<string, number>;
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

// Past any crew's last introduction: the cards are open.
const INTRO_OPEN = 999;

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
      CREATE TABLE IF NOT EXISTS couch_moods (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        mood TEXT NOT NULL,
        since INTEGER NOT NULL,
        stated TEXT,
        stated_act INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS couch_item_art (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        url TEXT,
        tries INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, item_key)
      );
    `);
    // Added after the table first shipped: a night made before it has no
    // ready-made story, which is what the default says.
    const columns = database.prepare(`PRAGMA table_info(couch_forges)`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "scenario_id")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN scenario_id TEXT NOT NULL DEFAULT ''`);
    }
    // Also later: a night forged before the TV introduced its crew has its
    // cards open already, which is what the large default says.
    if (!columns.some((column) => column.name === "intro_step")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN intro_step INTEGER NOT NULL DEFAULT ${INTRO_OPEN}`);
    }
    // Later still, for the night's pace: a night already under way starts
    // its act clock at the next turn, with nothing on screen yet.
    if (!columns.some((column) => column.name === "act_since")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN act_since TEXT NOT NULL DEFAULT ''`);
    }
    if (!columns.some((column) => column.name === "objective_json")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN objective_json TEXT NOT NULL DEFAULT ''`);
    }
    // And the tension clock: a night under way counts from its act clock
    // until something next comes at the crew, with its whole deck unplayed.
    if (!columns.some((column) => column.name === "pressure_at")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN pressure_at TEXT NOT NULL DEFAULT ''`);
    }
    if (!columns.some((column) => column.name === "beats_used_json")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN beats_used_json TEXT NOT NULL DEFAULT ''`);
    }
    // And the act breaks' recaps: a night under way has none for the acts
    // it already turned.
    if (!columns.some((column) => column.name === "recaps_json")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN recaps_json TEXT NOT NULL DEFAULT ''`);
    }
    // And the act's awards: a night under way counts from its next award.
    if (!columns.some((column) => column.name === "act_points_json")) {
      database.exec(`ALTER TABLE couch_forges ADD COLUMN act_points_json TEXT NOT NULL DEFAULT ''`);
    }
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
  scenario_id: string;
  forge_json: string;
  act: number;
  intro_step: number;
  act_since: string | null;
  objective_json: string | null;
  pressure_at: string | null;
  beats_used_json: string | null;
  recaps_json: string | null;
  act_points_json: string | null;
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

const readIds = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);

function mapForge(row: ForgeRow): CouchForgeRow {
  return {
    campaignId: row.campaign_id,
    status: row.status === "ready" || row.status === "failed" ? row.status : "forging",
    error: row.error,
    players: row.players,
    seed: row.seed,
    offLimits: row.off_limits,
    scenarioId: row.scenario_id ?? "",
    forge: parseJson<Forge | null>(row.forge_json, null),
    act: row.act,
    introStep: row.intro_step ?? INTRO_OPEN,
    actSince: row.act_since ?? "",
    objective: readObjective(parseJson<unknown>(row.objective_json || "null", null)),
    pressureAt: row.pressure_at ?? "",
    beatsUsed: readIds(parseJson<unknown>(row.beats_used_json || "[]", [])),
    recaps: readActRecaps(parseJson<unknown>(row.recaps_json || "[]", [])),
    actPoints: readActPoints(parseJson<unknown>(row.act_points_json || "{}", {})),
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
export function beginCouchForge(campaignId: string, input: { players: number; seed: string; offLimits: string; scenarioId?: string }): void {
  const now = nowIso();
  const database = db();
  database.transaction(() => {
    database.prepare(`DELETE FROM couch_crew WHERE campaign_id = ?`).run(campaignId);
    database.prepare(`DELETE FROM couch_moods WHERE campaign_id = ?`).run(campaignId);
    database
      .prepare(
        `INSERT INTO couch_forges (campaign_id, status, error, players, seed, off_limits, scenario_id, forge_json, act, intro_step, created_at, updated_at)
         VALUES (?, 'forging', '', ?, ?, ?, ?, '', 0, 0, ?, ?)
         ON CONFLICT (campaign_id) DO UPDATE SET status = 'forging', error = '', players = excluded.players,
           seed = excluded.seed, off_limits = excluded.off_limits, scenario_id = excluded.scenario_id, forge_json = '', act = 0,
           intro_step = 0, act_since = '', objective_json = '', pressure_at = '', beats_used_json = '', recaps_json = '', act_points_json = '', updated_at = excluded.updated_at`,
      )
      .run(campaignId, input.players, input.seed, input.offLimits, input.scenarioId ?? "", now, now);
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

// A new act starts its clock and clears the objective and the act's awards,
// which belonged to the act before; the recap is the story points of the
// act that ended.
export function setCouchAct(campaignId: string, act: number, recap: string[] = []): void {
  const now = nowIso();
  const recaps = [...(getCouchForge(campaignId)?.recaps ?? [])];
  while (recaps.length < act - 1) recaps.push([]);
  recaps[act - 1] = recap;
  db()
    .prepare(`UPDATE couch_forges SET act = ?, act_since = ?, objective_json = '', recaps_json = ?, act_points_json = '', updated_at = ? WHERE campaign_id = ?`)
    .run(act, now, JSON.stringify(recaps.slice(0, Math.max(0, act))), now, campaignId);
}

// The first turn of a night (or of a night already under way when the act
// clock shipped) starts act I's clock; after that it is left alone.
export function startCouchActClock(campaignId: string): string {
  const now = nowIso();
  db().prepare(`UPDATE couch_forges SET act_since = ? WHERE campaign_id = ? AND act_since = ''`).run(now, campaignId);
  return getCouchForge(campaignId)?.actSince || now;
}

export function setCouchObjective(campaignId: string, objective: CouchObjective): void {
  db().prepare(`UPDATE couch_forges SET objective_json = ?, updated_at = ? WHERE campaign_id = ?`).run(JSON.stringify(objective), nowIso(), campaignId);
}

// A story point awarded: counted toward the act break's roll call.
export function addCouchActPoint(campaignId: string, sheetId: string): void {
  const forge = getCouchForge(campaignId);
  if (!forge) return;
  const points = { ...forge.actPoints, [sheetId]: (forge.actPoints[sheetId] ?? 0) + 1 };
  db().prepare(`UPDATE couch_forges SET act_points_json = ? WHERE campaign_id = ?`).run(JSON.stringify(points), campaignId);
}

// Something came at the crew: the tension clock starts over.
export function markCouchPressure(campaignId: string): void {
  db().prepare(`UPDATE couch_forges SET pressure_at = ? WHERE campaign_id = ?`).run(nowIso(), campaignId);
}

// A deck beat was played; playing it twice changes nothing.
export function markCouchBeatPlayed(campaignId: string, id: string): void {
  const used = getCouchForge(campaignId)?.beatsUsed ?? [];
  if (used.includes(id)) return;
  db().prepare(`UPDATE couch_forges SET beats_used_json = ? WHERE campaign_id = ?`).run(JSON.stringify([...used, id]), campaignId);
}

// The TV moves its introductions on from the step it was showing. Only from
// that step, so two TV tabs finishing the same clip move it once, and a
// late press of Next never skips a step nobody saw.
export function advanceCouchIntro(campaignId: string, from: number, to: number): boolean {
  const result = db()
    .prepare(`UPDATE couch_forges SET intro_step = ? WHERE campaign_id = ? AND intro_step = ? AND status = 'ready'`)
    .run(to, campaignId, from);
  return result.changes === 1;
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

// A crew member who joined after a death (src/lib/couch/takeover.ts): a
// card made already taken, last in the crew, so the portrait painter, the
// scene painter's visual bible and a reload all find them as they find
// the rest. takeCrewCard's one-card rule is for the lobby's choice; a
// player who lost a character holds two cards, the dead one and this.
export function addTakenCrewCard(
  campaignId: string,
  member: Omit<CouchCrewRow, "id" | "campaignId" | "position" | "portraitUrl" | "claimedBy" | "sheetId">,
  userId: string,
  sheetId: string,
  portraitUrl: string | null,
): CouchCrewRow {
  const database = db();
  const id = crypto.randomUUID();
  const { next } = database.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM couch_crew WHERE campaign_id = ?`).get(campaignId) as { next: number };
  database
    .prepare(
      `INSERT INTO couch_crew (id, campaign_id, position, name, crew_role, backstory, career, gender, look, sheet_json, portrait_url, claimed_by, sheet_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, campaignId, next, member.name, member.crewRole, member.backstory, member.career, member.gender, member.look, JSON.stringify(member.sheet), portraitUrl, userId, sheetId, nowIso());
  return getCouchCrew(id)!;
}

// The person a player took over stands behind their new sheet, as a
// lasting companion's row does (src/lib/db/npcs.ts listCastNpcs): while the
// sheet lives, the GM's cast, the voices and the scene painter read the
// sheet, so nobody plays them twice. The row keeps who they were.
export function linkNpcToCrewSheet(npcId: string, sheetId: string): void {
  db().prepare(`UPDATE npcs SET companion_sheet_id = ?, attitude = 'friendly', updated_at = ? WHERE id = ?`).run(sheetId, nowIso(), npcId);
}

type MoodRow = { mood: string; since: number; stated: string | null; stated_act: number };

export function getCouchMood(campaignId: string): MoodState | null {
  const row = db().prepare(`SELECT mood, since, stated, stated_act FROM couch_moods WHERE campaign_id = ?`).get(campaignId) as
    | MoodRow
    | undefined;
  if (!row || !isCouchMood(row.mood)) return null;
  return { mood: row.mood, since: row.since, stated: isCouchMood(row.stated) ? row.stated : null, statedAct: row.stated_act };
}

export function setCouchMood(campaignId: string, state: MoodState): void {
  db()
    .prepare(
      `INSERT INTO couch_moods (campaign_id, mood, since, stated, stated_act, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (campaign_id) DO UPDATE SET mood = excluded.mood, since = excluded.since, stated = excluded.stated,
         stated_act = excluded.stated_act, updated_at = excluded.updated_at`,
    )
    .run(campaignId, state.mood, state.since, state.stated, state.statedAct, nowIso());
}

// The pictures a night painted for the things its crew carries
// (src/lib/couch/item-art.ts), by item key: a url once painted, and how
// often each was tried.
export type ItemArtRow = { key: string; url: string | null; tries: number };

export function listItemArt(campaignId: string): ItemArtRow[] {
  return (
    db().prepare(`SELECT item_key, url, tries FROM couch_item_art WHERE campaign_id = ?`).all(campaignId) as Array<{
      item_key: string;
      url: string | null;
      tries: number;
    }>
  ).map((row) => ({ key: row.item_key, url: row.url, tries: row.tries }));
}

export function recordItemArtTry(campaignId: string, key: string): void {
  db()
    .prepare(
      `INSERT INTO couch_item_art (campaign_id, item_key, url, tries, updated_at) VALUES (?, ?, NULL, 1, ?)
       ON CONFLICT (campaign_id, item_key) DO UPDATE SET tries = tries + 1, updated_at = excluded.updated_at`,
    )
    .run(campaignId, key, nowIso());
}

export function setItemArt(campaignId: string, key: string, url: string): void {
  db().prepare(`UPDATE couch_item_art SET url = ?, updated_at = ? WHERE campaign_id = ? AND item_key = ?`).run(url, nowIso(), campaignId, key);
}
