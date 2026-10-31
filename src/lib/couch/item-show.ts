import { randomUUID } from "node:crypto";
import type { Campaign } from "@/lib/db/campaigns";
import type { StoredRoll } from "@/lib/db/rolls";
import { listSheets } from "@/lib/db/sheets";
import { findCarriedItem } from "@/lib/dm/item-logic";
import { publishPersisted } from "@/lib/events";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { itemArtFor } from "@/lib/couch/item-art";
import { itemArtKey, paintedItemIcon } from "@/lib/couch/item-art-logic";
import { itemUseFromTool, rollItemTerm, rollWielderId, type CouchItemPicture, type CouchItemShow } from "@/lib/couch/item-show-logic";

// The TV's pictures of the things the crew carries (item-show-logic.ts):
// read from the same painted icons and night paintings as the phone's Gear
// section, here on the server, since the TV's account may hold none of the
// sheets the phone's route paints for.

// The picture for an item, or null while the night has none. Asking also
// starts its painting, within the night's budget, so the next use has one;
// the TV never waits for paint.
export function couchItemPicture(campaignId: string, name: string, srdName?: string): string | null {
  return paintedItemIcon(name, srdName) ?? itemArtFor(campaignId, [name]).art[itemArtKey(name)] ?? null;
}

// The weapon a crew member's attack or damage roll swings, when it is one
// they carry and it has a picture.
export function couchRollItem(campaignId: string, roll: StoredRoll, sheets: readonly CharacterSheet[]): CouchItemPicture | null {
  const term = rollItemTerm(roll.kind, roll.detail);
  const wielderId = rollWielderId(roll);
  if (!term || !wielderId) return null;
  const carried = sheets.find((sheet) => sheet.id === wielderId)?.equipment;
  const item = carried ? findCarriedItem(carried, term) : null;
  if (!item) return null;
  const art = couchItemPicture(campaignId, item.name, item.srdName);
  return art ? { name: item.name, art } : null;
}

// A use_item the GM made in the open, shown beside the scene. Called after
// every couch model tool (src/lib/dm/turn.ts); anything else, a refusal, or
// an item with no picture yet shows nothing.
export function publishCouchItemUse(campaign: Campaign, turnId: string, toolName: string, rawArguments: string, outcome: Record<string, unknown>) {
  if (!campaign.gameSettings.couchMode || toolName !== "use_item") return;
  const sheets = listSheets(campaign.id);
  const use = itemUseFromTool(rawArguments, outcome, sheets);
  if (!use) return;
  const srdName = sheets.find((sheet) => sheet.id === use.sheet.id)?.equipment.find((item) => item.name === use.item)?.srdName;
  const art = couchItemPicture(campaign.id, use.item, srdName);
  if (!art) return;
  const show: CouchItemShow = {
    id: randomUUID(),
    turnId,
    characterId: use.sheet.id,
    characterName: use.sheet.name,
    name: use.item,
    art,
    ...(use.target ? { targetName: use.target.name } : {}),
    ...(use.remaining !== undefined ? { remaining: use.remaining } : {}),
  };
  publishPersisted(campaign.id, "couch_item", show);
}
