import { textKey } from "@/lib/language/text-logic";

// The crew's map (docs/couch-navigation.md): a deck plan of where the crew
// has been, for the TV's rail and each phone's Map sheet. The room is in
// one place, talking, so nobody votes: a player says where they go in the
// action box and the GM moves the whole crew. Pure, for
// scripts/test-couch-navigation.mjs.

export type RoutePlace = {
  id: string;
  name: string;
  connections: readonly string[];
  visited: boolean;
  isCurrent: boolean;
  createdAt: string;
};
export type MapRoom = { id: string; name: string };
// A room the crew visited off the way here, drawn beside the room on the
// trail it opens from.
export type MapSide = MapRoom & { at: string };
export type MapExit = MapRoom & { visited: boolean };
export type CouchNavigation = {
  here: MapRoom;
  // From the first room to here, here last.
  trail: MapRoom[];
  side: MapSide[];
  // Where here leads, the way back left out (it is the trail).
  exits: MapExit[];
};

const MAX_EXITS = 12;

// Only visited rooms, and the exits of the room the crew stands in: an
// unvisited room's own connections and description stay the GM's.
export function crewMap(places: readonly RoutePlace[], current: RoutePlace): CouchNavigation {
  const visited = places
    .filter((place) => place.visited || place.id === current.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const rooms = new Map<string, MapRoom>();
  for (const place of visited) {
    const id = textKey(place.name);
    if (id && !rooms.has(id)) rooms.set(id, { id, name: place.name });
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
  const seen = new Set([hereId, back]);
  const exits: MapExit[] = [];
  for (const raw of current.connections) {
    const name = raw.trim().slice(0, 80);
    const id = textKey(name);
    if (!id || seen.has(id) || exits.length >= MAX_EXITS) continue;
    seen.add(id);
    exits.push({ id, name, visited: rooms.has(id) });
  }
  return {
    here: rooms.get(hereId) ?? { id: hereId, name: current.name },
    trail: trailIds.map((id) => rooms.get(id) ?? { id, name: current.name }),
    side,
    exits,
  };
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

export function navigationPrompt(map: CouchNavigation | null): string {
  if (!map) return "CREW MAP: Record the opening room and its visible exits with move_party before the crew goes anywhere.";
  const exits = map.exits.map((exit) => exit.name).join(", ");
  return [
    `CREW MAP (every phone and the TV show it): the crew is in ${map.here.name}. Exits: ${exits || "none recorded yet"}.`,
    "Players choose where to go by saying it. When the crew goes together (they agree, or whoever spoke points one way and nobody objects), call move_party with that exact name and no characterIds. If they disagree, let them argue it out in the fiction before anyone moves.",
    "Never split the crew. If one player heads elsewhere, resolve a quick action before everyone leaves when it is plausible, otherwise say why it cannot happen. No separate journey or scene, and never narrate an arrival before move_party succeeds.",
    "Record newly seen exits with update_location, using short destination names.",
  ].join("\n");
}
