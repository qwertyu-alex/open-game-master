// The fight's grid on a couch TV (docs/couch-mode-spec.md 2.11), the pure
// half: the part of the battle map where the fighting is, how far everyone
// stands from each other, where the crew member whose move it is can get to,
// and what each thing that happens on it reads as from the couch. Melee or a
// gun is a question of distance, so the room needs to see it. No React, no
// database: scripts/test-couch-fight.mjs imports it directly.
import { chebyshev, TERRAIN, TILE_FEET, type XY } from "@/lib/battlemap/types";

export type FightMapToken = {
  // The board's token id: an effect names the figure it jolts by it.
  id: string;
  kind: "pc" | "enemy";
  // A character sheet's id or an encounter enemy's.
  refId: string;
  name: string;
  x: number;
  y: number;
  down: boolean;
  // When the server last changed this figure (ms, the server's clock, as an
  // effect's `at`): a walk takes its place among the effects by it.
  movedAt?: number;
};

// The fight's corner of the map. x and y are where the crop starts on the
// whole map; tokens keep whole-map coordinates, as the effects do.
export type CouchFightMap = {
  mapId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Row-major, `width` chars per row, the crop only.
  terrain: string;
  tokens: FightMapToken[];
  // The acting crew member's walk this turn, as the engine counts it: the
  // feet they have left (spent movement, Dash, prone and conditions
  // counted) and, when the board lights them, the squares ("x,y", whole
  // map). Absent on an enemy's turn or before the order is in.
  move?: { refId: string; feetLeft: number; squares?: string[] };
};

// Room around the fighters, and the least a crop shows, in squares: enough to
// see the walls they stand by and somewhere to run to.
const MARGIN = 2;
const MIN_W = 10;
const MIN_H = 6;
// A TV is wide: a crop at least this much wider than tall fills its panel.
const MIN_ASPECT = 1.5;

// Grow [start, start + size) to `want` squares inside [0, limit), evenly on
// both sides where the map allows.
function grow(start: number, size: number, want: number, limit: number): [number, number] {
  const target = Math.min(limit, Math.max(size, want));
  let from = start - Math.floor((target - size) / 2);
  from = Math.max(0, Math.min(from, limit - target));
  return [from, target];
}

// The part of a board the fight happens on: every fighter with room around
// them, wide enough for a TV, never past the map's edge.
export function cropFightMap(
  map: { id: string; width: number; height: number; terrain: string },
  tokens: readonly FightMapToken[],
): CouchFightMap | null {
  if (!tokens.length || map.width <= 0 || map.height <= 0) return null;
  const xs = tokens.map((token) => token.x);
  const ys = tokens.map((token) => token.y);
  let [x, width] = grow(Math.min(...xs), Math.max(...xs) - Math.min(...xs) + 1, 0, map.width);
  let [y, height] = grow(Math.min(...ys), Math.max(...ys) - Math.min(...ys) + 1, 0, map.height);
  [x, width] = grow(x, width, Math.max(width + MARGIN * 2, MIN_W), map.width);
  [y, height] = grow(y, height, Math.max(height + MARGIN * 2, MIN_H), map.height);
  [x, width] = grow(x, width, Math.ceil(height * MIN_ASPECT), map.width);
  const rows: string[] = [];
  for (let row = y; row < y + height; row += 1) {
    rows.push(map.terrain.slice(row * map.width + x, row * map.width + x + width));
  }
  return { mapId: map.id, x, y, width, height, terrain: rows.join(""), tokens: [...tokens] };
}

// The crew members a fight's order names who have no figure on its grid: a
// grid read before the order was in, or a request lost on the way. The TV
// asks for the grid again rather than show a creature alone on the board.
export function missingCrew(map: Pick<CouchFightMap, "tokens">, crewIds: readonly string[]): string[] {
  const standing = new Set(map.tokens.filter((token) => token.kind === "pc").map((token) => token.refId));
  return crewIds.filter((id) => !standing.has(id));
}

// How far apart two squares are, as the engine counts it (every diagonal
// one square, src/lib/battlemap/types.ts chebyshev).
export function feetBetween(a: XY, b: XY): number {
  return chebyshev(a.x, a.y, b.x, b.y) * TILE_FEET;
}

// Next to it: a sword, a wrench or teeth can land.
export function inReach(a: XY, b: XY): boolean {
  return feetBetween(a, b) <= TILE_FEET;
}

const BLOCKS = new Set<string>([TERRAIN.wall, TERRAIN.lowwall, " "]);
const SLOW = new Set<string>([TERRAIN.difficult, TERRAIN.climb, TERRAIN.water]);

// Where a fighter could walk this turn inside the crop, as whole-map "x,y"
// keys: the board's own costs (difficult ground, climbing and water cost
// double, walls and low walls stop a walker) and nobody walks through an
// enemy. An estimate for the room to read, not the engine's ruling.
export function moveRange(map: CouchFightMap, from: XY, speedFeet: number, blocked: readonly XY[] = []): Set<string> {
  const budget = Math.floor(speedFeet / TILE_FEET);
  const stops = new Set(blocked.map((tile) => `${tile.x},${tile.y}`));
  const best = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue: Array<XY & { cost: number }> = [{ ...from, cost: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const here = queue.shift()!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const x = here.x + dx;
        const y = here.y + dy;
        if (x < map.x || y < map.y || x >= map.x + map.width || y >= map.y + map.height) continue;
        const key = `${x},${y}`;
        if (stops.has(key)) continue;
        const ground = map.terrain[(y - map.y) * map.width + (x - map.x)] ?? " ";
        if (BLOCKS.has(ground)) continue;
        const cost = here.cost + (SLOW.has(ground) ? 2 : 1);
        if (cost > budget || (best.get(key) ?? Infinity) <= cost) continue;
        best.set(key, cost);
        queue.push({ x, y, cost });
      }
    }
  }
  best.delete(`${from.x},${from.y}`);
  return new Set(best.keys());
}

// How far each figure on a phone's own board stands from the player's
// character, keyed by the figure's refId (a creature's or a sheet's id), so
// the phone's fight strip can say which creature a sword reaches and which
// needs a gun. Only what that phone's board shows: a creature out of their
// sight has no square on it, and no distance.
export function distancesFromMe(
  tokens: ReadonlyArray<{ kind: string; refId: string; x: number; y: number }>,
  myIds: ReadonlySet<string>,
): Map<string, number> {
  const me = tokens.find((token) => token.kind === "pc" && myIds.has(token.refId));
  const out = new Map<string, number>();
  if (!me) return out;
  for (const token of tokens) {
    if (token !== me) out.set(token.refId, feetBetween(me, token));
  }
  return out;
}

export function distanceWords(feet: number): string {
  return feet <= TILE_FEET ? "Next to you" : `${feet} ft`;
}

// ---- what happened, as the room sees it ----

export type FightStep = { id: string; from: XY; to: XY; feet: number; ran: boolean; at: number };

// The figures that moved since the board was last drawn, and whether it was
// a run: further than the walker's own speed (a Dash, a flight). A creature's
// speed is the GM's, so it walks.
export function fightSteps(
  before: ReadonlyMap<string, XY>,
  tokens: readonly FightMapToken[],
  speedOf: (token: FightMapToken) => number | null = () => null,
): FightStep[] {
  return tokens.flatMap((token) => {
    const was = before.get(token.id);
    if (!was || (was.x === token.x && was.y === token.y)) return [];
    const feet = feetBetween(was, token);
    const speed = speedOf(token);
    return [{ id: token.id, from: was, to: { x: token.x, y: token.y }, feet, ran: speed !== null && feet > speed, at: token.movedAt ?? 0 }];
  });
}

export function stepWords(step: Pick<FightStep, "feet" | "ran">): string {
  return `${step.ran ? "Runs" : "Moves"} ${step.feet} ft`;
}

// ---- one thing at a time ----
//
// What happens on the grid plays as beats, one after another: a walk, a
// swing and where it lands, a check thrown. Ten things landing at once read
// as noise from the couch. A beat waits its turn in the order it happened
// on the server: a walk reaches the TV by a second request and can arrive
// after the swing it came before, so it is put back in front of it.

export type FightBeat<T> = { key: string; at: number; ms: number; items: T[] };

// How long each kind of beat holds the grid before the next starts: the
// figure's own move and the hit it lands, not the words that linger.
export const BEAT_MS = { attack: 1500, step: 1100, act: 1600, other: 1200 } as const;

// The beats still waiting, with new ones put in by when they happened
// (ties keep the order they came in).
export function queueBeats<T>(waiting: readonly FightBeat<T>[], arrivals: readonly FightBeat<T>[]): FightBeat<T>[] {
  return [...waiting, ...arrivals]
    .map((beat, index) => ({ beat, index }))
    .sort((a, b) => a.beat.at - b.beat.at || a.index - b.index)
    .map(({ beat }) => beat);
}

// Where each figure is drawn while walks wait their turn: a figure stands
// where its first waiting walk sets out from, so it does not reach a square
// before the room has seen it go there.
export function heldSquares(waiting: readonly FightBeat<{ tokenId?: string; walk?: XY }>[]): Map<string, XY> {
  const held = new Map<string, XY>();
  for (const beat of waiting) {
    for (const item of beat.items) {
      if (item.tokenId && item.walk && !held.has(item.tokenId)) held.set(item.tokenId, item.walk);
    }
  }
  return held;
}

// A check thrown in a fight, read as the thing being done: talking someone
// down, sneaking, leaping. `look` names the animation the TV plays on the
// figure; `words` is what it says over them.
export type FightActLook = "talk" | "sneak" | "leap" | "search" | "brace" | "other";

const ACTS: Array<[RegExp, FightActLook, string]> = [
  [/persua/i, "talk", "Persuades"],
  [/decept|bluff|lie/i, "talk", "Bluffs"],
  [/intimid/i, "talk", "Threatens"],
  [/perform/i, "talk", "Performs"],
  [/insight/i, "search", "Reads them"],
  [/stealth|hide/i, "sneak", "Sneaks"],
  [/sleight/i, "sneak", "Palms it"],
  [/athlet/i, "leap", "Strains"],
  [/acrobat/i, "leap", "Tumbles"],
  [/percept/i, "search", "Looks"],
  [/investig/i, "search", "Searches"],
  [/medic/i, "brace", "Patches up"],
  [/surviv|nature|arcana|history|religion|animal|tech|mechan/i, "search", "Works it out"],
];

export function fightAct(roll: { kind: string; detail: string }): { look: FightActLook; words: string } | null {
  if (roll.kind === "saving_throw") return { look: "brace", words: "Resists" };
  if (roll.kind !== "skill_check" && roll.kind !== "ability_check") return null;
  for (const [pattern, look, words] of ACTS) {
    if (pattern.test(roll.detail)) return { look, words };
  }
  const label = roll.detail.replace(/\s*\(.*\)\s*$/, "").trim();
  return { look: "other", words: label ? label[0].toUpperCase() + label.slice(1) : "Tries" };
}
