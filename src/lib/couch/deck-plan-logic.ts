import { textKey } from "@/lib/language/text-logic";
import type { PlacePicture } from "./place-shots-logic";
import type { MapCrew } from "./navigation-logic";

// The night's deck plan (docs/couch-navigation.md "The deck plan"): every
// room of the ship on a small grid and the corridors between them, written
// once per night by a utility model from the scenario and the rooms already
// recorded, and kept to by the GM. The map shows all of it under a fog of
// war: a room's outline and its corridors from the start, its name once the
// crew has been next to it, its inside and picture once they have been in
// it. Pure, for scripts/test-couch-deck.mjs; the model call and the table
// are src/lib/couch/deck-plan.ts.

export const PLAN_COLS = 7;
export const PLAN_ROWS = 5;
const MIN_ROOMS = 6;
const MAX_ROOMS = 16;
const NAME_MAX = 40;

export type PlanRoom = { name: string; col: number; row: number };
export type DeckPlan = { rooms: PlanRoom[]; links: Array<[string, string]> };

// A place the GM has recorded (src/lib/db/locations.ts), as the plan reads it.
export type KnownPlace = { name: string; connections: readonly string[]; visited: boolean; createdAt: string };

const key = (name: string) => textKey(name);

export const DECK_PLAN_SYSTEM = [
  "You draw the deck plan of the ship, station or base a sci-fi horror one-shot is set in, for a map the players navigate under a fog of war.",
  `Answer with one JSON object and nothing else: {"rooms":[{"name":string,"col":number,"row":number}],"links":[[string,string]]}.`,
  `- rooms: ${MIN_ROOMS + 4} to ${MAX_ROOMS} rooms, short plain names (2 to 3 words, under ${NAME_MAX} characters, like "Cargo Hold", "Medical Bay"). Every place listed under RECORDED must appear with exactly that name.`,
  `- col and row: the room's cell on a ${PLAN_COLS} by ${PLAN_ROWS} grid (col 0 to ${PLAN_COLS - 1}, row 0 to ${PLAN_ROWS - 1}), one room per cell, laid out like a real deck plan: the bridge or cockpit at one end, engines at the other, rooms that connect sitting next to each other.`,
  "- links: the corridors, ladders and hatches between rooms, each a pair of room names. Every recorded connection between two recorded places is a link. Every room is reachable; give the ship a few loops and dead ends, not one straight line.",
  "- Mix in rooms the crew has not found yet (stores, crawlspaces, labs, quarters) where the story could go. No people, no secrets, no descriptions.",
].join("\n");

export function deckPlanInput(input: { setting: string; locations: ReadonlyArray<{ name: string; look: string }>; known: readonly KnownPlace[] }): string {
  const recorded = input.known.map((place) => `- ${place.name}${place.connections.length ? ` (connects to: ${place.connections.join(", ")})` : ""}`);
  return [
    `SETTING: ${input.setting || "a working spaceship far from help"}`,
    input.locations.length ? `THE STORY'S PLACES: ${input.locations.map((place) => place.name).join(", ")}` : "",
    recorded.length ? `RECORDED (already on the map; keep these names and connections):\n${recorded.join("\n")}` : "RECORDED: none yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

// The planner's reply, checked: known names, one room per cell (a clash or
// a cell off the grid moves to the nearest free one), links only between
// rooms of the plan, and every room reachable.
export function readDeckPlan(raw: unknown): DeckPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { rooms?: unknown; links?: unknown };
  if (!Array.isArray(value.rooms)) return null;
  const plan: DeckPlan = { rooms: [], links: [] };
  for (const entry of value.rooms) {
    if (!entry || typeof entry !== "object") continue;
    const room = entry as { name?: unknown; col?: unknown; row?: unknown };
    const name = typeof room.name === "string" ? room.name.trim().replace(/\s+/g, " ").slice(0, NAME_MAX) : "";
    if (!key(name) || plan.rooms.some((other) => key(other.name) === key(name)) || plan.rooms.length >= MAX_ROOMS) continue;
    const cell = freeCell(plan, { col: Number(room.col), row: Number(room.row) });
    if (!cell) break;
    plan.rooms.push({ name, ...cell });
  }
  if (plan.rooms.length < MIN_ROOMS) return null;
  for (const entry of Array.isArray(value.links) ? value.links : []) {
    if (Array.isArray(entry) && entry.length === 2) addLink(plan, String(entry[0]), String(entry[1]));
  }
  connectAll(plan);
  return plan;
}

function roomOf(plan: DeckPlan, name: string): PlanRoom | undefined {
  const wanted = key(name);
  return plan.rooms.find((room) => key(room.name) === wanted);
}

function addLink(plan: DeckPlan, a: string, b: string): void {
  const from = roomOf(plan, a);
  const to = roomOf(plan, b);
  if (!from || !to || from === to) return;
  if (plan.links.some(([x, y]) => (key(x) === key(from.name) && key(y) === key(to.name)) || (key(x) === key(to.name) && key(y) === key(from.name)))) return;
  plan.links.push([from.name, to.name]);
}

const taken = (plan: DeckPlan, col: number, row: number) => plan.rooms.some((room) => room.col === col && room.row === row);

// The free cell nearest the one asked for (on the grid, or just past its
// edge once it is full: a plan that grows keeps every room it has).
function freeCell(plan: DeckPlan, near: { col: number; row: number }): { col: number; row: number } | null {
  const col0 = Number.isFinite(near.col) ? Math.round(near.col) : 0;
  const row0 = Number.isFinite(near.row) ? Math.round(near.row) : 0;
  const start = { col: Math.min(PLAN_COLS - 1, Math.max(0, col0)), row: Math.min(PLAN_ROWS - 1, Math.max(0, row0)) };
  for (let ring = 0; ring <= PLAN_COLS + PLAN_ROWS + MAX_ROOMS; ring += 1) {
    const cells: Array<{ col: number; row: number }> = [];
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        cells.push({ col: start.col + dc, row: start.row + dr });
      }
    }
    // Inside the grid first, nearest by straight distance.
    cells.sort((a, b) => outside(a) - outside(b) || Math.hypot(a.col - start.col, a.row - start.row) - Math.hypot(b.col - start.col, b.row - start.row));
    const free = cells.find((cell) => cell.col >= 0 && cell.row >= 0 && !taken(plan, cell.col, cell.row));
    if (free) return free;
  }
  return null;
}

const outside = (cell: { col: number; row: number }) => Number(cell.col >= PLAN_COLS || cell.row >= PLAN_ROWS);

// A room the planner left unreachable is joined to the nearest room on the
// grid that is.
function connectAll(plan: DeckPlan): void {
  if (!plan.rooms.length) return;
  for (;;) {
    const reached = reachable(plan, plan.rooms[0].name);
    const stray = plan.rooms.find((room) => !reached.has(key(room.name)));
    if (!stray) return;
    const anchor = plan.rooms
      .filter((room) => reached.has(key(room.name)))
      .sort((a, b) => Math.hypot(a.col - stray.col, a.row - stray.row) - Math.hypot(b.col - stray.col, b.row - stray.row))[0];
    plan.links.push([anchor.name, stray.name]);
  }
}

function neighbours(plan: DeckPlan, name: string): string[] {
  const k = key(name);
  return plan.links.flatMap(([a, b]) => (key(a) === k ? [b] : key(b) === k ? [a] : []));
}

function reachable(plan: DeckPlan, from: string): Set<string> {
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    for (const next of neighbours(plan, queue.shift()!)) {
      if (!seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen;
}

// The plan with what the GM has recorded since it was drawn: a place it
// lacks is added beside the place it connects to (or the last one reached),
// a recorded exit to somewhere new becomes a room beside it, and every
// recorded connection is a corridor. Never removes anything.
export function mergeKnown(plan: DeckPlan, known: readonly KnownPlace[]): DeckPlan {
  const merged: DeckPlan = { rooms: plan.rooms.map((room) => ({ ...room })), links: plan.links.map(([a, b]) => [a, b] as [string, string]) };
  const ordered = [...known].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let last: PlanRoom | undefined;
  // Every name some recorded place leads to: an unvisited place nothing
  // leads to and that leads nowhere on the plan (a room the GM wrote down
  // ahead of time) stays off the map until something does, so it is never
  // set beside the crew with its name showing.
  const reachedNames = new Set(ordered.flatMap((place) => place.connections.map(key)));
  for (const place of ordered) {
    let room = roomOf(merged, place.name);
    if (!room && !place.visited && !reachedNames.has(key(place.name)) && !place.connections.some((name) => roomOf(merged, name))) continue;
    if (!room) {
      const anchor = place.connections.map((name) => roomOf(merged, name)).find(Boolean) ?? last ?? merged.rooms[0];
      const cell = freeCell(merged, anchor ? { col: anchor.col + 1, row: anchor.row } : { col: 0, row: 0 });
      if (!cell) continue;
      room = { name: place.name.trim().slice(0, NAME_MAX), ...cell };
      merged.rooms.push(room);
      if (anchor) addLink(merged, anchor.name, room.name);
    }
    for (const exit of place.connections) {
      if (!key(exit)) continue;
      if (!roomOf(merged, exit)) {
        const cell = freeCell(merged, { col: room.col + 1, row: room.row });
        if (!cell) continue;
        merged.rooms.push({ name: exit.trim().slice(0, NAME_MAX), ...cell });
      }
      addLink(merged, room.name, exit);
    }
    if (place.visited) last = room;
  }
  connectAll(merged);
  return merged;
}

// Built from what is recorded alone, while no plan has been drawn (or the
// planner failed): the rooms the GM named, laid out in the order reached.
export function knownOnlyPlan(known: readonly KnownPlace[]): DeckPlan {
  return mergeKnown({ rooms: [], links: [] }, known);
}

// The GM's half: every room and corridor, to keep the story on the plan.
export function deckPlanPrompt(plan: DeckPlan, here: string): string {
  const ways = neighbours(plan, here);
  return [
    `DECK PLAN (the whole ship, secret beyond what the crew has seen; keep to it): rooms ${plan.rooms.map((room) => room.name).join(", ")}.`,
    `Corridors: ${plan.links.map(([a, b]) => `${a}–${b}`).join("; ")}.`,
    ways.length ? `From ${here} the crew can go to: ${ways.join(", ")}.` : "",
    "The crew moves only along corridors, one room at a time: use these exact names in move_party and connections. A new room the story needs goes in move_party as usual and joins the plan beside where they are.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- what every screen is sent: the plan under the fog ----

export type DeckRoomState = "visited" | "seen" | "unknown";
export type DeckRoom = {
  // The room's name key once its name is shown; an opaque one while it is
  // fog, so nothing of its name reaches a phone.
  id: string;
  name: string | null;
  col: number;
  row: number;
  state: DeckRoomState;
  picture?: PlacePicture;
  crew?: MapCrew[];
};
export type DeckLink = { a: string; b: string; walked: boolean; known: boolean };
export type DeckView = { cols: number; rows: number; rooms: DeckRoom[]; links: DeckLink[]; here: string };

export function deckView(input: {
  plan: DeckPlan;
  visited: ReadonlySet<string>;
  here: string;
  // The crew's trail, first room to here, by name key.
  trail: readonly string[];
  pictures: ReadonlyMap<string, PlacePicture>;
  crewAt: ReadonlyMap<string, MapCrew[]>;
}): DeckView {
  const { plan } = input;
  const seen = new Set<string>(input.visited);
  for (const name of input.visited) for (const next of neighbours(plan, name)) seen.add(key(next));
  const hereKey = key(input.here);
  seen.add(hereKey);
  const ids = new Map<string, string>();
  plan.rooms.forEach((room, index) => ids.set(key(room.name), seen.has(key(room.name)) ? key(room.name) : `fog-${index}`));
  const rooms: DeckRoom[] = plan.rooms.map((room) => {
    const k = key(room.name);
    const state: DeckRoomState = input.visited.has(k) || k === hereKey ? "visited" : seen.has(k) ? "seen" : "unknown";
    const picture = state === "visited" ? input.pictures.get(k) : undefined;
    const crew = input.crewAt.get(k);
    return {
      id: ids.get(k)!,
      name: state === "unknown" ? null : room.name,
      col: room.col,
      row: room.row,
      state,
      ...(picture ? { picture } : {}),
      ...(crew?.length ? { crew } : {}),
    };
  });
  const steps = new Set(input.trail.slice(1).map((k, index) => [input.trail[index], k].sort().join("|")));
  const links: DeckLink[] = plan.links.map(([a, b]) => ({
    a: ids.get(key(a))!,
    b: ids.get(key(b))!,
    walked: steps.has([key(a), key(b)].sort().join("|")),
    known: input.visited.has(key(a)) || input.visited.has(key(b)) || key(a) === hereKey || key(b) === hereKey,
  }));
  const cols = Math.max(PLAN_COLS, ...plan.rooms.map((room) => room.col + 1));
  const rows = Math.max(PLAN_ROWS, ...plan.rooms.map((room) => room.row + 1));
  // Rows and columns nobody stands in are trimmed, so the map fills its frame.
  const usedCols = [...new Set(plan.rooms.map((room) => room.col))].sort((a, b) => a - b);
  const usedRows = [...new Set(plan.rooms.map((room) => room.row))].sort((a, b) => a - b);
  const colAt = new Map(usedCols.map((col, index) => [col, index]));
  const rowAt = new Map(usedRows.map((row, index) => [row, index]));
  return {
    cols: usedCols.length || cols,
    rows: usedRows.length || rows,
    rooms: rooms.map((room) => ({ ...room, col: colAt.get(room.col) ?? room.col, row: rowAt.get(room.row) ?? room.row })),
    links,
    here: hereKey,
  };
}

// Where a room can be reached from, for the phone's "from here" list.
export function deckExits(view: DeckView, roomId: string): DeckRoom[] {
  const ids = view.links.flatMap((link) => (link.a === roomId ? [link.b] : link.b === roomId ? [link.a] : []));
  return view.rooms.filter((room) => ids.includes(room.id));
}
