import path from "node:path";
import { DEFAULT_STYLE_LOCK } from "@/lib/couch/forge-logic";
import { ITEM_ART_NIGHT_MAX, ITEM_ART_TRIES, itemArtKey, itemArtPrompt, paintedItemIcon } from "@/lib/couch/item-art-logic";
import { getCouchForge, listItemArt, recordItemArtTry, setItemArt } from "@/lib/couch/store";
import { getCampaignById } from "@/lib/db/campaigns";
import { toEnglishForImage } from "@/lib/image-english";
import { generateStoryImage } from "@/lib/image-generate";
import { scheduleImageVariants } from "@/lib/image-variants";
import { enqueueMediaJob, type MediaLane } from "@/lib/media-queue";
import { copyIntoUploads, whenImagesAvailable } from "@/lib/portrait";
import { configuredDefaultStorySettings } from "@/lib/runtime-defaults";

// The pictures a couch night paints for the things its crew carries, on the
// media queue beside the portraits and scene pictures, in the night's own
// look (the forge's style lock). Only an item the painted icon set lacks is
// painted (src/lib/couch/item-art-logic.ts), once per name per night, so
// two players' rations share one. The phone asks for its items and reads
// back what is ready (POST /api/campaigns/[id]/couch/item-art).
//
// A phone's first look at its inventory asks for every item at once, a few
// dozen pictures. On the shared gpu lane they ran ahead of the turn's scene
// picture, and the TV sat black for minutes while bedrolls were painted. On a
// remote painter they take a lane of their own (as fight pictures do,
// src/lib/couch/fight-art.ts), so the scene never waits behind them.

declare global {
  var __odmCouchItemArt: Set<string> | undefined;
}

// Item keys being painted now, by campaign: a second ask while one paints
// is not queued twice.
function running(): Set<string> {
  return (globalThis.__odmCouchItemArt ??= new Set());
}

export type ItemArtState = {
  // Item key to picture, for every item of the ones asked that has one.
  art: Record<string, string>;
  // Whether any of them is still being painted, so the phone asks again.
  pending: boolean;
};

// What the night has for these items, painting the ones it lacks within
// the night's budget. Items with a painted icon are never painted.
export function itemArtFor(campaignId: string, names: readonly string[]): ItemArtState {
  const rows = new Map(listItemArt(campaignId).map((row) => [row.key, row]));
  const art: Record<string, string> = {};
  let pending = false;
  let budget = ITEM_ART_NIGHT_MAX - rows.size;
  const forge = getCouchForge(campaignId);
  const styleLock = forge?.forge?.styleLock || DEFAULT_STYLE_LOCK;
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    const key = itemArtKey(name);
    if (!key || seen.has(key) || paintedItemIcon(name)) continue;
    seen.add(key);
    const row = rows.get(key);
    if (row?.url) {
      art[key] = row.url;
      continue;
    }
    const flight = `${campaignId}\u0000${key}`;
    if (running().has(flight)) {
      pending = true;
      continue;
    }
    if ((row?.tries ?? 0) >= ITEM_ART_TRIES || (!row && budget <= 0)) continue;
    if (!row) budget -= 1;
    pending = true;
    paintItem(campaignId, key, name, styleLock);
  }
  return { art, pending };
}

function paintItem(campaignId: string, key: string, name: string, styleLock: string): void {
  const flight = `${campaignId}\u0000${key}`;
  running().add(flight);
  recordItemArtTry(campaignId, key);
  void whenImagesAvailable(() =>
    enqueueMediaJob(`couch item ${campaignId} ${key}`, async () => {
      try {
        // The name is the table's language; an image model reads English.
        const campaign = getCampaignById(campaignId);
        if (!campaign) return;
        const { item } = await toEnglishForImage(campaign, { item: name });
        const image = await generateStoryImage(configuredDefaultStorySettings(), {
          prompt: itemArtPrompt(item, styleLock),
          mode: "fast",
          aspect: "square",
        });
        const copied = copyIntoUploads(image.url);
        setItemArt(campaignId, key, copied.url);
        // A tile is a few dozen pixels wide and a phone pulls twenty of them
        // over the room's tunnel: the small WebP copies, not the full PNG.
        scheduleImageVariants(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads", `${copied.id}.png`));
      } catch (error) {
        console.error(`[couch] item picture failed for ${name} (${campaignId}):`, error);
      }
    }, laneFor(campaignId)),
  ).finally(() => {
    // Painted, failed, or no painter on this server: nothing is in flight.
    running().delete(flight);
  });
}

// This machine's GPU paints one picture at a time, so there the items stay
// in the one queue.
function laneFor(campaignId: string): MediaLane {
  const backend = configuredDefaultStorySettings().imageBackend;
  return backend === "harness" || backend === "openai" ? `couch:${campaignId}:items` : "gpu";
}
