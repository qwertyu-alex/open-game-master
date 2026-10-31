import { readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { getDatabase, nowIso } from "@/lib/db/core";
import { getLocation } from "@/lib/db/locations";
import { publishCouchNavigation } from "@/lib/couch/navigation";
import { requestUtilityMessage } from "@/lib/dm/model";
import { pictureFile } from "@/lib/dm/scene-shot";
import { stripReasoningArtifacts } from "@/lib/story-prompt";
import type { GeneratedImage } from "@/lib/types";
import { cleanChange, parseSeenReply, PLACE_SEEN_SYSTEM, placeSeenInput, type PlaceShot } from "./place-shots-logic";

// Each place's establishing shot (src/lib/couch/place-shots-logic.ts), one
// row per place. Made here on first use, like the forge's tables
// (src/lib/couch/store.ts), so upstream's locations table stays as it is.
// The place's foreign key cascades, and so does the campaign's.

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_place_shots (
        location_id TEXT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        url TEXT NOT NULL DEFAULT '',
        frame TEXT NOT NULL DEFAULT '',
        seen TEXT NOT NULL DEFAULT '',
        change TEXT NOT NULL DEFAULT '',
        stale INTEGER NOT NULL DEFAULT 0,
        painted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_couch_place_shots_campaign ON couch_place_shots (campaign_id);
    `);
    ensured.add(database);
  }
  return database;
}

type ShotRow = { location_id: string; url: string; frame: string; seen: string; change: string; stale: number };

function fromRow(row: ShotRow): PlaceShot {
  return { locationId: row.location_id, url: row.url, frame: row.frame, seen: row.seen, change: row.change, stale: row.stale === 1 };
}

export function getPlaceShot(locationId: string): PlaceShot | null {
  const row = db().prepare(`SELECT * FROM couch_place_shots WHERE location_id = ?`).get(locationId) as ShotRow | undefined;
  return row ? fromRow(row) : null;
}

export function listPlaceShots(campaignId: string): Map<string, PlaceShot> {
  const rows = db().prepare(`SELECT * FROM couch_place_shots WHERE campaign_id = ?`).all(campaignId) as ShotRow[];
  return new Map(rows.map((row) => [row.location_id, fromRow(row)]));
}

function savePlaceShot(campaignId: string, locationId: string, url: string, frame: string): void {
  db()
    .prepare(
      `INSERT INTO couch_place_shots (location_id, campaign_id, url, frame, seen, change, stale, painted_at)
       VALUES (?, ?, ?, ?, '', '', 0, ?)
       ON CONFLICT(location_id) DO UPDATE SET url = excluded.url, frame = excluded.frame, seen = '', change = '', stale = 0, painted_at = excluded.painted_at`,
    )
    .run(locationId, campaignId, url, frame, nowIso());
}

// Kept only while the picture it describes is still the place's.
function setSeen(locationId: string, url: string, seen: string): boolean {
  return db().prepare(`UPDATE couch_place_shots SET seen = ? WHERE location_id = ? AND url = ?`).run(seen, locationId, url).changes > 0;
}

// repaint_place: the next picture there establishes it again. Null when
// there is no picture of the place to repaint.
export function markPlaceChanged(locationId: string, change: string): PlaceShot | null {
  const done = db()
    .prepare(`UPDATE couch_place_shots SET stale = 1, change = ? WHERE location_id = ? AND url != ''`)
    .run(cleanChange(change), locationId).changes;
  return done ? getPlaceShot(locationId) : null;
}

// A painted establishing shot becomes its place's, every seat's map gets it,
// and then a model looks at it for the GM. The look runs after the picture
// is up, on the text route, so nobody waits on it.
export function keepEstablishingShot(campaignId: string, image: GeneratedImage): void {
  const placeId = image.shot?.placeId;
  if (!image.shot?.establishing || !placeId || !getLocation(placeId)) return;
  savePlaceShot(campaignId, placeId, image.url, image.shot.frame);
  const campaign = getCampaignById(campaignId);
  if (!campaign) return;
  publishCouchNavigation(campaign);
  const look = lookAtPlaceShot(campaign, placeId, image.url, image.shot.frame)
    .catch((error) => {
      console.error(`[place-shot] ${campaignId}: looking at the establishing shot failed`, error);
    })
    .finally(() => looking.delete(look));
  looking.add(look);
}

const looking = new Set<Promise<void>>();

// Every look under way has finished, for the tests.
export async function placeLooksSettled(): Promise<void> {
  while (looking.size) await Promise.all([...looking]);
}

const LOOK_TIMEOUT_MS = 90_000;

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// What the finished picture shows, in words the GM reads from the next turn
// on (navigationPrompt). A route that cannot see pictures says so, and the
// frame the picture was painted from stands in.
async function lookAtPlaceShot(campaign: Campaign, placeId: string, url: string, frame: string): Promise<void> {
  const file = pictureFile(url);
  const place = getLocation(placeId);
  if (!file || !place) return;
  const data = `data:${MIME[path.extname(file).toLowerCase()] ?? "image/png"};base64,${readFileSync(file).toString("base64")}`;
  const { message, error } = await requestUtilityMessage(
    campaign.settings,
    [
      { role: "system", content: PLACE_SEEN_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: placeSeenInput(place.name, frame) },
          { type: "image_url", image_url: { url: data } },
        ],
      },
    ],
    { meta: { task: "place_seen" }, timeoutMs: LOOK_TIMEOUT_MS, thinking: false, temperature: 0.2 },
  );
  const seen = error ? null : parseSeenReply(stripReasoningArtifacts(String(message?.content ?? "")));
  if (!seen) {
    // Logged without the text (PRIVACY: it is the table's story).
    console.error(`[place-shot] ${campaign.id}: ${error ? "the look failed" : "the text model could not see the picture"}; the GM keeps its frame`);
    return;
  }
  if (setSeen(placeId, url, seen)) {
    const fresh = getCampaignById(campaign.id);
    if (fresh) publishCouchNavigation(fresh);
  }
}
