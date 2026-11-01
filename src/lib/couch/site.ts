import { z } from "zod";
import type { Campaign } from "@/lib/db/campaigns";
import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import type { ToolResult } from "@/lib/dm/tool-errors";
import { publishPersisted } from "@/lib/events";
import { listCastNpcs } from "@/lib/db/npcs";
import { variantUrl } from "@/lib/image-format";
import { paintedFoes } from "./fight-art";
import { fightArtKey } from "./fight-logic";
import { itemArtKey, paintedItemIcon } from "./item-art-logic";
import { writtenScenario } from "./scenarios";
import { siteById } from "./sites";
import { getCouchForge, listItemArt } from "./store";
import { couchCrew, couchGroups } from "./whereabouts";
import {
  blockedZones,
  borderStates,
  breachSpot,
  floodVacuum,
  goneZones,
  liveMap,
  markable,
  sectionOf,
  sectionState,
  setCondition,
  spreadHazards,
  ZONE_CONDITIONS,
  rememberSightings,
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
  type SiteMark,
  type SiteState,
  type SiteView,
  type ZoneCondition,
} from "./site-map-logic";

// The overhead night's live map (docs/couch-overhead-spec.md): which site a
// night is played on, its state in couch_site_states (one row per night,
// made on first use like the forge's tables, src/lib/couch/store.ts), the
// fogged view every screen gets as couch_site, the GM's SITE MAP, the
// checks on move_party, and the map tools, among them those that change
// the map under the crew (set_zone, set_section, a wall blown open). Crew positions are not
// kept here: they are the whereabouts (src/lib/couch/whereabouts.ts), whose
// place names are the site's zone names.

type Stored = Omit<SiteState, "act" | "crew" | "scene">;
const EMPTY: Stored = { visited: [], seen: [], borders: {}, moved: {}, found: [], pings: [], stances: {}, known: {}, marks: [] };

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
  return map ? withFaces(campaign.id, siteView(map, liveState(campaign, map), "players")) : null;
}

// A token wears a picture the night already has, so the room knows who and
// what it is at a glance: a person's portrait, a foe's picture from a fight,
// an item's icon or the picture painted for it on someone's sheet. Nothing
// is painted for the map; a token with no picture shows its kind's icon
// (CouchSiteMap).
function withFaces(campaignId: string, view: SiteView): SiteView {
  const others = view.tokens.filter((token) => token.kind !== "crew" && !token.portraitUrl);
  if (!others.length) return view;
  const people = new Map<string, string>();
  for (const npc of listCastNpcs(campaignId)) {
    if (npc.portraitUrl) for (const name of [npc.name, ...npc.aliases]) people.set(fightArtKey(name), npc.portraitUrl);
  }
  const foes = paintedFoes(campaignId);
  const items = new Map(listItemArt(campaignId).flatMap((row) => (row.url ? [[row.key, row.url] as const] : [])));
  const faceOf = (kind: string, name: string): string | null => {
    if (kind === "npc") return people.get(fightArtKey(name)) ?? foes.get(fightArtKey(name)) ?? null;
    if (kind === "foe" || kind === "threat") return foes.get(fightArtKey(name)) ?? null;
    if (kind === "item" || kind === "clue") return paintedItemIcon(name) ?? items.get(itemArtKey(name)) ?? null;
    return null;
  };
  return {
    ...view,
    tokens: view.tokens.map((token) => {
      if (token.kind === "crew" || token.portraitUrl) return token;
      const face = faceOf(token.kind, token.name);
      return face ? { ...token, portraitUrl: variantUrl(face, 256) } : token;
    }),
  };
}

// Whatever the crew can see now joins what they have seen (the map never
// goes black again), and whoever and whatever is in sight is known there,
// then every screen gets the new view.
export function publishCouchSite(campaign: Campaign): void {
  const map = couchSiteMap(campaign);
  if (!map) return;
  const state = liveState(campaign, map);
  const seen = new Set([...state.seen, ...visibleNow(liveMap(map, state), state)]);
  const visited = new Set([...state.visited, ...state.crew.map((member) => member.zone)]);
  const known = rememberSightings(map, state);
  if (seen.size !== state.seen.length || visited.size !== state.visited.length || JSON.stringify(known) !== JSON.stringify(state.known ?? {})) {
    save(campaign.id, { ...stored(campaign.id), seen: [...seen], visited: [...visited], known });
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
  const live = liveMap(map, state);
  const states = borderStates(live, state);
  const blocked = blockedZones(live, state);
  const path = new Set<string>();
  for (const start of from) {
    const walk = stealthPath(live, states, start, zone.id, 2, false, blocked);
    if ("error" in walk) return { refused: { error: walk.error, refused: "rules" } };
    for (const step of walk.path) path.add(step);
  }
  return { zone: zone.id, path: [...path] };
}

// The move is a stealth turn for the map too: the fire spreads and its
// smoke with it, and the last turn's alarms are over. What the GM must
// know of it (who walks into a hazard, what spread), or "".
export function recordSiteMove(campaign: Campaign, path: readonly string[]): string {
  const map = couchSiteMap(campaign);
  const now = stored(campaign.id);
  if (!map) return "";
  const spread = spreadHazards(map, now);
  const name = (id: string) => map.zones.find((zone) => zone.id === id)?.name ?? id;
  const into = path.flatMap((id) => {
    const hazards = (now.conditions?.[id] ?? []).filter((c) => c === "fire" || c === "smoke" || c === "vacuum");
    return hazards.length ? [`${name(id)} (${hazards.join(", ")})`] : [];
  });
  save(campaign.id, {
    ...now,
    visited: [...new Set([...now.visited, ...path])],
    pings: [],
    conditions: spread.conditions,
    alerts: [...spread.burning, ...spread.smoke],
  });
  return [
    into.length ? `They go through ${into.join("; ")}: play it (fire burns, smoke chokes and blinds, vacuum suffocates anyone without a sealed suit).` : "",
    spread.burning.length ? `The fire spread to ${spread.burning.map(name).join(", ")}.` : "",
    spread.smoke.length ? `Smoke pours into ${spread.smoke.map(name).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ----- The map tools ---------------------------------------------------

export const SITE_TOOL_NAMES = ["set_border", "move_foe", "reveal", "take_item", "track", "mark_on_map", "set_zone", "set_section"] as const;

type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export const siteTools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "set_border",
      description:
        "Open, close, lock, seal (weld) or break a door, hatch, vent or airlock between two zones (SITE MAP), when the crew or something else does it. Every screen shows it; an opened door lets the crew see through. \"broken\" between two zones that share a wall but have no way through blows a hole in the wall (an explosion, a creature through the bulkhead). to \"all\" sets every door, hatch and airlock of the zone at once (a lockdown).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "One zone's name." },
          to: { type: "string", description: "The zone on the other side, or \"all\" for every door of from." },
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
      description: "Your narration shows the crew a person, foe, item, clue or body from ON THE MAP (one not on screens yet; a hidden one once they find it): it appears on every screen.",
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
  {
    type: "function",
    function: {
      name: "mark_on_map",
      description:
        "Mark on every screen's map what the crew now knows of without seeing it: a person, item, clue or body from ON THE MAP by name (marked where it really is), or a landmark or thing the site does not place (\"Clamp release\", \"Barricade\") by a short name and its zone. What the crew sees is marked already; foes and the threat are never marked. where \"gone\" takes your own mark off.",
      parameters: {
        type: "object",
        properties: {
          what: { type: "string", description: "An [id] or name from ON THE MAP, or a landmark's short name (2 to 4 words)." },
          where: { type: "string", description: "A landmark's zone name (default: the scene's zone), or \"gone\" to remove your mark. Ignored for ON THE MAP entries." },
        },
        required: ["what"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_zone",
      description:
        "Something happens to a zone, on every screen with an alarm: fire (spreads each stealth turn into zones open to it), smoke (blinds), vacuum (a hull breach: every zone open to it vents now; shut doors hold), wrecked (collapsed or blown apart: nobody can go in), dark (the power fails) or lit (a flare, a lamp). state off when it is put out, cleared, repaired or the power comes back; condition \"all\" with off clears the zone.",
      parameters: {
        type: "object",
        properties: {
          zone: { type: "string", description: "The zone's name (SITE MAP)." },
          condition: { type: "string", enum: [...ZONE_CONDITIONS, "all"] },
          state: { type: "string", enum: ["on", "off"], description: "Default on." },
        },
        required: ["zone", "condition"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_section",
      description:
        "A ship, vehicle or module of the site (SECTIONS) docks, undocks or leaves: docked joins it to the site, adrift shows it drifting away with nothing crossing to it (a cut umbilical, released clamps; the crew aboard drift with it), absent takes it off the map (it flew off, or has not arrived yet).",
      parameters: {
        type: "object",
        properties: {
          section: { type: "string", description: "Its [id] or name from SECTIONS." },
          state: { type: "string", enum: ["docked", "adrift", "absent"] },
        },
        required: ["section", "state"],
        additionalProperties: false,
      },
    },
  },
];

// The tools a site offers: set_section only where it has sections.
export function siteToolsFor(map: SiteMap | null): ToolDef[] {
  if (!map) return [];
  return map.sections?.length ? siteTools : siteTools.filter((tool) => tool.function.name !== "set_section");
}

const zoneSchema = z.object({ zone: z.string().trim().min(1), condition: z.enum(["fire", "smoke", "vacuum", "wrecked", "dark", "lit", "all"]), state: z.enum(["on", "off"]).optional() });
const sectionSchema = z.object({ section: z.string().trim().min(1), state: z.enum(["docked", "adrift", "absent"]) });
const borderSchema = z.object({ from: z.string().trim().min(1), to: z.string().trim().min(1), state: z.enum(["open", "closed", "locked", "sealed", "broken"]) });
const moveFoeSchema = z.object({ who: z.string().trim().min(1), to: z.string().trim().min(1), stance: z.enum(["active", "passive"]).optional() });
const whatSchema = z.object({ what: z.string().trim().min(1) });
const markSchema = z.object({ what: z.string().trim().min(1).max(60), where: z.string().trim().min(1).optional() });
const MARK_NAME_MAX = 32;
const MARKS_MAX = 16;

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
  // Every change lets the air out where a door now stands open to vacuum,
  // and what changes sounds the TV's alarm.
  const done = (next: Stored, result: ToolResult, alerts: readonly string[] = []): ToolResult => {
    const flood = floodVacuum(map, next);
    save(campaign.id, { ...next, conditions: flood.conditions, alerts: [...new Set([...(next.alerts ?? []), ...alerts, ...flood.vented])] });
    publishCouchSite(campaign);
    if (!flood.vented.length || !("ok" in result)) return result;
    const caught = liveState(campaign, map).crew.filter((member) => flood.vented.includes(member.zone)).map((member) => member.name);
    const note = [
      "note" in result && result.note ? String(result.note) : "",
      `${flood.vented.map(zoneName).join(", ")} ${flood.vented.length > 1 ? "vent" : "vents"} to vacuum: anyone there without a sealed suit is suffocating, and loose things are sucked toward the breach.`,
      caught.length ? `${caught.join(", ")} ${caught.length > 1 ? "are" : "is"} in it: play it.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { ...result, note };
  };
  const live = liveMap(map, now);
  const gone = goneZones(map, now);
  if (name === "set_border") {
    const args = parse(borderSchema, rawArguments);
    if (!args) return { error: "Invalid arguments: set_border needs from, to (zone names) and a state.", retry: true };
    const a = zoneByName(map, args.from);
    if (!a) return { error: `"${args.from}" is not a zone of the site.`, retry: true };
    const states = borderStates(live, now);
    if (args.to.trim().toLowerCase() === "all") {
      const doors = live.borders.flatMap((border, index) => ((border.a === a.id || border.b === a.id) && border.kind !== "open" && border.kind !== "vent" && states.get(border) !== "severed" ? [index] : []));
      if (!doors.length) return { error: `${a.name} has no door to set.`, refused: "rules" };
      const borders = { ...now.borders, ...Object.fromEntries(doors.map((index) => [index, args.state as BorderState])) };
      return done({ ...now, borders }, { ok: true, note: `Every door of ${a.name} is ${args.state}: ${doors.map((index) => zoneName(live.borders[index].a === a.id ? live.borders[index].b : live.borders[index].a)).join(", ")}.` }, [a.id]);
    }
    const b = zoneByName(map, args.to);
    if (!b) return { error: `"${args.to}" is not a zone of the site.`, retry: true };
    if (gone.has(a.id) || gone.has(b.id)) return { error: `${gone.has(a.id) ? a.name : b.name} is not on the map now (SECTIONS).`, refused: "rules" };
    const index = live.borders.findIndex((border) => (border.a === a.id && border.b === b.id) || (border.a === b.id && border.b === a.id));
    if (index < 0) {
      // No way through: "broken" blows one in the wall they share.
      if (args.state !== "broken") return { error: `There is no door between "${args.from}" and "${args.to}" (SITE MAP lists each zone's ways out). To blow a hole through the wall they share, set it broken.`, retry: true };
      if (sectionOf(map, a.id) !== sectionOf(map, b.id)) return { error: `${a.name} and ${b.name} are on different sections: there is no wall to break between them.`, refused: "rules" };
      if (!breachSpot(map, a.id, b.id)) return { error: `${a.name} and ${b.name} share no wall: there is nothing to break through.`, refused: "rules" };
      return done({ ...now, breaches: [...(now.breaches ?? []), { a: a.id, b: b.id }] }, { ok: true, note: `A hole is blown through the wall between ${a.name} and ${b.name}: a way through now, and the rooms see each other.` }, [a.id, b.id]);
    }
    const border = live.borders[index];
    if (border.kind === "open") return { error: `${a.name} and ${b.name} are open to each other: there is no door to set.`, refused: "rules" };
    if (states.get(border) === "severed") return { error: `The ${border.kind} between ${a.name} and ${b.name} joins nothing now: the other side is adrift (SECTIONS).`, refused: "rules" };
    return done({ ...now, borders: { ...now.borders, [index]: args.state as BorderState } }, { ok: true, note: `The ${border.kind} between ${a.name} and ${b.name} is ${args.state}.` });
  }
  if (name === "set_zone") {
    const args = parse(zoneSchema, rawArguments);
    if (!args) return { error: `Invalid arguments: set_zone needs zone and condition (${ZONE_CONDITIONS.join(", ")}).`, retry: true };
    const zone = zoneByName(map, args.zone);
    if (!zone) return { error: `"${args.zone}" is not a zone of the site.`, retry: true };
    if (gone.has(zone.id)) return { error: `${zone.name} is not on the map now (SECTIONS).`, refused: "rules" };
    const on = args.state !== "off";
    if (args.condition === "all" && on) return { error: "condition \"all\" only clears a zone: use state off.", retry: true };
    if (on && args.condition === "fire" && (now.conditions?.[zone.id] ?? []).includes("vacuum")) return { error: `${zone.name} is in vacuum: nothing burns there.`, refused: "rules" };
    const conditions = setCondition(now, zone.id, args.condition, on);
    const here = liveState(campaign, map).crew.filter((member) => member.zone === zone.id).map((member) => member.name);
    const what: Record<ZoneCondition | "all", string> = {
      fire: "is on fire. It spreads into every zone open to it each stealth turn; a shut door holds it",
      smoke: "fills with smoke: nobody sees into it, and inside they see nothing beyond it",
      vacuum: "is open to space. Every zone open to it vents now; shut doors hold the air",
      wrecked: "is wrecked: nobody can go in until it is cleared",
      dark: "goes dark",
      lit: "is lit",
      all: "is clear",
    };
    const note = on ? `${zone.name} ${what[args.condition]}.` : args.condition === "all" ? `${zone.name} is clear.` : `${zone.name} is no longer ${args.condition === "wrecked" ? "wrecked" : args.condition === "vacuum" ? "in vacuum" : args.condition === "lit" ? "lit" : args.condition === "dark" ? "dark" : `full of ${args.condition}`}.`;
    const danger = on && here.length && args.condition !== "lit" ? ` ${here.join(", ")} ${here.length > 1 ? "are" : "is"} in it: play it.` : "";
    return done({ ...now, conditions }, { ok: true, note: note + danger }, on && args.condition !== "lit" ? [zone.id] : []);
  }
  if (name === "set_section") {
    const args = parse(sectionSchema, rawArguments);
    if (!args) return { error: "Invalid arguments: set_section needs section and state.", retry: true };
    const wanted = args.section.trim().toLowerCase();
    const section = map.sections?.find((entry) => entry.id === wanted || entry.name.toLowerCase() === wanted);
    if (!section) {
      return map.sections?.length
        ? { error: `"${args.section}" is not a section (SECTIONS: ${map.sections.map((entry) => entry.name).join(", ")}).`, retry: true }
        : { error: "This site has no sections: nothing on it docks or leaves.", refused: "rules" };
    }
    const was = sectionState(section, now);
    if (was === args.state) return { ok: true, note: `${section.name} is already ${was}.` };
    const aboard = liveState(campaign, map).crew.filter((member) => section.zones.includes(member.zone)).map((member) => member.name);
    if (args.state === "absent" && aboard.length) return { error: `${aboard.join(", ")} ${aboard.length > 1 ? "are" : "is"} aboard ${section.name}: it cannot leave the map with them. Set it adrift, or move them off first.`, refused: "rules" };
    const next: Stored = { ...now, sections: { ...now.sections, [section.id]: args.state } };
    const note =
      args.state === "docked"
        ? `${section.name} is docked: its ways through open as they were left.`
        : args.state === "adrift"
          ? `${section.name} is adrift: nothing crosses to it now.${aboard.length ? ` ${aboard.join(", ")} ${aboard.length > 1 ? "are" : "is"} aboard it.` : ""}`
          : `${section.name} is off the map.`;
    return done(next, { ok: true, note }, [`section:${section.id}`, ...section.zones]);
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
      const walk = stealthPath(live, borderStates(live, now), at, zone.id, reach, true, blockedZones(live, now));
      if ("error" in walk) return { error: walk.error.replace("move them", "move it"), refused: "rules" };
    }
    const state = liveState(campaign, map);
    const meets = state.crew.filter((member) => member.zone === zone.id).map((member) => member.name);
    // Walked into the crew's sight, it is seen: on every screen from now on.
    const inSight = visibleNow(live, { ...state, ...now }).has(zone.id);
    const found = inSight && !entity.hidden ? [...new Set([...now.found, entity.id])] : now.found;
    const next: Stored = { ...now, moved: { ...now.moved, [entity.id]: zone.id }, found, ...(args.stance ? { stances: { ...now.stances, [entity.id]: args.stance } } : {}) };
    return done(next, {
      ok: true,
      note: [
        `${entity.name} is in ${zone.name}.`,
        meets.length ? `${meets.join(", ")} ${meets.length > 1 ? "are" : "is"} there: play the detection (rulebook), and start_encounter if it comes to a fight.` : "",
        inSight ? (entity.hidden && !now.found.includes(entity.id) ? "The crew can see that zone, but it stays hidden: reveal it once they spot it." : "The crew can see that zone: it shows on the TV.") : "Out of the crew's sight: describe only what they could hear.",
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
  if (name === "mark_on_map") {
    const args = parse(markSchema, rawArguments);
    if (!args) return { error: "Invalid arguments: mark_on_map needs what (and where for a landmark).", retry: true };
    const entity = entityOf(map, args.what);
    if (entity) {
      if (!markable(entity)) return { error: `${entity.name} is a hostile: it shows only while the crew can see it. Describe what they heard instead.`, refused: "rules" };
      if ((entity.act ?? 1) > liveState(campaign, map).act) return { error: `${entity.name} is not in the story yet (it enters in act ${entity.act}).`, refused: "rules" };
      const at = now.moved[entity.id] ?? entity.zone;
      if (!at) return { error: `${entity.name} is off the map: there is nowhere to mark.`, refused: "rules" };
      return done(
        { ...now, known: { ...now.known, [entity.id]: at }, found: [...new Set([...now.found, entity.id])] },
        { ok: true, note: `${entity.name} is marked in ${zoneName(at)} on every screen.` },
      );
    }
    const label = args.what.replace(/\s+/g, " ").slice(0, MARK_NAME_MAX);
    const marks = now.marks ?? [];
    const same = marks.find((mark) => mark.name.toLowerCase() === label.toLowerCase());
    if (args.where?.toLowerCase() === "gone") {
      if (!same) return { error: `There is no mark called "${args.what}" (MARKED by you).`, retry: true };
      return done({ ...now, marks: marks.filter((mark) => mark !== same) }, { ok: true, note: `${same.name} is off the map.` });
    }
    const zone = args.where ? zoneByName(map, args.where) : map.zones.find((z) => z.id === liveState(campaign, map).scene);
    if (!zone || gone.has(zone.id)) return { error: `"${args.where}" is not a zone on the map now.`, retry: true };
    if (!same && marks.length >= MARKS_MAX) return { error: `The map holds ${MARKS_MAX} marks of yours: take one off (where "gone") first.`, refused: "rules" };
    const mark: SiteMark = { id: same?.id ?? `mark-${marks.reduce((top, m) => Math.max(top, Number(m.id.slice(5)) || 0), 0) + 1}`, name: label, zone: zone.id };
    return done(
      { ...now, marks: same ? marks.map((m) => (m === same ? mark : m)) : [...marks, mark] },
      { ok: true, note: `${label} is marked in ${zone.name} on every screen.` },
    );
  }
  if (name === "track") {
    const state = liveState(campaign, map);
    const pings = trackerPings(live, state, state.scene);
    const near = pings.map((zone) => `${zoneName(zone)} (${zoneDistance(map, state.scene, zone, { vents: true })} away)`);
    return done({ ...now, pings }, { ok: true, pings: near.length ? near.join(", ") : "nothing moving within four zones", note: "The pings show on the TV with their sound until the crew moves." });
  }
  return { error: `Unknown map tool ${name}.`, retry: true };
}

export function siteZone(campaign: Campaign, id: string) {
  return couchSiteMap(campaign)?.zones.find((zone) => zone.id === id) ?? null;
}
