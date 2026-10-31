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

export type BorderKind = "open" | "door" | "hatch" | "vent" | "airlock";
export type BorderState = "open" | "closed" | "locked" | "sealed" | "broken";

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
};

const PASSABLE: ReadonlySet<BorderState> = new Set(["open", "closed", "broken"]);

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
  const start = map.entities.find((entity) => entity.kind === "crew-start");
  if (!start) problems.push("no crew-start: the crew has nowhere to begin");
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
export function lineOfSight(map: SiteMap, zoneId: string, states: ReadonlyMap<Border, BorderState> = new Map()): Set<string> {
  const seen = new Set([zoneId]);
  for (const border of map.borders) {
    if (border.a !== zoneId && border.b !== zoneId) continue;
    const state = states.get(border) ?? border.state ?? defaultState(border);
    if (border.kind === "open" || state === "open" || state === "broken") seen.add(border.a === zoneId ? border.b : border.a);
  }
  return seen;
}

// ----- Drawing --------------------------------------------------------

export type WallRun = { x: number; y: number; axis: "h" | "v"; length: number };
export type DoorMark = { x: number; y: number; axis: "h" | "v"; span: number; kind: BorderKind; state: BorderState; a: string; b: string };

// The walls: every tile edge between two different zones, or a zone and
// solid wall, unless the border there is open; merged into runs so a
// screen draws a few dozen bars, not hundreds. Given the zones the crew
// has seen, only their walls: the rest of the site is still black.
export function wallRuns(map: SiteMap, shown?: ReadonlySet<string>): WallRun[] {
  const grid = zoneGrid(map);
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
};

const stanceOf = (entity: Entity, state: Pick<SiteState, "stances">) => state.stances?.[entity.id] ?? entity.stance;

export type ZoneSight = "here" | "visible" | "seen" | "unseen";
export type ViewZone = { id: string; name: string; kind: ZoneKind; rects: Rect[]; features: ZoneFeature[]; sight: ZoneSight; scene?: boolean };
export type ViewToken = { id: string; kind: EntityKind | "crew"; name: string; zone: string; x: number; y: number; portraitUrl?: string; stance?: "active" | "passive" };
export type ViewExit = { zone: string; name: string | null; kind: BorderKind; state: BorderState };
export type SiteView = {
  cols: number;
  rows: number;
  zones: ViewZone[];
  walls: WallRun[];
  doors: DoorMark[];
  props: Prop[];
  tokens: ViewToken[];
  pings: Array<{ zone: string; x: number; y: number }>;
  // The ways out of each zone a crew member stands in, for the phone.
  exits: Record<string, ViewExit[]>;
};

export const borderStates = (map: SiteMap, state: Pick<SiteState, "borders">): Map<Border, BorderState> => {
  const states = new Map<Border, BorderState>();
  map.borders.forEach((border, index) => {
    const now = state.borders[index];
    if (now) states.set(border, now);
  });
  return states;
};

// What the crew can see right now: line of sight from every zone someone
// stands in.
export function visibleNow(map: SiteMap, state: Pick<SiteState, "crew" | "borders">): Set<string> {
  const states = borderStates(map, state);
  const visible = new Set<string>();
  for (const member of state.crew) for (const zone of lineOfSight(map, member.zone, states)) visible.add(zone);
  return visible;
}

// The map under the fog of war, made on the server so a phone never
// receives what it should not show (as the deck plan, docs/
// couch-navigation.md). The night starts black: a zone is drawn, with its
// walls, doors and furniture, once someone has seen into it, and stays
// drawn. People and foes show only while someone can see their zone; items,
// clues and bodies stay where they were seen. Hidden things wait to be
// found, a later act's entities for their act. The GM's view lifts it all.
export function siteView(map: SiteMap, state: SiteState, audience: "players" | "gm"): SiteView {
  const gm = audience === "gm";
  const states = borderStates(map, state);
  const here = new Set(state.crew.map((member) => member.zone));
  const visible = visibleNow(map, state);
  const seen = new Set([...state.seen, ...state.visited, ...visible]);
  const shown = (id: string) => gm || seen.has(id);
  const sightOf = (id: string): ZoneSight => (here.has(id) ? "here" : visible.has(id) ? "visible" : seen.has(id) ? "seen" : "unseen");
  const zones: ViewZone[] = map.zones
    .filter((zone) => shown(zone.id))
    .map((zone) => ({ id: zone.id, name: zone.name, kind: zone.kind, rects: zone.rects, features: zone.features ?? [], sight: sightOf(zone.id), ...(zone.id === state.scene ? { scene: true } : {}) }));
  const props = map.props.filter((prop) => shown(zoneAtPoint(map, prop.x + prop.w / 2, prop.y + prop.h / 2)));
  const found = new Set(state.found);
  const listed = map.entities.filter((entity) => {
    if (entity.kind === "crew-start") return false;
    const zone = state.moved[entity.id] ?? entity.zone;
    if (!zone || (entity.act ?? 1) > state.act) return false;
    if (gm) return true;
    if (entity.hidden && !found.has(entity.id)) return false;
    const stays = entity.kind === "item" || entity.kind === "body" || entity.kind === "clue";
    return visible.has(zone) || (stays && seen.has(zone));
  });
  type Placed = Omit<ViewToken, "zone" | "x" | "y">;
  const byZone = new Map<string, Placed[]>();
  const place = (zone: string, token: Placed) => byZone.set(zone, [...(byZone.get(zone) ?? []), token]);
  for (const member of state.crew) place(member.zone, { id: member.id, kind: "crew", name: member.name, ...(member.portraitUrl ? { portraitUrl: member.portraitUrl } : {}) });
  for (const entity of listed) place(state.moved[entity.id] ?? entity.zone, { id: entity.id, kind: entity.kind, name: entity.name, ...(gm && stanceOf(entity, state) ? { stance: stanceOf(entity, state) } : {}) });
  const tokens: ViewToken[] = [];
  for (const [zoneId, list] of byZone) {
    const zone = map.zones.find((z) => z.id === zoneId);
    if (!zone) continue;
    tokenSpots(zone, list.length).forEach((spot, i) => tokens.push({ ...list[i], zone: zoneId, ...spot }));
  }
  const doors = doorMarks(map, states).filter((mark) => shown(mark.a) || shown(mark.b));
  const pings = state.pings.flatMap((zoneId) => {
    const zone = map.zones.find((z) => z.id === zoneId);
    return zone ? [{ zone: zoneId, ...zoneCentre(zone) }] : [];
  });
  const exits: Record<string, ViewExit[]> = {};
  for (const zoneId of here) {
    exits[zoneId] = map.borders
      .filter((border) => border.a === zoneId || border.b === zoneId)
      .map((border) => {
        const other = border.a === zoneId ? border.b : border.a;
        return { zone: other, name: shown(other) ? (map.zones.find((z) => z.id === other)?.name ?? null) : null, kind: border.kind, state: states.get(border) ?? border.state ?? defaultState(border) };
      });
  }
  return { cols: map.cols, rows: map.rows, zones, walls: wallRuns(map, gm ? undefined : seen), doors, props, tokens, pings, exits };
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
  const whole = boundsOf(view.zones.flatMap((zone) => zone.rects));
  if (!whole) return null;
  const fit = Math.min(screen.width / whole.w, screen.height / whole.h);
  // Never closer than FOCUS_MIN: three rooms found must not fill the TV
  // with names a tile wide the size of a hand.
  if (fit >= TV_MIN_TILE) return { frame: atLeast(whole, FOCUS_MIN), overview: false, whole };
  const lit = view.zones.filter((zone) => zone.scene || zone.sight === "here" || zone.sight === "visible");
  const scene = view.zones.filter((zone) => zone.scene);
  const focus = boundsOf((scene.length ? [...scene, ...lit.filter((zone) => zone.sight === "visible" || zone.scene)] : lit).flatMap((zone) => zone.rects)) ?? whole;
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
// ducts; foes (crawl: true) take them as they please. The zones passed on
// the way, the destination last, or why not.
export function stealthPath(map: SiteMap, states: ReadonlyMap<Border, BorderState>, from: string, to: string, reach = 2, crawl = false): { path: string[] } | { error: string } {
  if (from === to) return { path: [to] };
  const kindOf = (id: string) => map.zones.find((zone) => zone.id === id)?.kind;
  const vents = crawl || kindOf(from) === "crawlway" || kindOf(to) === "crawlway";
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const next = queue.shift() as string;
    for (const border of map.borders) {
      if (border.a !== next && border.b !== next) continue;
      const other = border.a === next ? border.b : border.a;
      if (prev.has(other)) continue;
      if (border.kind === "vent" && !vents) continue;
      if (!PASSABLE.has(states.get(border) ?? border.state ?? defaultState(border))) continue;
      prev.set(other, next);
      queue.push(other);
    }
  }
  if (!prev.has(to)) {
    const name = map.zones.find((zone) => zone.id === to)?.name ?? to;
    return { error: `Nothing open leads to ${name} from here: a locked or sealed door is in the way (SITE MAP). Open it first (set_border), or go another way.` };
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
export function trackerPings(map: SiteMap, state: Pick<SiteState, "act" | "moved" | "stances">, from: string): string[] {
  const zones = new Set<string>();
  for (const entity of map.entities) {
    if (entity.kind !== "foe" && entity.kind !== "threat" && entity.kind !== "npc") continue;
    if ((entity.act ?? 1) > state.act || stanceOf(entity, state) === "passive") continue;
    const zone = state.moved[entity.id] ?? entity.zone;
    if (zone && zone !== from && zoneDistance(map, from, zone, { vents: true }) <= 4) zones.add(zone);
  }
  return [...zones];
}

// What the GM reads of the site (SITE MAP): the rules, where the story is,
// the ways out, every entity and every zone's ways out, compact.
export function sitePrompt(map: SiteMap, state: SiteState): string {
  const states = borderStates(map, state);
  const name = (id: string) => map.zones.find((zone) => zone.id === id)?.name ?? id;
  const scene = map.zones.find((zone) => zone.id === state.scene);
  const visible = visibleNow(map, state);
  const found = new Set(state.found);
  const way = (border: Border, from: string) => {
    const st = states.get(border) ?? border.state ?? defaultState(border);
    return `${name(border.a === from ? border.b : border.a)} (${border.kind}${border.kind === "open" ? "" : `, ${st}`}${st === "locked" && border.key ? `; opens with ${border.key}` : ""})`;
  };
  const entityLine = (entity: Entity) => {
    const zone = state.moved[entity.id] ?? entity.zone;
    const flags = [entity.kind, stanceOf(entity, state), entity.hidden && !found.has(entity.id) ? "hidden" : "", (entity.act ?? 1) > state.act ? `enters in act ${entity.act}` : ""].filter(Boolean).join(", ");
    return `- ${entity.name} [${entity.id}] (${flags}) in ${zone ? name(zone) : "gone"}: ${entity.note}`;
  };
  return [
    "SITE MAP (the overhead night: the TV shows this map from above; you alone see all of it)",
    "Rules: zones are rulebook zones. A stealth turn moves a group up to two zones through open or closed doors (move_party with a zone's name); vents crawl only, cramped. Locked or sealed borders stop everyone until set_border opens them. A closed door blocks the view. Open and close doors with set_border as the crew does. Foes are yours to move with move_foe after the crew moves (two zones a turn, the threat three); a passive foe in sight can be sneaked past (Mobility against its Observation); one that hears the crew turns active. When the crew finds a hidden thing call reveal; when they pick up an item, take_item. A motion tracker check is track. The map starts black and the crew sees only what is in sight: describe only that.",
    scene ? `SCENE ZONE: ${scene.name}${scene.features?.length ? ` [${scene.features.join(", ")}]` : ""}: ${scene.look}${scene.exit ? ` Way off the map: ${scene.exit}` : ""}` : "SCENE ZONE: none yet: the crew starts in " + name(map.entities.find((entity) => entity.kind === "crew-start")?.zone ?? ""),
    scene ? `WAYS OUT: ${map.borders.filter((border) => border.a === scene.id || border.b === scene.id).map((border) => way(border, scene.id)).join("; ")}` : "",
    `IN SIGHT: ${[...visible].map(name).join(", ") || "nothing"}`,
    "ON THE MAP:",
    ...map.entities.filter((entity) => entity.kind !== "crew-start" && (state.moved[entity.id] ?? entity.zone)).map(entityLine),
    "ZONES (ways out):",
    ...map.zones.map((zone) => `- ${zone.name}${zone.features?.length ? ` [${zone.features.join(", ")}]` : ""}: ${map.borders.filter((border) => border.a === zone.id || border.b === zone.id).map((border) => way(border, zone.id)).join("; ")}`),
  ]
    .filter(Boolean)
    .join("\n");
}
