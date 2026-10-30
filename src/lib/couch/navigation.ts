import type { Campaign } from "@/lib/db/campaigns";
import { getCurrentLocation, listLocations } from "@/lib/db/locations";
import type { ToolResult } from "@/lib/dm/tool-errors";
import { publishPersisted } from "@/lib/events";
import { crewMap, type CouchNavigation } from "./navigation-logic";

// The crew's map, as the snapshot and the couch_navigation event carry it
// to every seat (docs/couch-navigation.md). Derived from the location
// records the GM keeps with move_party and update_location, so there is
// nothing of its own to store.
export function couchNavigation(campaign: Campaign): CouchNavigation | null {
  if (!campaign.gameSettings.couchMode) return null;
  const current = getCurrentLocation(campaign.id);
  return current ? crewMap(listLocations(campaign.id), current) : null;
}

export function publishCouchNavigation(campaign: Campaign): void {
  if (campaign.gameSettings.couchMode) publishPersisted(campaign.id, "couch_navigation", { navigation: couchNavigation(campaign) });
}

// The one thing the prompt alone cannot hold: a couch crew moves as one,
// so a move naming some of them is refused before any location is written.
// Where they go is the players' to say and the GM's to judge.
export function couchMoveRefusal(campaign: Campaign, characterIds: unknown): ToolResult | null {
  if (!campaign.gameSettings.couchMode) return null;
  if (Array.isArray(characterIds) && characterIds.length) {
    return { error: "The crew cannot split up. Omit characterIds and move everyone together.", refused: "rules" };
  }
  return null;
}
