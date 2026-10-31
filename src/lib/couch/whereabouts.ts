import type { Campaign } from "@/lib/db/campaigns";
import { setCampaignScene } from "@/lib/db/campaigns";
import { getDatabase, nowIso } from "@/lib/db/core";
import { getCurrentLocation, getLocationByName, listLocations, upsertCurrentLocation } from "@/lib/db/locations";
import { listSheets } from "@/lib/db/sheets";
import { publishPersisted } from "@/lib/events";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { crewGroups, groupOf, isSplit, sceneGroup, type CouchSceneTag, type CrewGroup, type CrewMember, type OffScene } from "./whereabouts-logic";

// Where each crew member is (src/lib/couch/whereabouts-logic.ts), kept in
// couch tables made on first use like the forge's (src/lib/couch/store.ts),
// so upstream's locations and messages stay as they are:
//
//   couch_whereabouts, one row per crew member: their place, and the seq of
//   the last GM passage they were in the scene for;
//   couch_scene_tags, one row per message written while the crew was split:
//   the group it belongs to, for the phones' story.

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_whereabouts (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        sheet_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        last_scene_seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, sheet_id)
      );
      CREATE TABLE IF NOT EXISTS couch_scene_tags (
        message_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        place_name TEXT NOT NULL,
        sheet_ids_json TEXT NOT NULL,
        in_scene INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_couch_scene_tags_campaign ON couch_scene_tags (campaign_id);
    `);
    ensured.add(database);
  }
  return database;
}

// The crew a couch night tracks: the players' living characters. The TV's
// own seat plays none, and a companion or a summoned thing goes with
// whoever it is with.
export function couchCrew(campaign: Campaign, sheets: readonly CharacterSheet[] = listSheets(campaign.id)): CrewMember[] {
  return sheets
    .filter((sheet) => sheet.userId && sheet.userId !== campaign.leadUserId && !sheet.isCompanion && !sheet.summon && !sheet.deathSaves?.dead)
    .map((sheet) => ({ id: sheet.id, name: sheet.name, userId: sheet.userId, portraitUrl: sheet.portrait?.url ?? null }));
}

type Row = { sheet_id: string; location_id: string; last_scene_seq: number };

function rows(campaignId: string): Row[] {
  return db().prepare(`SELECT sheet_id, location_id, last_scene_seq FROM couch_whereabouts WHERE campaign_id = ?`).all(campaignId) as Row[];
}

// The crew's groups, the scene's first; null away from a couch night or
// before the crew stands anywhere.
export function couchGroups(campaign: Campaign, sheets?: readonly CharacterSheet[]): CrewGroup[] | null {
  if (!campaign.gameSettings.couchMode) return null;
  const scene = getCurrentLocation(campaign.id);
  if (!scene) return null;
  const names = new Map(listLocations(campaign.id).map((place) => [place.id, place.name]));
  const placeOf = new Map<string, string>();
  for (const row of rows(campaign.id)) {
    const name = names.get(row.location_id);
    if (name) placeOf.set(row.sheet_id, name);
  }
  return crewGroups(couchCrew(campaign, sheets), placeOf, scene.name);
}

// The sheet ids in the scene while the crew is split; null while it is
// together (or away from a couch night), when everyone is.
export function inSceneIds(campaign: Campaign, sheets?: readonly CharacterSheet[]): Set<string> | null {
  const groups = couchGroups(campaign, sheets);
  if (!groups || !isSplit(groups)) return null;
  return new Set(sceneGroup(groups)?.members.map((member) => member.id) ?? []);
}

// Whether a sheet is a crew member somewhere the story is not.
export function offScene(campaign: Campaign, sheetId: string): CrewGroup | null {
  const groups = couchGroups(campaign);
  if (!groups || !isSplit(groups)) return null;
  const group = groupOf(groups, sheetId);
  return group && !group.inScene ? group : null;
}

// Pins every crew member without a row where they stand now (the scene), so
// a move or a cut that changes the scene leaves them there.
function pinCrew(campaign: Campaign, crew: readonly CrewMember[], locationId: string): void {
  const insert = db().prepare(
    `INSERT OR IGNORE INTO couch_whereabouts (campaign_id, sheet_id, location_id, last_scene_seq, updated_at) VALUES (?, ?, ?, 0, ?)`,
  );
  const now = nowIso();
  for (const member of crew) insert.run(campaign.id, member.id, locationId, now);
}

// Before a move writes the new place: everyone stays where they stand.
export function pinCrewHere(campaign: Campaign): void {
  if (!campaign.gameSettings.couchMode) return;
  const scene = getCurrentLocation(campaign.id);
  if (scene) pinCrew(campaign, couchCrew(campaign), scene.id);
}

// After the move: the movers stand in the new place.
export function placeCrew(campaign: Campaign, sheetIds: readonly string[], locationId: string): void {
  const write = db().prepare(
    `INSERT INTO couch_whereabouts (campaign_id, sheet_id, location_id, last_scene_seq, updated_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (campaign_id, sheet_id) DO UPDATE SET location_id = excluded.location_id, updated_at = excluded.updated_at`,
  );
  const now = nowIso();
  for (const id of sheetIds) write.run(campaign.id, id, locationId, now);
}

// The scene cuts to another group: its place becomes upstream's current
// location (its layout and exits kept), so the GM's GAME STATE, the sound
// and the pictures all follow.
export function cutScene(campaign: Campaign, group: CrewGroup): void {
  pinCrewHere(campaign);
  const place = getLocationByName(campaign.id, group.placeName);
  const location = upsertCurrentLocation({ campaignId: campaign.id, name: place?.name ?? group.placeName });
  setCampaignScene(campaign.id, location.name);
  publishPersisted(campaign.id, "location_updated", { location });
}

// A GM passage landed: whoever was in the scene for it has been seen now.
export function markSceneSeen(campaign: Campaign, seq: number): void {
  const groups = couchGroups(campaign);
  const scene = groups ? sceneGroup(groups) : null;
  if (!scene) return;
  const write = db().prepare(`UPDATE couch_whereabouts SET last_scene_seq = ? WHERE campaign_id = ? AND sheet_id = ?`);
  for (const member of scene.members) write.run(seq, campaign.id, member.id);
}

// Each off-scene group's wait: GM passages since its members were last in
// the scene, and the moves they sent since then.
export function offSceneWaits(campaign: Campaign, groups: readonly CrewGroup[]): OffScene[] {
  const seen = new Map(rows(campaign.id).map((row) => [row.sheet_id, row.last_scene_seq]));
  const database = getDatabase();
  return groups
    .filter((group) => !group.inScene)
    .map((group) => {
      const since = Math.max(0, ...group.members.map((member) => seen.get(member.id) ?? 0));
      const turnsAway = (
        database
          .prepare(`SELECT COUNT(*) AS n FROM campaign_messages WHERE campaign_id = ? AND author_type = 'dm' AND seq > ?`)
          .get(campaign.id, since) as { n: number }
      ).n;
      const ids = group.members.map((member) => member.id);
      const moves = (
        database
          .prepare(
            `SELECT character_id AS characterId, content FROM campaign_messages
             WHERE campaign_id = ? AND author_type = 'player' AND seq > ? AND content NOT LIKE '(ooc) %'
             AND character_id IN (${ids.map(() => "?").join(", ")})
             ORDER BY seq ASC`,
          )
          .all(campaign.id, since, ...ids) as Array<{ characterId: string; content: string }>
      ).map((move) => ({ name: group.members.find((member) => member.id === move.characterId)?.name ?? "Crew", content: move.content }));
      return { placeId: group.placeId, turnsAway, moves };
    });
}

// ---- the story's group marks ----

// A message written while the crew is split carries its group: a player's
// move the poster's, a GM passage the scene's. Together, nothing is marked.
export function tagMessage(campaign: Campaign, messageId: string, sheetId: string | null): CouchSceneTag | null {
  const groups = couchGroups(campaign);
  if (!groups || !isSplit(groups)) return null;
  const group = sheetId ? groupOf(groups, sheetId) : sceneGroup(groups);
  if (!group) return null;
  const tag: CouchSceneTag = { messageId, placeName: group.placeName, sheetIds: group.members.map((member) => member.id), inScene: group.inScene };
  db()
    .prepare(`INSERT OR REPLACE INTO couch_scene_tags (message_id, campaign_id, place_name, sheet_ids_json, in_scene, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(messageId, campaign.id, tag.placeName, JSON.stringify(tag.sheetIds), tag.inScene ? 1 : 0, nowIso());
  publishPersisted(campaign.id, "couch_scene_tag", { tag });
  return tag;
}

export function listSceneTags(campaignId: string): CouchSceneTag[] {
  const found = db()
    .prepare(`SELECT message_id, place_name, sheet_ids_json, in_scene FROM couch_scene_tags WHERE campaign_id = ? ORDER BY created_at ASC`)
    .all(campaignId) as Array<{ message_id: string; place_name: string; sheet_ids_json: string; in_scene: number }>;
  return found.map((row) => ({
    messageId: row.message_id,
    placeName: row.place_name,
    sheetIds: (JSON.parse(row.sheet_ids_json) as unknown[]).map(String),
    inScene: row.in_scene === 1,
  }));
}

