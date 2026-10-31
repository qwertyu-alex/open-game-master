import { textKey } from "@/lib/language/text-logic";
import type { PlacePicture } from "./place-shots-logic";
import type { CrewGroup } from "./whereabouts-logic";
import type { DeckView } from "./deck-plan-logic";

// The crew's map (docs/couch-navigation.md): a deck plan of where the crew
// has been, for the TV's rail and each phone's Map sheet. The room is in
// one place, talking, so nobody votes: a player says where they go in the
// action box and the GM moves them, the whole crew or, once it splits up,
// whoever goes (src/lib/couch/whereabouts-logic.ts). Pure, for
// scripts/test-couch-navigation.mjs.

export type RoutePlace = {
  id: string;
  name: string;
  connections: readonly string[];
  visited: boolean;
  isCurrent: boolean;
  createdAt: string;
  // Its establishing shot, once painted (src/lib/couch/place-shots.ts).
  picture?: PlacePicture | null;
};
// A room the crew has seen carries its establishing shot once there is one.
export type MapRoom = { id: string; name: string; picture?: PlacePicture };
// A room the crew visited off the way here, drawn beside the room on the
// trail it opens from.
export type MapSide = MapRoom & { at: string };
export type MapExit = MapRoom & { visited: boolean };
// Who stands where (src/lib/couch/whereabouts-logic.ts): one group while the
// crew is together, up to three once it splits, the scene's first. Each
// group's room carries its own exits, so a group off scene still sees its
// way on.
export type MapCrew = { id: string; name: string; portraitUrl: string | null };
export type MapGroup = { room: MapRoom; crew: MapCrew[]; inScene: boolean; exits: MapExit[] };
export type CouchNavigation = {
  // Where the scene is: the room the story follows.
  here: MapRoom;
  // From the first room to here, here last.
  trail: MapRoom[];
  side: MapSide[];
  // Where here leads, the way back left out (it is the trail).
  exits: MapExit[];
  groups: MapGroup[];
  // The whole ship under the fog of war (src/lib/couch/deck-plan-logic.ts),
  // once the night has a plan or a room on record.
  deck?: DeckView;
};

const MAX_EXITS = 12;

// Only visited rooms, and the exits of the room the crew stands in: an
// unvisited room's own connections and description stay the GM's.
export function crewMap(places: readonly RoutePlace[], current: RoutePlace, groups: readonly CrewGroup[] = []): CouchNavigation {
  const visited = places
    .filter((place) => place.visited || place.id === current.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const rooms = new Map<string, MapRoom>();
  for (const place of visited) {
    const id = textKey(place.name);
    if (id && !rooms.has(id)) rooms.set(id, { id, name: place.name, ...(place.picture ? { picture: place.picture } : {}) });
  }
  const hereId = textKey(current.name);
  const links = new Map<string, Set<string>>([...rooms.keys()].map((id) => [id, new Set<string>()]));
  for (const place of visited) {
    const from = textKey(place.name);
    for (const name of place.connections) {
      const to = textKey(name);
      if (to !== from && links.has(from) && links.has(to)) {
        links.get(from)!.add(to);
        links.get(to)!.add(from);
      }
    }
  }
  const order = [...rooms.keys()];
  const trailIds = shortestPath(order[0] ?? hereId, hereId, links) ?? [...order.filter((id) => id !== hereId), hereId];
  const onTrail = new Set(trailIds);
  const side = order
    .filter((id) => !onTrail.has(id))
    .map((id) => ({ ...rooms.get(id)!, at: nearestOnTrail(id, onTrail, links) ?? trailBefore(id, order, onTrail) }));
  const back = trailIds.length > 1 ? trailIds[trailIds.length - 2] : "";
  const exits = exitsOf(current.connections, [hereId, back], rooms);
  const here = rooms.get(hereId) ?? { id: hereId, name: current.name };
  return {
    here,
    trail: trailIds.map((id) => rooms.get(id) ?? { id, name: current.name }),
    side,
    exits,
    groups: groups.map((group) => {
      const place = visited.find((entry) => textKey(entry.name) === group.placeId);
      return {
        room: group.inScene ? here : (rooms.get(group.placeId) ?? { id: group.placeId, name: group.placeName }),
        crew: group.members.map((member) => ({ id: member.id, name: member.name, portraitUrl: member.portraitUrl })),
        inScene: group.inScene,
        exits: group.inScene ? exits : exitsOf(place?.connections ?? [], [group.placeId], rooms),
      };
    }),
  };
}

function exitsOf(connections: readonly string[], skip: readonly string[], rooms: ReadonlyMap<string, MapRoom>): MapExit[] {
  const seen = new Set(skip);
  const exits: MapExit[] = [];
  for (const raw of connections) {
    const name = raw.trim().slice(0, 80);
    const id = textKey(name);
    if (!id || seen.has(id) || exits.length >= MAX_EXITS) continue;
    seen.add(id);
    const known = rooms.get(id);
    exits.push({ id, name, visited: Boolean(known), ...(known?.picture ? { picture: known.picture } : {}) });
  }
  return exits;
}

// Whether the crew stands in more than one place.
export function mapSplit(map: Pick<CouchNavigation, "groups"> | null): boolean {
  return (map?.groups?.length ?? 0) > 1;
}

// The group a player's character stands in.
export function myGroup(map: Pick<CouchNavigation, "groups"> | null, sheetIds: ReadonlySet<string>): MapGroup | null {
  return map?.groups?.find((group) => group.crew.some((member) => sheetIds.has(member.id))) ?? null;
}

function shortestPath(from: string, to: string, links: ReadonlyMap<string, ReadonlySet<string>>): string[] | null {
  if (from === to) return [to];
  const cameFrom = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    for (const next of links.get(at) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, at);
      if (next === to) {
        const path = [to];
        while (path[0] !== from) path.unshift(cameFrom.get(path[0])!);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function nearestOnTrail(id: string, onTrail: ReadonlySet<string>, links: ReadonlyMap<string, ReadonlySet<string>>): string | null {
  const seen = new Set([id]);
  let ring = [id];
  while (ring.length) {
    const next: string[] = [];
    for (const at of ring) {
      for (const linked of links.get(at) ?? []) {
        if (onTrail.has(linked)) return linked;
        if (!seen.has(linked)) {
          seen.add(linked);
          next.push(linked);
        }
      }
    }
    ring = next;
  }
  return null;
}

// A room with no recorded way to the trail sits beside the trail room the
// crew reached just before it.
function trailBefore(id: string, order: readonly string[], onTrail: ReadonlySet<string>): string {
  const before = order.slice(0, order.indexOf(id)).filter((entry) => onTrail.has(entry));
  return before[before.length - 1] ?? order.find((entry) => onTrail.has(entry)) ?? id;
}

// The newest stretch of the trail, for the TV's rail: the room count it
// folded away, then the rooms it keeps, here last.
export function railTrail(trail: readonly MapRoom[], keep: number): { earlier: number; rooms: MapRoom[] } {
  const rooms = trail.slice(-Math.max(1, keep));
  return { earlier: trail.length - rooms.length, rooms };
}

// The places with a picture, in the order the phone's viewer pages through
// them: down the trail, each trail room followed by the rooms off it.
export function picturedRooms(map: CouchNavigation): MapRoom[] {
  const rooms: MapRoom[] = [];
  for (const room of map.trail) {
    rooms.push(room, ...map.side.filter((side) => side.at === room.id));
  }
  const seen = new Set<string>();
  return rooms.filter((room) => room.picture && !seen.has(room.id) && seen.add(room.id));
}

export function navigationPrompt(map: CouchNavigation | null, whereabouts = ""): string {
  // A night played on a map has its site from the start (SITE MAP).
  if (!map && whereabouts) return `${whereabouts}\nOpen the night by moving the crew to its start zone with move_party.`;
  if (!map) return "CREW MAP: Record the opening room and its visible exits with move_party before the crew goes anywhere.";
  const exits = map.exits.map((exit) => exit.name).join(", ");
  const split = mapSplit(map);
  return [
    `CREW MAP (every phone and the TV show it): the ${split ? "scene" : "crew"} is in ${map.here.name}. Exits: ${exits || "none recorded yet"}.`,
    ...map.groups
      .filter((group) => !group.inScene)
      .map((group) => `Exits from ${group.room.name}: ${group.exits.map((exit) => exit.name).join(", ") || "none recorded yet"}.`),
    `Players choose where to go by saying it. When the ${split ? "group in the scene" : "crew"} goes together (they agree, or whoever spoke points one way and nobody objects), call move_party with that exact name and no characterIds. If they disagree, let them argue it out in the fiction, or let them split.`,
    "Never narrate an arrival before move_party succeeds.",
    ...(whereabouts ? [whereabouts] : []),
    "Record newly seen exits with update_location, using short destination names.",
    ...(map.here.picture?.seen
      ? [
          `WHAT THE CREW SAW of ${map.here.name} (the picture every screen showed when they arrived; keep to it): ${map.here.picture.seen}`,
          "If this place changes so much that picture is wrong (a fire, a flood, a breach, the lights die), call repaint_place with what changed.",
        ]
      : []),
  ].join("\n");
}
