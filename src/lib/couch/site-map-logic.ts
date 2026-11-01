// The overhead night's map (docs/couch-overhead-spec.md): a written
// scenario's whole site as data, not a picture. Zones are the Year Zero
// zones of the rulebook (a room, a stretch of corridor, a crawlway), drawn
// as one or more rectangles on a tile grid; borders between zones are open,
// a door, a hatch, a vent or an airlock; props are the furniture; entities
// are the people, foes, items and clues the scenario places. Everything a
// screen draws (walls, door bars, where a token stands) is worked out here
// from that data, so a map is checked once and drawn the same on the TV and
// the phone. Pure, for scripts/test-couch-site.mjs; the drawing is
// src/components/couch/CouchSiteMap.tsx.

export type Rect = { x: number; y: number; w: number; h: number };

export type ZoneKind = "room" | "corridor" | "crawlway" | "airlock" | "exterior";
// The rulebook's zone features (rulebook p. 49).
export type ZoneFeature = "dark" | "cluttered" | "cramped";

export type Zone = {
  id: string;
  name: string;
  kind: ZoneKind;
  rects: Rect[];
  features?: ZoneFeature[];
  // What the GM reads when the crew walks in; never shown on a screen.
  look: string;
  // A way off this map (stairs down, the landing pad), for the GM.
  exit?: string;
};

// A breach is a hole the night blew in a wall (set_border "broken" between
// two zones that share a wall but no way through); no site writes one.
export type BorderKind = "open" | "door" | "hatch" | "vent" | "airlock" | "breach";
// Severed: the border joins a section that is adrift or gone (a cut
// umbilical, a ship that undocked). Only a section's state makes it.
export type BorderState = "open" | "closed" | "locked" | "sealed" | "broken" | "severed";

export type Border = {
  a: string;
  b: string;
  kind: BorderKind;
  // Where it sits on the shared edge, in tiles, and how wide. An open
  // border needs neither: the whole shared edge is open.
  at?: { x: number; y: number };
  span?: number;
  state?: BorderState;
  // What opens a locked one ("the lift keycard"), for the GM.
  key?: string;
};

export type PropKind = "table" | "round-table" | "bed" | "pod" | "console" | "bench" | "crate" | "locker" | "stairs" | "lift" | "toilet" | "tank" | "vehicle";
export type Prop = { kind: PropKind; x: number; y: number; w: number; h: number; label?: string };

export type EntityKind = "crew-start" | "item" | "npc" | "foe" | "threat" | "clue" | "body";
export type Entity = {
  id: string;
  kind: EntityKind;
  name: string;
  zone: string;
  // A foe that knows the crew is here stalks them; a passive one can be
  // sneaked past or ambushed (rulebook p. 51).
  stance?: "active" | "passive";
  // A COUCH_FOES slug (src/lib/couch/foes-logic.ts), so a fight fields it.
  foe?: string;
  // Not on any screen until the crew finds it, even in a zone they can see.
  hidden?: boolean;
  // The act it enters the story in; before that it is not on the map.
  act?: 1 | 2 | 3;
  // For the GM: what it is, what it does, what it wants.
  note: string;
};

// What happens to a zone during the night (set_zone), on top of what the
// site wrote: fire and smoke spread each stealth turn, vacuum floods every
// zone open to it at once, wrecked stops everyone, dark and lit change the
// rulebook's dark feature (the power fails; a flare lights a room).
export type ZoneCondition = "fire" | "smoke" | "vacuum" | "wrecked" | "dark" | "lit";
export const ZONE_CONDITIONS: readonly ZoneCondition[] = ["fire", "smoke", "vacuum", "wrecked", "dark", "lit"];
const HAZARDS: ReadonlySet<ZoneCondition> = new Set(["fire", "smoke", "vacuum", "wrecked"]);

// A part of the site that can come and go whole: a ship docked to the
// station, a dropship on the pad. Adrift, its zones drift away on every
// screen (by drift, in tiles) and nothing crosses to it; absent, it is not
// on the map at all, until it docks.
export type SectionState = "docked" | "adrift" | "absent";
export type Section = {
  id: string;
  name: string;
  zones: string[];
  state?: SectionState;
  drift: { x: number; y: number; turn?: number };
  // For the GM: what it is, and what docking or undocking it means.
  note: string;
};

export type SiteMap = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  // The outside walls of the buildings: inside the hull and in no zone is
  // solid wall, outside is the ground.
  hull: Rect[];
  zones: Zone[];
  borders: Border[];
  props: Prop[];
  entities: Entity[];
  sections?: Section[];
};

const PASSABLE: ReadonlySet<BorderState> = new Set(["open", "closed", "broken"]);
// Across which air, fire and sight pass.
const isOpen = (border: Border, state: BorderState) => state !== "severed" && (border.kind === "open" || state === "open" || state === "broken");

// Each tile's zone id, or "" for wall or ground.
export function zoneGrid(map: SiteMap): string[][] {
  const grid = Array.from({ length: map.rows }, () => Array<string>(map.cols).fill(""));
  for (const zone of map.zones) {
    for (const rect of zone.rects) {
      for (let y = rect.y; y < rect.y + rect.h; y += 1) {
        for (let x = rect.x; x < rect.x + rect.w; x += 1) {
          if (grid[y]?.[x] !== undefined) grid[y][x] = zone.id;
        }
      }
    }
  }
  return grid;
}

export function inHull(map: SiteMap, x: number, y: number): boolean {
  return map.hull.some((rect) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h);
}

// What is wrong with a map, one line each; none means it can be played. A
// map is written once by hand (or by a model), so every mistake is named
// rather than mended.
export function checkSiteMap(map: SiteMap): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const owner = new Map<string, string>();
  for (const zone of map.zones) {
    if (ids.has(zone.id)) problems.push(`zone ${zone.id} is listed twice`);
    ids.add(zone.id);
    for (const rect of zone.rects) {
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > map.cols || rect.y + rect.h > map.rows) problems.push(`zone ${zone.id} runs off the map`);
      for (let y = rect.y; y < rect.y + rect.h; y += 1) {
        for (let x = rect.x; x < rect.x + rect.w; x += 1) {
          const other = owner.get(`${x},${y}`);
          if (other && other !== zone.id) problems.push(`zones ${other} and ${zone.id} overlap at ${x},${y}`);
          owner.set(`${x},${y}`, zone.id);
        }
      }
    }
  }
  const grid = zoneGrid(map);
  for (const border of map.borders) {
    const label = `${border.kind} ${border.a}–${border.b}`;
    if (!ids.has(border.a) || !ids.has(border.b)) {
      problems.push(`${label} names a zone that is not on the map`);
      continue;
    }
    const shared = sharedEdges(grid, border.a, border.b);
    if (!shared.length) problems.push(`${label}: the zones do not touch`);
    else if (border.kind !== "open" && (!border.at || !onSharedEdge(shared, border.at))) problems.push(`${label} is not on their shared wall`);
  }
  for (const entity of map.entities) {
    if (!ids.has(entity.zone)) problems.push(`${entity.name} stands in ${entity.zone}, which is not on the map`);
  }
  const inSection = new Map<string, string>();
  for (const section of map.sections ?? []) {
    for (const zone of section.zones) {
      if (!ids.has(zone)) problems.push(`section ${section.id} holds ${zone}, which is not on the map`);
      const other = inSection.get(zone);
      if (other) problems.push(`${zone} is in sections ${other} and ${section.id}`);
      inSection.set(zone, section.id);
    }
  }
  const start = map.entities.find((entity) => entity.kind === "crew-start");
  if (!start) problems.push("no crew-start: the crew has nowhere to begin");
  else if (inSection.has(start.zone) && map.sections?.find((section) => section.id === inSection.get(start.zone))?.state === "absent") problems.push("the crew starts in a section that is not there");
  else {
    const reached = reachable(map, start.zone, { vents: true, locked: true });
    for (const zone of map.zones) if (!reached.has(zone.id)) problems.push(`${zone.name} cannot be reached from the start`);
  }
  return problems;
}

type Edge = { x: number; y: number; axis: "h" | "v" };

// The unit tile edges two zones share: "h" edges run along a row boundary
// (y is the boundary), "v" along a column boundary.
function sharedEdges(grid: string[][], a: string, b: string): Edge[] {
  const edges: Edge[] = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      const here = grid[y][x];
      const right = grid[y][x + 1];
      const below = grid[y + 1]?.[x];
      if ((here === a && right === b) || (here === b && right === a)) edges.push({ x: x + 1, y, axis: "v" });
      if ((here === a && below === b) || (here === b && below === a)) edges.push({ x, y: y + 1, axis: "h" });
    }
  }
  return edges;
}

function onSharedEdge(edges: Edge[], at: { x: number; y: number }): boolean {
  return edges.some((edge) => (edge.axis === "v" ? edge.x === at.x && at.y >= edge.y && at.y <= edge.y + 1 : edge.y === at.y && at.x >= edge.x && at.x <= edge.x + 1));
}

function axisOf(grid: string[][], border: Border): "h" | "v" {
  return sharedEdges(grid, border.a, border.b)[0]?.axis ?? "h";
}

// Where a zone can be left to, and how. Vents only crawl, so the crew uses
// them only on purpose; a locked or sealed border stops everyone until it
// is opened (or, with locked: true, counts as a way for checking a map).
export function neighbours(map: SiteMap, zoneId: string, opts: { vents?: boolean; locked?: boolean } = {}): Array<{ zone: string; border: Border }> {
  const out: Array<{ zone: string; border: Border }> = [];
  for (const border of map.borders) {
    if (border.a !== zoneId && border.b !== zoneId) continue;
    if (border.kind === "vent" && !opts.vents) continue;
    if (!opts.locked && !PASSABLE.has(border.state ?? defaultState(border))) continue;
    out.push({ zone: border.a === zoneId ? border.b : border.a, border });
  }
  return out;
}

function defaultState(border: Border): BorderState {
  return border.kind === "open" ? "open" : "closed";
}

export function reachable(map: SiteMap, from: string, opts: { vents?: boolean; locked?: boolean } = {}): Set<string> {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const next = queue.shift() as string;
    for (const { zone } of neighbours(map, next, opts)) {
      if (!seen.has(zone)) {
        seen.add(zone);
        queue.push(zone);
      }
    }
  }
  return seen;
}

// Zones apart, through doors and corridors (not vents): the rulebook's
// ranges (same zone short, next zone medium, up to four long) and the
// motion tracker's reach.
export function zoneDistance(map: SiteMap, from: string, to: string, opts: { vents?: boolean } = {}): number {
  if (from === to) return 0;
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const next = queue.shift() as string;
    for (const { zone } of neighbours(map, next, { ...opts, locked: true })) {
      if (dist.has(zone)) continue;
      dist.set(zone, (dist.get(next) as number) + 1);
      if (zone === to) return dist.get(zone) as number;
      queue.push(zone);
    }
  }
  return Infinity;
}

// What can be seen from a zone: itself, and every zone across an open
// border or an open door (rulebook p. 49: a closed door blocks the view).
// Smoke (veiled) hides a zone from its neighbours, and a zone from inside
// it.
export function lineOfSight(map: SiteMap, zoneId: string, states: ReadonlyMap<Border, BorderState> = new Map(), veiled: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set([zoneId]);
  if (veiled.has(zoneId)) return seen;
  for (const border of map.borders) {
    if (border.a !== zoneId && border.b !== zoneId) continue;
    const other = border.a === zoneId ? border.b : border.a;
    if (!veiled.has(other) && isOpen(border, states.get(border) ?? border.state ?? defaultState(border))) seen.add(other);
  }
  return seen;
}

// ----- Drawing --------------------------------------------------------

export type WallRun = { x: number; y: number; axis: "h" | "v"; length: number; section?: string };
export type DoorMark = { x: number; y: number; axis: "h" | "v"; span: number; kind: BorderKind; state: BorderState; a: string; b: string };

// The walls: every tile edge between two different zones, or a zone and
// solid wall, unless the border there is open; merged into runs so a
// screen draws a few dozen bars, not hundreds. Given the zones the crew
// has seen, only their walls: the rest of the site is still black.
// Given only, the walls of those zones alone, as if nothing else stood
// there: a section drifting away is drawn whole, its own walls with it.
export function wallRuns(map: SiteMap, shown?: ReadonlySet<string>, only?: (zoneId: string) => boolean): WallRun[] {
  const grid = only ? zoneGrid(map).map((row) => row.map((id) => (id && only(id) ? id : ""))) : zoneGrid(map);
  const open = new Set(map.borders.filter((border) => border.kind === "open").map((border) => pairKey(border.a, border.b)));
  const isWall = (p: string, q: string) => p !== q && (p !== "" || q !== "") && !open.has(pairKey(p, q)) && (!shown || shown.has(p) || shown.has(q));
  const runs: WallRun[] = [];
  for (let y = 0; y <= map.rows; y += 1) {
    let start = -1;
    for (let x = 0; x <= map.cols; x += 1) {
      const wall = x < map.cols && isWall(grid[y - 1]?.[x] ?? "", grid[y]?.[x] ?? "");
      if (wall && start < 0) start = x;
      if (!wall && start >= 0) {
        runs.push({ x: start, y, axis: "h", length: x - start });
        start = -1;
      }
    }
  }
  for (let x = 0; x <= map.cols; x += 1) {
    let start = -1;
    for (let y = 0; y <= map.rows; y += 1) {
      const wall = y < map.rows && isWall(grid[y]?.[x - 1] ?? "", grid[y]?.[x] ?? "");
      if (wall && start < 0) start = y;
      if (!wall && start >= 0) {
        runs.push({ x, y: start, axis: "v", length: y - start });
        start = -1;
      }
    }
  }
  return runs;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export function doorMarks(map: SiteMap, states: ReadonlyMap<Border, BorderState> = new Map()): DoorMark[] {
  const grid = zoneGrid(map);
  return map.borders
    .filter((border) => border.kind !== "open" && border.at)
    .map((border) => {
      const at = border.at as { x: number; y: number };
      return { x: at.x, y: at.y, axis: axisOf(grid, border), span: border.span ?? 1, kind: border.kind, state: states.get(border) ?? border.state ?? defaultState(border), a: border.a, b: border.b };
    });
}

// Where tokens stand in a zone: spread over its largest rectangle, row by
// row, a tile apart, so five crew and two foes in one room never cover
// each other or the door.
export function tokenSpots(zone: Zone, count: number): Array<{ x: number; y: number }> {
  const rect = [...zone.rects].sort((p, q) => q.w * q.h - p.w * p.h)[0];
  if (!rect || count <= 0) return [];
  const perRow = Math.max(1, Math.min(count, Math.floor(rect.w) - 1 || 1));
  const rowsNeeded = Math.ceil(count / perRow);
  // The zone's name sits along its top (CouchSiteMap), so tokens stand in
  // the rest of it.
  const band = rect.h >= 3 ? Math.min(1.6, rect.h * 0.3) : 0;
  const top = rect.y + band;
  const height = rect.h - band;
  const spots: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i % perRow;
    spots.push({
      x: rect.x + (rect.w * (col + 1)) / (inRow + 1),
      y: top + (height * (row + 1)) / (rowsNeeded + 1),
    });
  }
  return spots;
}

// ----- Where each token's name sits -------------------------------------

// A name tag's box, in tiles, its text broken into the lines it was
// measured with, and the line back to its token when the name had to stand
// off from it.
export type TagPlace = { id: string; text: string; x: number; y: number; w: number; h: number; leader?: { x1: number; y1: number; x2: number; y2: number } };

// Sizes in tiles, kept in step with src/app/styles/couch-site.css: Geist
// Mono advances 0.6em, a tag is 0.4 tile type, a zone title 0.58 with
// 0.06em spacing, its features 0.34 with 0.08em.
const TAG = { char: 0.24, padX: 0.16, padY: 0.06, line: 0.46, maxW: 6 };
const TITLE = { char: 0.383, line: 0.64, top: 0.3, featChar: 0.231, featLine: 0.47 };
// How far from its centre each kind of token reaches (a turned square's
// corner for a foe or a landmark).
const TOKEN_REACH: Record<ViewToken["kind"], number> = { crew: 0.65, npc: 0.6, foe: 0.78, threat: 0.65, item: 0.5, clue: 0.5, body: 0.53, landmark: 0.6, "crew-start": 0.6 };
const reach = (token: ViewToken) => (token.portraitUrl && token.kind !== "crew" ? 0.7 : TOKEN_REACH[token.kind]);
// Who gets the best spot first: what can hurt you, then who you can talk to.
const TAG_ORDER: Partial<Record<ViewToken["kind"], number>> = { foe: 0, threat: 0, npc: 1, body: 2, item: 3, clue: 3, landmark: 4 };

// Words greedily into lines of at most `max` characters (a longer word
// stands alone on its line).
function wrapWords(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : [""];
}

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const reachBox = (token: ViewToken): Rect => {
  const r = reach(token);
  return { x: token.x - r, y: token.y - r, w: 2 * r, h: 2 * r };
};
const largestRect = (rects: readonly Rect[]) => [...rects].sort((p, q) => q.w * q.h - p.w * p.h)[0];

// Each zone's title box, where CouchSiteMap draws it: centred along the top
// of its largest rectangle, wrapped to the rectangle's width.
export function titleBoxes(zones: readonly ViewZone[]): Rect[] {
  const boxes: Rect[] = [];
  for (const zone of zones) {
    const rect = largestRect(zone.rects);
    if (!rect || zone.kind === "crawlway") continue;
    const lines = wrapWords(zone.name, Math.max(1, Math.floor((rect.w - 0.25) / TITLE.char)));
    const feat = [...zone.features, ...(zone.hazards ?? [])].join(" · ");
    const w = Math.min(rect.w, Math.max(...lines.map((line) => line.length * TITLE.char), feat.length * TITLE.featChar));
    const h = lines.length * TITLE.line + (feat ? TITLE.featLine : 0);
    boxes.push({ x: rect.x + rect.w / 2 - w / 2, y: rect.y + TITLE.top, w, h });
  }
  return boxes;
}

// The eight spots around a token, nearest first: below, above, right,
// left, then the corners. Ring 0 touches the token; each ring stands a
// little further off.
const SPOTS: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const RINGS = 5;

// Where every named token's name sits, so no name covers another, a token
// or a zone's title: each name tries the spots around its token, ring by
// ring, and takes the one that covers least; a name that had to stand off
// gets a line back to its token. Foes are placed first, so the names the
// room most needs sit closest. A spot is scored by what it covers: any
// touch at all costs more than a step further out, and a name would rather
// stay in its token's zone, then lie in the dark between zones, than cross
// into another zone or straddle a wall, and never leave the drawn map.
// Pure and deterministic, so the TV and every phone agree.
export function tagPlaces(view: Pick<SiteView, "cols" | "rows" | "zones" | "tokens">, named: (token: ViewToken) => boolean = (token) => token.kind !== "crew"): TagPlace[] {
  const titles = titleBoxes(view.zones);
  const zoneRects = new Map(view.zones.map((zone) => [zone.id, zone.rects]));
  const allRects = view.zones.flatMap((zone) => zone.rects.map((rect) => ({ zone: zone.id, rect })));
  // Names stay within a tile of what is drawn: the phone crops the plane
  // to the found zones, and the TV's camera frames them.
  const bounds = boundsOf(allRects.map(({ rect }) => rect), 1) ?? { x: 0, y: 0, w: view.cols, h: view.rows };
  const placed: Rect[] = [];
  const out: TagPlace[] = [];
  const order = view.tokens.filter(named).sort((a, b) => (TAG_ORDER[a.kind] ?? 5) - (TAG_ORDER[b.kind] ?? 5) || a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
  for (const token of order) {
    const text = token.last ? `${token.name}?` : token.name;
    const lines = wrapWords(text, Math.floor((TAG.maxW - 2 * TAG.padX) / TAG.char));
    const w = Math.max(...lines.map((line) => line.length)) * TAG.char + 2 * TAG.padX;
    const h = lines.length * TAG.line + 2 * TAG.padY;
    const home = zoneRects.get(token.zone) ?? [];
    const score = (box: Rect) => {
      const air = { x: box.x - 0.1, y: box.y - 0.1, w: box.w + 0.2, h: box.h + 0.2 };
      const area = air.w * air.h;
      const touch = (a: number) => (a > 0 ? 4 + a : 0);
      let cost = 0;
      for (const other of placed) cost += 12 * touch(overlap(air, other));
      for (const other of view.tokens) cost += (other === token ? 1 : 10) * touch(overlap(air, reachBox(other)));
      for (const title of titles) cost += 8 * touch(overlap(air, title));
      cost += 20 * (area - overlap(air, bounds));
      cost += 0.6 * (area - home.reduce((sum, rect) => sum + overlap(air, rect), 0));
      for (const { zone, rect } of allRects) {
        const covered = overlap(air, rect);
        if (zone !== token.zone) cost += 1.2 * covered;
        if (covered > 0 && covered < area - 0.001) cost += 0.6;
      }
      return cost;
    };
    let best: { box: Rect; cost: number; ring: number } | null = null;
    for (let ring = 0; ring < RINGS; ring += 1) {
      for (const [i, [dx, dy]] of SPOTS.entries()) {
        const d = (reach(token) + 0.1 + ring * 0.8) * (dx && dy ? 0.72 : 1);
        const ax = token.x + dx * d;
        const ay = token.y + dy * d;
        const box = { x: dx > 0 ? ax : dx < 0 ? ax - w : ax - w / 2, y: dy > 0 ? ay : dy < 0 ? ay - h : ay - h / 2, w, h };
        const cost = score(box) + ring * 0.34 + i * 0.012;
        if (!best || cost < best.cost) best = { box, cost, ring };
      }
    }
    if (!best) continue;
    const { box, ring } = best;
    placed.push(box);
    const place: TagPlace = { id: token.id, text: lines.join("\n"), ...box };
    if (ring > 0) {
      const px = Math.max(box.x, Math.min(token.x, box.x + box.w));
      const py = Math.max(box.y, Math.min(token.y, box.y + box.h));
      const len = Math.hypot(px - token.x, py - token.y) || 1;
      const r = reach(token) + 0.05;
      place.leader = { x1: token.x + ((px - token.x) / len) * r, y1: token.y + ((py - token.y) / len) * r, x2: px, y2: py };
    }
    out.push(place);
  }
  return out;
}

// The zone's label spot: the middle of its largest rectangle.
export function zoneCentre(zone: Zone): { x: number; y: number } {
  const rect = [...zone.rects].sort((p, q) => q.w * q.h - p.w * p.h)[0];
  return rect ? { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } : { x: 0, y: 0 };
}

// ----- What a screen is sent ------------------------------------------

// The night's live state on the map, kept by the server
// (src/lib/couch/site.ts): where each crew member stands (from the
// whereabouts), where each entity stands now, which doors were opened,
// locked, welded or broken, what has been found and seen, and the motion
// tracker's pings from its last use.
export type SiteState = {
  act: 1 | 2 | 3;
  crew: Array<{ id: string; name: string; zone: string; portraitUrl?: string | null }>;
  // The zone the story is in (the scene's group).
  scene: string;
  // Zones someone has stood in, and zones someone has seen into.
  visited: readonly string[];
  seen: readonly string[];
  // Border index (into map.borders) to its state now.
  borders: Readonly<Record<number, BorderState>>;
  // Entity id to the zone it stands in now, or "" once taken or gone.
  moved: Readonly<Record<string, string>>;
  found: readonly string[];
  pings: readonly string[];
  // A foe's stance now, once the GM has changed it (move_foe).
  stances?: Readonly<Record<string, "active" | "passive">>;
  // A person, item, clue or body the crew knows of, to the zone they last
  // knew it in: seen there, or told (mark_on_map). It stays on the map.
  known?: Readonly<Record<string, string>>;
  // A landmark or a thing the GM named that the site does not place
  // (mark_on_map): "Clamp release", "Barricade".
  marks?: readonly SiteMark[];
  // What has happened to a zone (set_zone): zone id to its conditions.
  conditions?: Readonly<Record<string, readonly ZoneCondition[]>>;
  // A section's state now, once the GM has changed it (set_section).
  sections?: Readonly<Record<string, SectionState>>;
  // Holes blown in walls (set_border "broken" where there was no way
  // through), as borders after the site's own, in the order made.
  breaches?: ReadonlyArray<{ a: string; b: string }>;
  // Zones (and "section:<id>") changed since the crew last moved, for the
  // TV's alarm: what just burned, vented, collapsed, docked or drifted.
  alerts?: readonly string[];
};

export type SiteMark = { id: string; name: string; zone: string };

const stanceOf = (entity: Entity, state: Pick<SiteState, "stances">) => state.stances?.[entity.id] ?? entity.stance;

export type ZoneSight = "here" | "visible" | "seen" | "unseen";
export type ViewZone = { id: string; name: string; kind: ZoneKind; rects: Rect[]; features: ZoneFeature[]; sight: ZoneSight; scene?: boolean; hazards?: ZoneCondition[]; section?: string };
// last: a person shown where the crew last knew them, out of sight now.
export type ViewToken = { id: string; kind: EntityKind | "crew" | "landmark"; name: string; zone: string; x: number; y: number; portraitUrl?: string; stance?: "active" | "passive"; last?: true };
export type ViewExit = { zone: string; name: string | null; kind: BorderKind; state: BorderState; hazards?: ZoneCondition[] };
// A section on screen: where it has drifted to (0 while docked), turned by
// turn degrees about its centre, and fresh when it docked or drifted since
// the crew last moved, so the TV plays it.
export type ViewSection = { id: string; name: string; state: "docked" | "adrift"; dx: number; dy: number; turn: number; cx: number; cy: number; fresh?: true };
export type SiteView = {
  cols: number;
  rows: number;
  zones: ViewZone[];
  walls: WallRun[];
  doors: DoorMark[];
  props: Array<Prop & { section?: string }>;
  tokens: ViewToken[];
  pings: Array<{ zone: string; x: number; y: number }>;
  // The ways out of each zone a crew member stands in, for the phone.
  exits: Record<string, ViewExit[]>;
  // Zones where something just happened (fire, a blast, a vent to space),
  // until the crew next moves.
  alerts: Array<{ zone: string; x: number; y: number }>;
  // Sections on the map; a drawn thing in one carries its id (section).
  sections: ViewSection[];
};

// ----- The map changing under the crew ---------------------------------

type Dynamic = Pick<SiteState, "conditions" | "sections" | "breaches">;

export const sectionOf = (map: SiteMap, zoneId: string): Section | undefined => map.sections?.find((section) => section.zones.includes(zoneId));
export const sectionState = (section: Section, state: Pick<SiteState, "sections">): SectionState => state.sections?.[section.id] ?? section.state ?? "docked";
export const conditionsOf = (state: Pick<SiteState, "conditions">, zoneId: string): readonly ZoneCondition[] => state.conditions?.[zoneId] ?? [];
const has = (state: Pick<SiteState, "conditions">, zoneId: string, condition: ZoneCondition) => conditionsOf(state, zoneId).includes(condition);

// Zones that are not on the map now: those of an absent section.
export function goneZones(map: SiteMap, state: Pick<SiteState, "sections">): Set<string> {
  return new Set((map.sections ?? []).filter((section) => sectionState(section, state) === "absent").flatMap((section) => section.zones));
}

// Zones nobody can walk into: wrecked, or gone.
export function blockedZones(map: SiteMap, state: Dynamic): Set<string> {
  const blocked = goneZones(map, state);
  for (const zone of map.zones) if (has(state, zone.id, "wrecked")) blocked.add(zone.id);
  return blocked;
}

const veiledZones = (map: SiteMap, state: Pick<SiteState, "conditions">) => new Set(map.zones.filter((zone) => has(state, zone.id, "smoke")).map((zone) => zone.id));

// Where a hole can be blown between two zones that share a wall: the middle
// of the wall they share.
export function breachSpot(map: SiteMap, a: string, b: string): { x: number; y: number } | null {
  const edges = sharedEdges(zoneGrid(map), a, b);
  if (!edges.length) return null;
  const edge = edges[Math.floor(edges.length / 2)];
  return edge.axis === "v" ? { x: edge.x, y: edge.y + 0.5 } : { x: edge.x + 0.5, y: edge.y };
}

// The site as it stands tonight: its own borders, then the holes blown in
// its walls. Every rule below reads this, so a breach is a way through like
// any other (its index after the site's own is where set_border keeps it).
export function liveMap(map: SiteMap, state: Pick<SiteState, "breaches">): SiteMap {
  if (!state.breaches?.length) return map;
  const breaches = state.breaches.flatMap(({ a, b }) => {
    const at = breachSpot(map, a, b);
    return at ? [{ a, b, kind: "breach" as const, at, state: "broken" as const }] : [];
  });
  return { ...map, borders: [...map.borders, ...breaches] };
}

export const borderStates = (map: SiteMap, state: Pick<SiteState, "borders"> & Partial<Dynamic>): Map<Border, BorderState> => {
  const states = new Map<Border, BorderState>();
  map.borders.forEach((border, index) => {
    const now = state.borders[index];
    if (now) states.set(border, now);
    // A border to a section that is adrift or gone joins nothing.
    const sa = sectionOf(map, border.a);
    const sb = sectionOf(map, border.b);
    if (sa !== sb && [sa, sb].some((section) => section && sectionState(section, state) !== "docked")) states.set(border, "severed");
  });
  return states;
};

// What the crew can see right now: line of sight from every zone someone
// stands in. Smoke hides a zone from outside, and the room from inside it.
export function visibleNow(map: SiteMap, state: Pick<SiteState, "crew" | "borders"> & Partial<Dynamic>): Set<string> {
  const states = borderStates(map, state);
  const veiled = veiledZones(map, state);
  const visible = new Set<string>();
  for (const member of state.crew) for (const zone of lineOfSight(map, member.zone, states, veiled)) visible.add(zone);
  return visible;
}

const withCondition = (conditions: Record<string, ZoneCondition[]>, zoneId: string, condition: ZoneCondition, on: boolean) => {
  const now = conditions[zoneId] ?? [];
  // Dark and lit undo each other; vacuum puts out fire and clears smoke.
  const cleared = now.filter((c) => c !== condition && !(on && ((condition === "dark" && c === "lit") || (condition === "lit" && c === "dark") || (condition === "vacuum" && (c === "fire" || c === "smoke")))));
  const next = on ? [...cleared, condition] : cleared;
  if (next.length) conditions[zoneId] = next;
  else delete conditions[zoneId];
};

// Set or lift one condition on a zone. Lifting "all" clears the zone.
export function setCondition(state: Pick<SiteState, "conditions">, zoneId: string, condition: ZoneCondition | "all", on: boolean): Record<string, ZoneCondition[]> {
  const conditions = Object.fromEntries(Object.entries(state.conditions ?? {}).map(([id, list]) => [id, [...list]]));
  if (condition === "all") delete conditions[zoneId];
  else withCondition(conditions, zoneId, condition, on);
  return conditions;
}

// The air goes at once (rulebook decompression): every zone open to a zone
// in vacuum, through open borders, open or broken doors and breaches, is in
// vacuum too. A shut door holds the air. The zones newly vented.
export function floodVacuum(map: SiteMap, state: Pick<SiteState, "borders"> & Dynamic): { conditions: Record<string, ZoneCondition[]>; vented: string[] } {
  const live = liveMap(map, state);
  const states = borderStates(live, state);
  const conditions = setCondition(state, "", "all", false);
  const queue = live.zones.filter((zone) => has(state, zone.id, "vacuum")).map((zone) => zone.id);
  const vented: string[] = [];
  while (queue.length) {
    const at = queue.shift() as string;
    for (const border of live.borders) {
      if (border.a !== at && border.b !== at) continue;
      const other = border.a === at ? border.b : border.a;
      if (!isOpen(border, states.get(border) ?? border.state ?? defaultState(border)) || conditions[other]?.includes("vacuum")) continue;
      withCondition(conditions, other, "vacuum", true);
      vented.push(other);
      queue.push(other);
    }
  }
  return { conditions, vented };
}

// A stealth turn passes for the fire: it takes every zone open to it (not
// through a shut door, not into vacuum or rubble), and its smoke every
// zone open to it or joined by a vent. What spread, for the GM and the TV.
export function spreadHazards(map: SiteMap, state: Pick<SiteState, "borders"> & Dynamic): { conditions: Record<string, ZoneCondition[]>; burning: string[]; smoke: string[] } {
  const live = liveMap(map, state);
  const states = borderStates(live, state);
  const conditions = setCondition(state, "", "all", false);
  const burning: string[] = [];
  const smoke: string[] = [];
  const fires = live.zones.filter((zone) => has(state, zone.id, "fire")).map((zone) => zone.id);
  for (const at of fires) {
    for (const border of live.borders) {
      if (border.a !== at && border.b !== at) continue;
      const other = border.a === at ? border.b : border.a;
      const st = states.get(border) ?? border.state ?? defaultState(border);
      if (st === "severed" || has(state, other, "vacuum") || has(state, other, "wrecked")) continue;
      if (isOpen(border, st)) {
        if (!conditions[other]?.includes("fire")) {
          withCondition(conditions, other, "fire", true);
          burning.push(other);
        }
      } else if (border.kind === "vent" && !conditions[other]?.includes("smoke") && !conditions[other]?.includes("fire")) {
        withCondition(conditions, other, "smoke", true);
        smoke.push(other);
      }
    }
  }
  // Fire fills its own zone with smoke.
  for (const zone of [...fires, ...burning]) if (!conditions[zone].includes("smoke")) withCondition(conditions, zone, "smoke", true);
  return { conditions, burning, smoke };
}

// Who and what can be marked as known: never a foe or the threat, which
// show only while in sight (the fear is not knowing where it is).
export const markable = (entity: Entity) => entity.kind === "npc" || entity.kind === "item" || entity.kind === "clue" || entity.kind === "body";

// Where each entity stands for the players, or null while they cannot know:
// nothing until the GM has revealed or marked it (the room hears of it
// before it sees it); then in sight, where it is; an item, clue or body seen or marked, where it
// lies; a person out of sight, where the crew last knew them ("last"),
// unless that zone is in sight and they are not in it.
function playersSee(entity: Entity, state: SiteState, visible: ReadonlySet<string>, seen: ReadonlySet<string>): { zone: string; last?: true } | null {
  const zone = state.moved[entity.id] ?? entity.zone;
  if (!zone) return null;
  const known = state.known?.[entity.id];
  if (!state.found.includes(entity.id) && !known) return null;
  if (visible.has(zone)) return { zone };
  const stays = entity.kind === "item" || entity.kind === "body" || entity.kind === "clue";
  if (stays) return seen.has(zone) || known ? { zone } : null;
  if (entity.kind === "npc" && known && !visible.has(known)) return { zone: known, last: true };
  return null;
}

// The crew's knowledge after a look around: every revealed person, item,
// clue or body in sight is known where it stands, and a person whose last known
// zone is in sight without them is no longer known there. Kept by
// publishCouchSite, so a person met once stays on the map.
export function rememberSightings(site: SiteMap, state: SiteState): Record<string, string> {
  const map = liveMap(site, state);
  const visible = visibleNow(map, state);
  const known: Record<string, string> = { ...state.known };
  for (const entity of map.entities) {
    if (!markable(entity) || (entity.act ?? 1) > state.act) continue;
    if (!state.found.includes(entity.id)) continue;
    const zone = state.moved[entity.id] ?? entity.zone;
    if (!zone) delete known[entity.id];
    else if (visible.has(zone)) known[entity.id] = zone;
    else if (known[entity.id] && visible.has(known[entity.id])) delete known[entity.id];
  }
  return known;
}

// The map under the fog of war, made on the server so a phone never
// receives what it should not show (as the deck plan, docs/
// couch-navigation.md). The night starts black: a zone is drawn, with its
// walls, doors and furniture, once someone has seen into it, and stays
// drawn. Nothing in it shows until the GM reveals it as the story shows it
// to the crew, so the map never spoils what the narration has not said.
// Then foes show only while someone can see their zone; items, clues and
// bodies stay where they were seen, people where they were last seen. What
// the crew was told of (mark_on_map) is marked too, its zone a bare named
// outline until someone sees into it, as is every zone next to one someone
// has stood in. A later act's entities wait for their act. The GM's view
// lifts it all.
//
// The map changes under the crew too: a zone's hazards (fire, smoke,
// vacuum, wrecked) show on every zone drawn, as the ship's alarms tell
// everyone; a section that is absent is not sent at all, one adrift is sent
// with where it drifted to; a hole blown in a wall is a door mark like any
// other.
export function siteView(site: SiteMap, state: SiteState, audience: "players" | "gm"): SiteView {
  const gm = audience === "gm";
  const map = liveMap(site, state);
  const gone = goneZones(map, state);
  const states = borderStates(map, state);
  const here = new Set(state.crew.map((member) => member.zone));
  const visible = visibleNow(map, state);
  const seen = new Set([...state.seen, ...state.visited, ...visible]);
  const shown = (id: string) => gm || seen.has(id);
  const sightOf = (id: string): ZoneSight => (here.has(id) ? "here" : visible.has(id) ? "visible" : seen.has(id) ? "seen" : "unseen");
  type Placed = Omit<ViewToken, "zone" | "x" | "y">;
  const placed: Array<{ zone: string; token: Placed }> = [];
  for (const member of state.crew) placed.push({ zone: member.zone, token: { id: member.id, kind: "crew", name: member.name, ...(member.portraitUrl ? { portraitUrl: member.portraitUrl } : {}) } });
  for (const entity of map.entities) {
    if (entity.kind === "crew-start" || (entity.act ?? 1) > state.act) continue;
    const zone = state.moved[entity.id] ?? entity.zone;
    if (gone.has(zone)) continue;
    const at = gm ? (zone ? { zone } : null) : playersSee(entity, state, visible, seen);
    if (at) placed.push({ zone: at.zone, token: { id: entity.id, kind: entity.kind, name: entity.name, ...(gm && stanceOf(entity, state) ? { stance: stanceOf(entity, state) } : {}), ...(at.last ? { last: true as const } : {}) } });
  }
  for (const mark of state.marks ?? []) placed.push({ zone: mark.zone, token: { id: mark.id, kind: "landmark", name: mark.name } });
  // A zone not yet seen into is drawn as a named outline when something is
  // marked in it, or when it lies across a border from a zone someone has
  // stood in: the crew read the signs on the doors they passed.
  const outlined = new Set(placed.map((entry) => entry.zone));
  const stood = new Set([...state.visited, ...here]);
  for (const border of map.borders) {
    if (stood.has(border.a)) outlined.add(border.b);
    if (stood.has(border.b)) outlined.add(border.a);
  }
  const sent = (id: string) => !gone.has(id) && (shown(id) || outlined.has(id));
  const sectionId = (zoneId: string) => sectionOf(map, zoneId)?.id;
  const zones: ViewZone[] = map.zones
    .filter((zone) => sent(zone.id))
    .map((zone) => {
      const hazards = conditionsOf(state, zone.id).filter((c) => HAZARDS.has(c));
      const section = sectionId(zone.id);
      return {
        id: zone.id,
        name: zone.name,
        kind: zone.kind,
        rects: zone.rects,
        features: shown(zone.id) ? featuresNow(zone, state) : [],
        sight: sightOf(zone.id),
        ...(zone.id === state.scene ? { scene: true } : {}),
        ...(hazards.length ? { hazards } : {}),
        ...(section ? { section } : {}),
      };
    });
  const props = map.props.flatMap((prop) => {
    const zone = zoneAtPoint(map, prop.x + prop.w / 2, prop.y + prop.h / 2);
    const section = sectionId(zone);
    return shown(zone) && !gone.has(zone) ? [section ? { ...prop, section } : prop] : [];
  });
  const byZone = new Map<string, Placed[]>();
  for (const { zone, token } of placed) byZone.set(zone, [...(byZone.get(zone) ?? []), token]);
  const tokens: ViewToken[] = [];
  for (const [zoneId, list] of byZone) {
    const zone = map.zones.find((z) => z.id === zoneId);
    if (!zone) continue;
    tokenSpots(zone, list.length).forEach((spot, i) => tokens.push({ ...list[i], zone: zoneId, ...spot }));
  }
  // A door between a section and the rest belongs to neither: it stays on
  // the rest's side, severed, when the section drifts.
  const doors = doorMarks(map, states).filter((mark) => (shown(mark.a) && !gone.has(mark.a)) || (shown(mark.b) && !gone.has(mark.b)));
  const pings = state.pings.flatMap((zoneId) => {
    const zone = map.zones.find((z) => z.id === zoneId);
    return zone ? [{ zone: zoneId, ...zoneCentre(zone) }] : [];
  });
  const alerts = (state.alerts ?? []).flatMap((zoneId) => {
    const zone = map.zones.find((z) => z.id === zoneId);
    return zone && sent(zoneId) ? [{ zone: zoneId, ...zoneCentre(zone) }] : [];
  });
  const sections: ViewSection[] = (map.sections ?? []).flatMap((section) => {
    const now = sectionState(section, state);
    if (now === "absent" || !zones.some((zone) => zone.section === section.id)) return [];
    const centre = boundsOf(map.zones.filter((zone) => section.zones.includes(zone.id)).flatMap((zone) => zone.rects), 0) ?? { x: 0, y: 0, w: 0, h: 0 };
    const adrift = now === "adrift";
    return [
      {
        id: section.id,
        name: section.name,
        state: now,
        dx: adrift ? section.drift.x : 0,
        dy: adrift ? section.drift.y : 0,
        turn: adrift ? (section.drift.turn ?? 0) : 0,
        cx: centre.x + centre.w / 2,
        cy: centre.y + centre.h / 2,
        ...(state.alerts?.includes(`section:${section.id}`) ? { fresh: true as const } : {}),
      },
    ];
  });
  // Walls: a section adrift draws its own whole, apart from the rest.
  const adrift = new Set(sections.filter((section) => section.state === "adrift").map((section) => section.id));
  const wallsShown = gm ? undefined : seen;
  const walls = adrift.size
    ? [
        ...wallRuns(map, wallsShown, (id) => !gone.has(id) && !adrift.has(sectionId(id) ?? "")),
        ...[...adrift].flatMap((id) => wallRuns(map, wallsShown, (zone) => sectionId(zone) === id).map((wall) => ({ ...wall, section: id }))),
      ]
    : wallRuns(map, wallsShown, gone.size ? (id) => !gone.has(id) : undefined);
  const exits: Record<string, ViewExit[]> = {};
  for (const zoneId of here) {
    exits[zoneId] = map.borders
      .filter((border) => border.a === zoneId || border.b === zoneId)
      .map((border) => {
        const other = border.a === zoneId ? border.b : border.a;
        const hazards = conditionsOf(state, other).filter((c) => HAZARDS.has(c));
        return { zone: other, name: map.zones.find((z) => z.id === other)?.name ?? null, kind: border.kind, state: states.get(border) ?? border.state ?? defaultState(border), ...(hazards.length ? { hazards } : {}) };
      })
      .filter((exit) => !gone.has(exit.zone));
  }
  return { cols: map.cols, rows: map.rows, zones, walls, doors, props, tokens, pings, exits, alerts, sections };
}

// A zone's rulebook features tonight: the power failing makes it dark, a
// flare or a lamp lights it.
export function featuresNow(zone: Zone, state: Pick<SiteState, "conditions">): ZoneFeature[] {
  const features = new Set(zone.features ?? []);
  if (has(state, zone.id, "dark")) features.add("dark");
  if (has(state, zone.id, "lit")) features.delete("dark");
  return [...features];
}

// Where a drawn thing stands on screen: moved with its section's drift.
export function driftedRects(view: Pick<SiteView, "zones" | "sections">): Rect[] {
  const shift = new Map(view.sections.map((section) => [section.id, section]));
  return view.zones.flatMap((zone) => {
    const section = zone.section ? shift.get(zone.section) : undefined;
    return section ? zone.rects.map((rect) => ({ ...rect, x: rect.x + section.dx, y: rect.y + section.dy })) : zone.rects;
  });
}

function zoneAtPoint(map: SiteMap, x: number, y: number): string {
  return map.zones.find((zone) => zone.rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h))?.id ?? "";
}

// ----- The TV's camera --------------------------------------------------

// The smallest tile the TV draws the whole known site at; below it the map
// is too big for the room to read, and the camera follows the scene with an
// overview in the corner instead.
export const TV_MIN_TILE = 26;
// The least the close camera shows around the scene, in tiles.
const FOCUS_MIN = { w: 22, h: 14 };

export function boundsOf(rects: readonly Rect[], margin = 1): Rect | null {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x)) - margin;
  const y0 = Math.min(...rects.map((r) => r.y)) - margin;
  const x1 = Math.max(...rects.map((r) => r.x + r.w)) + margin;
  const y1 = Math.max(...rects.map((r) => r.y + r.h)) + margin;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function atLeast(frame: Rect, min: { w: number; h: number }): Rect {
  const w = Math.max(frame.w, min.w);
  const h = Math.max(frame.h, min.h);
  return { x: frame.x + frame.w / 2 - w / 2, y: frame.y + frame.h / 2 - h / 2, w, h };
}

// Where the TV looks: the whole known site when it fits at TV_MIN_TILE,
// else the scene's zone and what can be seen from it, never smaller than
// FOCUS_MIN, at the screen's shape. "overview" says the corner map is
// needed.
export function cameraFrame(view: SiteView, screen: { width: number; height: number }): { frame: Rect; overview: boolean; whole: Rect } | null {
  const whole = boundsOf(driftedRects(view));
  if (!whole) return null;
  const fit = Math.min(screen.width / whole.w, screen.height / whole.h);
  // Never closer than FOCUS_MIN: three rooms found must not fill the TV
  // with names a tile wide the size of a hand.
  if (fit >= TV_MIN_TILE) return { frame: atLeast(whole, FOCUS_MIN), overview: false, whole };
  const lit = view.zones.filter((zone) => zone.scene || zone.sight === "here" || zone.sight === "visible");
  const scene = view.zones.filter((zone) => zone.scene);
  const focus = boundsOf(driftedRects({ zones: scene.length ? [...scene, ...lit.filter((zone) => zone.sight === "visible" || zone.scene)] : lit, sections: view.sections })) ?? whole;
  const aspect = screen.width / Math.max(1, screen.height);
  let w = Math.max(focus.w, FOCUS_MIN.w, screen.width / (TV_MIN_TILE * 1.6));
  let h = Math.max(focus.h, FOCUS_MIN.h);
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  return { frame: { x: cx - w / 2, y: cy - h / 2, w, h }, overview: true, whole };
}

// ----- Rules the server keeps -------------------------------------------

export function zoneByName(map: SiteMap, name: string): Zone | undefined {
  const wanted = name.trim().toLowerCase().replace(/^the\s+/, "");
  return map.zones.find((zone) => zone.id === wanted || zone.name.toLowerCase().replace(/^the\s+/, "") === wanted);
}

// The way a group walks between zones in one stealth turn (rulebook p. 51:
// two zones), through open or closed doors, never through a locked or
// sealed border. The crew crawls a vent only when sent into or out of a
// crawlway, so a walk to the next room is never quietly routed through the
// ducts; foes (crawl: true) take them as they please. Nobody walks into or
// through a blocked zone (wrecked, or a section that is gone); walking out
// of one is allowed. The zones passed on the way, the destination last, or
// why not.
export function stealthPath(
  map: SiteMap,
  states: ReadonlyMap<Border, BorderState>,
  from: string,
  to: string,
  reach = 2,
  crawl = false,
  blocked: ReadonlySet<string> = new Set(),
): { path: string[] } | { error: string } {
  if (from === to) return { path: [to] };
  if (blocked.has(to)) {
    const name = map.zones.find((zone) => zone.id === to)?.name ?? to;
    return { error: `${name} cannot be entered: it is wrecked, or no longer on the map (SITE MAP).` };
  }
  const kindOf = (id: string) => map.zones.find((zone) => zone.id === id)?.kind;
  const vents = crawl || kindOf(from) === "crawlway" || kindOf(to) === "crawlway";
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const next = queue.shift() as string;
    for (const border of map.borders) {
      if (border.a !== next && border.b !== next) continue;
      const other = border.a === next ? border.b : border.a;
      if (prev.has(other) || blocked.has(other)) continue;
      if (border.kind === "vent" && !vents) continue;
      if (!PASSABLE.has(states.get(border) ?? border.state ?? defaultState(border))) continue;
      prev.set(other, next);
      queue.push(other);
    }
  }
  if (!prev.has(to)) {
    const name = map.zones.find((zone) => zone.id === to)?.name ?? to;
    return { error: `Nothing open leads to ${name} from here: a locked or sealed door, a severed way or a wrecked zone is in the way (SITE MAP). Open it first (set_border), or go another way.` };
  }
  const path: string[] = [];
  for (let at = to; at && at !== from; at = prev.get(at) as string) path.unshift(at);
  if (path.length > reach) {
    const names = path.map((id) => map.zones.find((zone) => zone.id === id)?.name ?? id);
    return { error: `${names[names.length - 1]} is ${path.length} zones away (${names.join(" → ")}); a stealth turn moves at most ${reach}. Move them to ${names[reach - 1]} this turn.` };
  }
  return { path };
}

// The motion tracker (rulebook p. 52): every large moving thing within four
// zones, through walls; a passive foe is standing still and does not ping.
export function trackerPings(map: SiteMap, state: Pick<SiteState, "act" | "moved" | "stances" | "sections">, from: string): string[] {
  const zones = new Set<string>();
  const gone = goneZones(map, state);
  for (const entity of map.entities) {
    if (entity.kind !== "foe" && entity.kind !== "threat" && entity.kind !== "npc") continue;
    if ((entity.act ?? 1) > state.act || stanceOf(entity, state) === "passive") continue;
    const zone = state.moved[entity.id] ?? entity.zone;
    if (zone && zone !== from && !gone.has(zone) && zoneDistance(map, from, zone, { vents: true }) <= 4) zones.add(zone);
  }
  return [...zones];
}

// What the GM reads of the site (SITE MAP): the rules, where the story is,
// the ways out, every entity and every zone's ways out, compact.
export function sitePrompt(site: SiteMap, state: SiteState): string {
  const map = liveMap(site, state);
  const gone = goneZones(map, state);
  const states = borderStates(map, state);
  const name = (id: string) => map.zones.find((zone) => zone.id === id)?.name ?? id;
  const scene = map.zones.find((zone) => zone.id === state.scene);
  const visible = visibleNow(map, state);
  const found = new Set(state.found);
  const way = (border: Border, from: string) => {
    const st = states.get(border) ?? border.state ?? defaultState(border);
    const other = border.a === from ? border.b : border.a;
    const hazards = conditionsOf(state, other).filter((c) => HAZARDS.has(c));
    return `${name(other)} (${border.kind}${border.kind === "open" ? "" : `, ${st}`}${st === "locked" && border.key ? `; opens with ${border.key}` : ""}${hazards.length ? `; ${hazards.join(", ")} there` : ""})`;
  };
  const zoneTag = (zone: Zone) => {
    const tags = [...featuresNow(zone, state), ...conditionsOf(state, zone.id).filter((c) => HAZARDS.has(c)).map((c) => c.toUpperCase())];
    return tags.length ? ` [${tags.join(", ")}]` : "";
  };
  const sections = (map.sections ?? []).map((section) => `- ${section.name} [${section.id}] (${sectionState(section, state)}; ${section.zones.map(name).join(", ")}): ${section.note}`);
  const entityLine = (entity: Entity) => {
    const zone = state.moved[entity.id] ?? entity.zone;
    const known = state.known?.[entity.id];
    const flags = [
      entity.kind,
      stanceOf(entity, state),
      found.has(entity.id) ? "" : entity.hidden ? "hidden, not on screens" : "not on screens",
      (entity.act ?? 1) > state.act ? `enters in act ${entity.act}` : "",
      known ? (known === zone ? "marked on the crew's map" : `the crew last knew them in ${name(known)}`) : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `- ${entity.name} [${entity.id}] (${flags}) in ${zone ? name(zone) : "gone"}: ${entity.note}`;
  };
  return [
    "SITE MAP (the overhead night: the TV shows this map from above; you alone see all of it)",
    "Rules: zones are rulebook zones. A stealth turn moves a group up to two zones through open or closed doors (move_party with a zone's name); vents crawl only, cramped. Locked or sealed borders stop everyone until set_border opens them. A closed door blocks the view. Open and close doors with set_border as the crew does. Foes are yours to move with move_foe after the crew moves (two zones a turn, the threat three); a passive foe in sight can be sneaked past (Mobility against its Observation); one that hears the crew turns active. Nothing ON THE MAP shows on the screens until you reveal it: when your narration shows the crew a person, foe, item, clue or body, call reveal for it in that reply; a hidden one only once they search it out or it shows itself. When they pick up an item, take_item. When they learn where a person, item, clue or landmark is without seeing it (told over comms, read on a screen, a body they found earlier), or a landmark that matters comes into view (the way off the map, a barricade, a breach), call mark_on_map so it is on every screen; what they have revealed and see is marked already. A motion tracker check is track. The map starts black and the crew sees only what is in sight: describe only that.",
    "The map changes when the story does: put it on the map as you narrate it. set_zone marks what happens to a zone: fire (spreads into every zone open to it each stealth turn; a shut door holds it), smoke (hides the zone from outside and the room from inside), vacuum (a hull breach: every zone open to it vents at once, a shut door holds the air, it puts out fire), wrecked (collapsed, blown apart: nobody goes in), dark (the power fails) or lit (a flare, a lamp); state off when it is put out, cleared or repaired. An explosion is set_zone wrecked or fire there, and set_border broken between two zones that share a wall blows a hole through it. A lockdown is set_border with to \"all\". A ship or vehicle that docks, undocks or flies off is set_section (SECTIONS). Everyone sees these on the TV with an alarm; say what the crew sees and hears.",
    scene ? `SCENE ZONE: ${scene.name}${zoneTag(scene)}: ${scene.look}${scene.exit ? ` Way off the map: ${scene.exit}` : ""}` : "SCENE ZONE: none yet: the crew starts in " + name(map.entities.find((entity) => entity.kind === "crew-start")?.zone ?? ""),
    scene ? `WAYS OUT: ${map.borders.filter((border) => border.a === scene.id || border.b === scene.id).map((border) => way(border, scene.id)).join("; ")}` : "",
    `IN SIGHT: ${[...visible].map(name).join(", ") || "nothing"}`,
    "ON THE MAP:",
    ...map.entities.filter((entity) => entity.kind !== "crew-start" && (state.moved[entity.id] ?? entity.zone)).map(entityLine),
    ...(state.marks?.length ? ["MARKED by you: " + state.marks.map((mark) => `${mark.name} in ${name(mark.zone)}`).join("; ")] : []),
    ...(sections.length ? ["SECTIONS (set_section: docked, adrift or absent; absent is off the map, adrift drifts away and nothing crosses):", ...sections] : []),
    "ZONES (ways out):",
    ...map.zones.filter((zone) => !gone.has(zone.id)).map((zone) => `- ${zone.name}${zoneTag(zone)}: ${map.borders.filter((border) => border.a === zone.id || border.b === zone.id).map((border) => way(border, zone.id)).join("; ")}`),
  ]
    .filter(Boolean)
    .join("\n");
}
