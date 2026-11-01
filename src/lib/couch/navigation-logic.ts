import { textKey } from "@/lib/language/text-logic";
import type { PlacePicture } from "./place-shots-logic";
import type { CrewGroup } from "./whereabouts-logic";

// Where the crew stands (docs/couch-navigation.md), beside the night's site
// map (src/lib/couch/site.ts): the scene's place with its establishing
// shot, and who stands where once the crew splits up
// (src/lib/couch/whereabouts-logic.ts). The room is in one place, talking,
// so nobody votes: a player says where they go in the action box and the
// GM moves them, the whole crew or whoever goes. Pure, for
// scripts/test-couch-navigation.mjs.

export type RoutePlace = {
  name: string;
  // Its establishing shot, once painted (src/lib/couch/place-shots.ts).
  picture?: PlacePicture | null;
};
// A place the crew stands in carries its establishing shot once there is one.
export type MapRoom = { id: string; name: string; picture?: PlacePicture };
// Who stands where: one group while the crew is together, up to three once
// it splits, the scene's first.
export type MapCrew = { id: string; name: string; portraitUrl: string | null };
export type MapGroup = { room: MapRoom; crew: MapCrew[]; inScene: boolean };
export type CouchNavigation = {
  // Where the scene is: the place the story follows.
  here: MapRoom;
  groups: MapGroup[];
};

function roomOf(place: RoutePlace): MapRoom {
  return { id: textKey(place.name), name: place.name, ...(place.picture ? { picture: place.picture } : {}) };
}

export function crewMap(places: readonly RoutePlace[], current: RoutePlace, groups: readonly CrewGroup[] = []): CouchNavigation {
  const byKey = new Map(places.map((place) => [textKey(place.name), place]));
  const here = roomOf(byKey.get(textKey(current.name)) ?? current);
  return {
    here,
    groups: groups.map((group) => {
      const place = byKey.get(group.placeId);
      return {
        room: group.inScene ? here : place ? roomOf(place) : { id: group.placeId, name: group.placeName },
        crew: group.members.map((member) => ({ id: member.id, name: member.name, portraitUrl: member.portraitUrl })),
        inScene: group.inScene,
      };
    }),
  };
}

// Whether the crew stands in more than one place.
export function mapSplit(map: Pick<CouchNavigation, "groups"> | null): boolean {
  return (map?.groups?.length ?? 0) > 1;
}

// The group a player's character stands in.
export function myGroup(map: Pick<CouchNavigation, "groups"> | null, sheetIds: ReadonlySet<string>): MapGroup | null {
  return map?.groups?.find((group) => group.crew.some((member) => sheetIds.has(member.id))) ?? null;
}

// The GM's half: the site (SITE MAP) and who stands where arrive as
// `whereabouts`; this adds how the crew moves and what the arrival picture
// showed.
export function navigationPrompt(map: CouchNavigation | null, whereabouts = ""): string {
  if (!map) return whereabouts ? `${whereabouts}\nOpen the night by moving the crew to its start zone with move_party.` : "";
  const split = mapSplit(map);
  return [
    `Players choose where to go by saying it. When the ${split ? "group in the scene" : "crew"} goes together (they agree, or whoever spoke points one way and nobody objects), call move_party with that zone's name and no characterIds. If they disagree, let them argue it out in the fiction, or let them split.`,
    "Never narrate an arrival before move_party succeeds.",
    ...(whereabouts ? [whereabouts] : []),
    ...(map.here.picture?.seen
      ? [
          `WHAT THE CREW SAW of ${map.here.name} (the picture every screen showed when they arrived; keep to it): ${map.here.picture.seen}`,
          "If this place changes so much that picture is wrong (a fire, a flood, a breach, the lights die), call repaint_place with what changed.",
        ]
      : []),
  ].join("\n");
}
