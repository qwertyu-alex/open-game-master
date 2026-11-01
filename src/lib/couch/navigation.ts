import { getCampaignById, getFloor, setFloor, type Campaign } from "@/lib/db/campaigns";
import { getActiveEncounter } from "@/lib/db/encounters";
import { getCurrentLocation, listLocations } from "@/lib/db/locations";
import { getSheetById } from "@/lib/db/sheets";
import { followSceneAmbience } from "@/lib/dm/ambience-tools";
import { rollInitiativeNow } from "@/lib/dm/encounter-tools";
import type { ToolResult } from "@/lib/dm/tool-errors";
import { publishPersisted } from "@/lib/events";
import { crewMap, type CouchNavigation } from "./navigation-logic";
import { couchSitePrompt, publishCouchSite } from "./site";
import { listPlaceShots } from "./place-shots";
import { placePicture } from "./place-shots-logic";
import { couchCrew, couchGroups, cutScene, offSceneWaits, pinCrewHere, placeCrew } from "./whereabouts";
import { floorAfterCut, isSplit, planMove, spotlightGroup, whereaboutsPrompt, type CrewGroup } from "./whereabouts-logic";

// Where the crew stands, as the snapshot and the couch_navigation event
// carry it to every seat (docs/couch-navigation.md): the scene's place and
// its establishing shot (src/lib/couch/place-shots.ts), and who stands
// where once the crew splits (src/lib/couch/whereabouts.ts). The map
// itself is the site's (src/lib/couch/site.ts couchSite).
export function couchNavigation(campaign: Campaign): CouchNavigation | null {
  if (!campaign.gameSettings.couchMode) return null;
  const current = getCurrentLocation(campaign.id);
  if (!current) return null;
  const shots = listPlaceShots(campaign.id);
  const places = listLocations(campaign.id).map((place) => ({ ...place, picture: placePicture(shots.get(place.id) ?? null) }));
  return crewMap(places, current, couchGroups(campaign) ?? []);
}

// The GM's half of who stands where: the groups, how long each off scene
// has waited and what its players sent meanwhile.
export function couchWhereaboutsPrompt(campaign: Campaign): string {
  // The night's site, from before the first move (src/lib/couch/site.ts).
  const site = couchSitePrompt(campaign);
  const groups = couchGroups(campaign);
  if (!groups) return site;
  return [site, whereaboutsPrompt(groups, offSceneWaits(campaign, groups))].filter(Boolean).join("\n");
}

export function publishCouchNavigation(campaign: Campaign): void {
  if (!campaign.gameSettings.couchMode) return;
  publishPersisted(campaign.id, "couch_navigation", { navigation: couchNavigation(campaign) });
  publishCouchSite(campaign);
  settleFloorToScene(campaign);
}

// The turn never stays with someone the scene has left: whenever the map
// changes, a question still waiting on a crew member off scene is withdrawn
// (src/lib/couch/whereabouts-logic.ts floorAfterCut), so no phone reads
// "Waiting on Rafe" while the story is elsewhere.
function settleFloorToScene(campaign: Campaign): void {
  const groups = couchGroups(campaign);
  const scene = groups && isSplit(groups) ? groups.find((group) => group.inScene) : null;
  if (!scene) return;
  const floor = floorAfterCut(getFloor(campaign.id), new Set(scene.members.map((member) => member.userId)));
  if (floor) {
    setFloor(campaign.id, floor);
    publishPersisted(campaign.id, "floor_changed", { floor });
  }
}

// Who a couch move_party moves (src/lib/couch/whereabouts-logic.ts
// planMove), checked before any location is written: the scene's group
// with no names, some of them to split it, someone off scene only into the
// scene. Everyone stands where they are first, so the ones who stay keep
// their place when the scene follows the movers.
export type CouchMove = { movers: string[]; joined: string[] };

export function couchMove(campaign: Campaign, destination: string, characterIds: unknown): ToolResult | CouchMove | null {
  if (!campaign.gameSettings.couchMode) return null;
  const groups = couchGroups(campaign);
  if (!groups) return null;
  const named = Array.isArray(characterIds) ? characterIds.filter((ref): ref is string => typeof ref === "string" && ref.trim() !== "").map((ref) => ref.trim()) : null;
  const plan = planMove({ crew: couchCrew(campaign), groups, destination, named });
  if (!plan.ok) {
    return plan.refused ? { error: plan.error, refused: plan.refused } : { error: plan.error, retry: true };
  }
  pinCrewHere(campaign);
  return { movers: plan.movers, joined: plan.joined };
}

// The move is written: the movers stand in the new place, and anyone who
// ran into a fight there takes a place in its order. What the GM is told.
export function placeCouchMovers(campaign: Campaign, move: CouchMove, locationId: string, placeName: string): string {
  placeCrew(campaign, move.movers, locationId);
  const groups = couchGroups(campaign) ?? [];
  const notes: string[] = [];
  if (move.joined.length && getActiveEncounter(campaign.id)) {
    for (const id of move.joined) {
      const sheet = getSheetById(id);
      if (sheet) notes.push(rollInitiativeNow(campaign, sheet) ?? `${sheet.name} joins the fight.`);
    }
  }
  if (groups.length > 1) {
    const stayed = groups.filter((group) => !group.inScene).map((group) => `${group.members.map((member) => member.name).join(", ")} in ${group.placeName}`);
    notes.unshift(`The scene follows the group in ${placeName}; ${stayed.join("; ")} ${stayed.length === 1 && groups[1].members.length === 1 ? "is" : "are"} off scene (CREW WHEREABOUTS).`);
  } else if (move.joined.length) {
    notes.unshift("The crew is together again.");
  }
  return notes.join(" ");
}

// The scene cuts to a group (cut_to, or a question put to someone off
// scene): its place becomes the scene, every screen hears it, the sound
// follows, and a question still waiting on someone now off scene is
// withdrawn so it does not hold the new scene's phones shut.
export function cutCouchScene(campaign: Campaign, group: CrewGroup): void {
  cutScene(campaign, group);
  const fresh = getCampaignById(campaign.id) ?? campaign;
  // Publishing the map also withdraws a question left with the old scene.
  publishCouchNavigation(fresh);
  followSceneAmbience(fresh, getCurrentLocation(campaign.id)?.ambience?.bed || null);
}

// A question the GM puts to the table (request_player_input) while the
// crew is split goes where the scene is: to the asked who stand in it, or,
// when none do, the scene cuts to the first one's group, so the TV turns to
// whoever's turn it is. Not mid-fight, when the fight holds the scene.
export function couchSpotlight(campaign: Campaign, asked: { userIds: string[]; prompt: string }): { userIds: string[]; prompt: string } | null {
  const groups = couchGroups(campaign);
  if (!groups || !isSplit(groups)) return asked;
  const picked = spotlightGroup(groups, asked.userIds);
  if (picked.cut) {
    if (getActiveEncounter(campaign.id)) return null;
    cutCouchScene(campaign, picked.cut);
  }
  return picked.userIds.length ? { userIds: picked.userIds, prompt: asked.prompt } : null;
}
