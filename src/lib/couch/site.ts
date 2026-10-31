import { z } from "zod";
import type { Campaign } from "@/lib/db/campaigns";
import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import type { ToolResult } from "@/lib/dm/tool-errors";
import { publishPersisted } from "@/lib/events";
import { writtenScenario } from "./scenarios";
import { siteById } from "./sites";
import { getCouchForge } from "./store";
import { couchCrew, couchGroups } from "./whereabouts";
import {
  borderStates,
  siteView,
  sitePrompt,
  stealthPath,
  trackerPings,
  visibleNow,
  zoneByName,
  zoneDistance,
  type BorderState,
  type Entity,
  type SiteMap,
  type SiteState,
  type SiteView,
} from "./site-map-logic";

// The overhead night's live map (docs/couch-overhead-spec.md): which site a
// night is played on, its state in couch_site_states (one row per night,
// made on first use like the forge's tables, src/lib/couch/store.ts), the
// fogged view every screen gets as couch_site, the GM's SITE MAP, the
// checks on move_party, and the five map tools. Crew positions are not
// kept here: they are the whereabouts (src/lib/couch/whereabouts.ts), whose
// place names are the site's zone names.

type Stored = Omit<SiteState, "act" | "crew" | "scene">;
const EMPTY: Stored = { visited: [], seen: [], borders: {}, moved: {}, found: [], pings: [], stances: {} };

const ensured = new WeakSet<object>();
function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_site_states (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    ensured.add(database);
  }
  return database;
}

function stored(campaignId: string): Stored {
  const row = db().prepare(`SELECT state_json FROM couch_site_states WHERE campaign_id = ?`).get(campaignId) as { state_json: string } | undefined;
  return { ...EMPTY, ...(row ? parseJson<Partial<Stored>>(row.state_json, {}) : {}) };
}

function save(campaignId: string, next: Stored): void {
  db()
    .prepare(
      `INSERT INTO couch_site_states (campaign_id, state_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (campaign_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    )
    .run(campaignId, JSON.stringify(next), nowIso());
}

// The site a night is played on: the written scenario's, or none.
export function couchSiteMap(campaign: Campaign): SiteMap | null {
  if (!campaign.gameSettings.couchMode) return null;
  const forge = getCouchForge(campaign.id);
  return forge?.scenarioId ? siteById(writtenScenario(forge.scenarioId)?.site) : null;
}

function startZone(map: SiteMap): string {
  return map.entities.find((entity) => entity.kind === "crew-start")?.zone ?? map.zones[0].id;
}

// The whole state: the stored part, the act, and where the crew stands now.
// Before the first move everyone stands at the crew's start.
function liveState(campaign: Campaign, map: SiteMap): SiteState {
  const base = stored(campaign.id);
  const act = (Math.min(2, Math.max(0, getCouchForge(campaign.id)?.act ?? 0)) + 1) as 1 | 2 | 3;
  const groups = couchGroups(campaign);
  const zoneOf = (place: string) => zoneByName(map, place)?.id ?? startZone(map);
  const crew = groups
    ? groups.flatMap((group) => group.members.map((member) => ({ id: member.id, name: member.name, zone: zoneOf(group.placeName), portraitUrl: member.portraitUrl })))
    : couchCrew(campaign).map((member) => ({ id: member.id, name: member.name, zone: startZone(map), portraitUrl: member.portraitUrl }));
  const sceneGroup = groups?.find((group) => group.inScene);
  return { ...base, act, crew, scene: sceneGroup ? zoneOf(sceneGroup.placeName) : startZone(map) };
}

// What every screen gets: the players' view. The snapshot and the
// couch_site event carry the same.
export function couchSite(campaign: Campaign): SiteView | null {
  const map = couchSiteMap(campaign);
  return map ? siteView(map, liveState(campaign, map), "players") : null;
}

// Whatever the crew can see now joins what they have seen (the map never
// goes black again), then every screen gets the new view.
export function publishCouchSite(campaign: Campaign): void {
  const map = couchSiteMap(campaign);
  if (!map) return;
  const state = liveState(campaign, map);
  const seen = new Set([...state.seen, ...visibleNow(map, state)]);
  const visited = new Set([...state.visited, ...state.crew.map((member) => member.zone)]);
  if (seen.size !== state.seen.length || visited.size !== state.visited.length) {
    save(campaign.id, { ...stored(campaign.id), seen: [...seen], visited: [...visited] });
  }
  publishPersisted(campaign.id, "couch_site", { site: couchSite(campaign) });
}

export function couchSitePrompt(campaign: Campaign): string {
  const map = couchSiteMap(campaign);
  return map ? sitePrompt(map, liveState(campaign, map)) : "";
}

// move_party on an overhead night, before anything is written: the
// destination is a zone, the first move is to the crew's start, and each
// mover walks there within one stealth turn through doors that open. The
// zones walked through count as visited; a fresh move clears the last
// tracker pings.
export function siteMoveCheck(campaign: Campaign, destination: string, movers: readonly string[] | null): { refused: ToolResult } | { zone: string; path: string[] } | null {
  const map = couchSiteMap(campaign);
  if (!map) return null;
  const zone = zoneByName(map, destination);
  if (!zone) {
    return { refused: { error: `"${destination}" is not a zone of the site. move_party takes a zone's name exactly as SITE MAP lists it.`, retry: true } };
  }
  const state = liveState(campaign, map);
  if (!couchGroups(campaign)) {
    const start = startZone(map);
    if (zone.id !== start) return { refused: { error: `The night opens with the crew in ${map.zones.find((z) => z.id === start)?.name}: move them there first.`, retry: true } };
    return { zone: zone.id, path: [zone.id] };
  }
  // Named crew move from where each stands; no names, the scene's group.
  const named = movers?.length ? state.crew.filter((member) => movers.includes(member.id)) : [];
  const from = new Set((named.length ? named : state.crew.filter((member) => member.zone === state.scene)).map((member) => member.zone));
  const states = borderStates(map, state);
  const path = new Set<string>();
  for (const start of from) {
    const walk = stealthPath(map, states, start, zone.id);
    if ("error" in walk) return { refused: { error: walk.error, refused: "rules" } };
    for (const step of walk.path) path.add(step);
  }
  return { zone: zone.id, path: [...path] };
}

export function recordSiteMove(campaign: Campaign, path: readonly string[]): void {
  const now = stored(campaign.id);
  save(campaign.id, { ...now, visited: [...new Set([...now.visited, ...path])], pings: [] });
}

// ----- The map tools ---------------------------------------------------

export const SITE_TOOL_NAMES = ["set_border", "move_foe", "reveal", "take_item", "track"] as const;

type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export const siteTools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "set_border",
      description:
        "Open, close, lock, seal (weld) or break a door, hatch, vent or airlock between two zones (SITE MAP), when the crew or something else does it. Every screen shows it; an opened door lets the crew see through.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "One zone's name." },
          to: { type: "string", description: "The zone on the other side." },
          state: { type: "string", enum: ["open", "closed", "locked", "sealed", "broken"] },
        },
        required: ["from", "to", "state"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_foe",
      description:
        "Move a foe, the threat or a person on the map in secret, after the crew moves (rulebook stealth turn): up to two zones, the threat three, vents included. \"gone\" takes them off the map (dead, fled below). The crew sees them only when in sight.",
      parameters: {
        type: "object",
        properties: {
          who: { type: "string", description: "Their [id] or name from ON THE MAP." },
          to: { type: "string", description: "A zone's name, or \"gone\"." },
          stance: { type: "string", enum: ["active", "passive"], description: "Optional: a passive foe that hears the crew turns active." },
        },
        required: ["who", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reveal",
      description: "The crew finds a hidden item, body, clue or foe (ON THE MAP, hidden): it appears on every screen.",
      parameters: { type: "object", properties: { what: { type: "string", description: "Its [id] or name." } }, required: ["what"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "take_item",
      description: "A crew member picks up an item or clue on the map: it leaves the map. Give it to their sheet with handle_item if it matters later.",
      parameters: { type: "object", properties: { what: { type: "string", description: "Its [id] or name." } }, required: ["what"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "track",
      description:
        "Someone checks a motion tracker, after its power-supply roll: every moving foe, person or the threat within four zones of the scene pings on the TV this turn, even through walls and in rooms nobody has seen. Still (passive) things do not ping. Answer with what the pings mean to them, never where the foe is beyond the ping.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

const borderSchema = z.object({ from: z.string().trim().min(1), to: z.string().trim().min(1), state: z.enum(["open", "closed", "locked", "sealed", "broken"]) });
const moveFoeSchema = z.object({ who: z.string().trim().min(1), to: z.string().trim().min(1), stance: z.enum(["active", "passive"]).optional() });
const whatSchema = z.object({ what: z.string().trim().min(1) });

function parse<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    return schema.parse(JSON.parse(raw || "{}"));
  } catch {
    return null;
  }
}

function entityOf(map: SiteMap, ref: string): Entity | undefined {
  const wanted = ref.trim().toLowerCase();
  return map.entities.find((entity) => entity.kind !== "crew-start" && (entity.id === wanted || entity.name.toLowerCase() === wanted));
}

function noSite(name: string): ToolResult {
  return { error: `${name} belongs to a night played on a map; this one has none.`, refused: "rules" };
}

export function handleSiteTool(campaign: Campaign, name: string, rawArguments: string): ToolResult {
  const map = couchSiteMap(campaign);
  if (!map) return noSite(name);
  const now = stored(campaign.id);
  const zoneName = (id: string) => map.zones.find((zone) => zone.id === id)?.name ?? id;
  const done = (next: Stored, result: ToolResult): ToolResult => {
    save(campaign.id, next);
    publishCouchSite(campaign);
    return result;
  };
  if (name === "set_border") {
    const args = parse(borderSchema, rawArguments);
    if (!args) return { error: "Invalid arguments: set_border needs from, to (zone names) and a state.", retry: true };
    const a = zoneByName(map, args.from);
    const b = zoneByName(map, args.to);
    const index = a && b ? map.borders.findIndex((border) => (border.a === a.id && border.b === b.id) || (border.a === b.id && border.b === a.id)) : -1;
    if (!a || !b || index < 0) return { error: `There is no door between "${args.from}" and "${args.to}" (SITE MAP lists each zone's ways out).`, retry: true };
    if (map.borders[index].kind === "open") return { error: `${a.name} and ${b.name} are open to each other: there is no door to set.`, refused: "rules" };
    return done({ ...now, borders: { ...now.borders, [index]: args.state as BorderState } }, { ok: true, note: `The ${map.borders[index].kind} between ${a.name} and ${b.name} is ${args.state}.` });
  }
  if (name === "move_foe") {
    const args = parse(moveFoeSchema, rawArguments);
    if (!args) return { error: "Invalid arguments: move_foe needs who and to.", retry: true };
    const entity = entityOf(map, args.who);
    if (!entity || entity.kind === "item" || entity.kind === "clue" || entity.kind === "body") return { error: `"${args.who}" is not a foe or person on the map (ON THE MAP).`, retry: true };
    const at = now.moved[entity.id] ?? entity.zone;
    if (args.to.trim().toLowerCase() === "gone") {
      return done({ ...now, moved: { ...now.moved, [entity.id]: "" } }, { ok: true, note: `${entity.name} is off the map.` });
    }
    const zone = zoneByName(map, args.to);
    if (!zone) return { error: `"${args.to}" is not a zone of the site.`, retry: true };
    const reach = entity.kind === "threat" ? 3 : 2;
    if (at) {
      const walk = stealthPath(map, borderStates(map, now), at, zone.id, reach, true);
      if ("error" in walk) return { error: walk.error.replace("move them", "move it"), refused: "rules" };
    }
    const state = liveState(campaign, map);
    const meets = state.crew.filter((member) => member.zone === zone.id).map((member) => member.name);
    const next: Stored = { ...now, moved: { ...now.moved, [entity.id]: zone.id }, ...(args.stance ? { stances: { ...now.stances, [entity.id]: args.stance } } : {}) };
    return done(next, {
      ok: true,
      note: [
        `${entity.name} is in ${zone.name}.`,
        meets.length ? `${meets.join(", ")} ${meets.length > 1 ? "are" : "is"} there: play the detection (rulebook), and start_encounter if it comes to a fight.` : "",
        visibleNow(map, state).has(zone.id) ? "The crew can see that zone: it shows on the TV." : "Out of the crew's sight: describe only what they could hear.",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  if (name === "reveal" || name === "take_item") {
    const args = parse(whatSchema, rawArguments);
    if (!args) return { error: `Invalid arguments: ${name} needs what.`, retry: true };
    const entity = entityOf(map, args.what);
    if (!entity) return { error: `"${args.what}" is not on the map (ON THE MAP).`, retry: true };
    if (name === "reveal") return done({ ...now, found: [...new Set([...now.found, entity.id])] }, { ok: true, note: `${entity.name} is on every screen now.` });
    if (entity.kind !== "item" && entity.kind !== "clue") return { error: `${entity.name} is not something to pick up.`, retry: true };
    const at = now.moved[entity.id] ?? entity.zone;
    return done({ ...now, moved: { ...now.moved, [entity.id]: "" }, found: [...new Set([...now.found, entity.id])] }, { ok: true, note: `${entity.name} is taken from ${zoneName(at)}.` });
  }
  if (name === "track") {
    const state = liveState(campaign, map);
    const pings = trackerPings(map, state, state.scene);
    const near = pings.map((zone) => `${zoneName(zone)} (${zoneDistance(map, state.scene, zone, { vents: true })} away)`);
    return done({ ...now, pings }, { ok: true, pings: near.length ? near.join(", ") : "nothing moving within four zones", note: "The pings show on the TV with their sound until the crew moves." });
  }
  return { error: `Unknown map tool ${name}.`, retry: true };
}

export function siteZone(campaign: Campaign, id: string) {
  return couchSiteMap(campaign)?.zones.find((zone) => zone.id === id) ?? null;
}
