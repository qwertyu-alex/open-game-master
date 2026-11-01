"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { boundsOf, cameraFrame, driftedRects, tagPlaces, type Rect, type SiteView, type ViewSection, type ViewToken } from "@/lib/couch/site-map-logic";

// The overhead night's map, drawn in HTML from the site's data
// (docs/couch-overhead-spec.md, src/lib/couch/site-map-logic.ts): every
// zone floor, wall, door, prop and token is an element placed in tile
// units, so the map scales to any screen, a zone is a real element a phone
// can tap and a screen reader can name, and nothing is a painted picture.
// The fog is already applied by the server's siteView: what is not sent is
// black. CouchSiteMap draws the plane; CouchTvSite points the TV's camera
// at it; the phone scrolls it.

type Box = { x: number; y: number; w: number; h: number };
const place = (box: Box): CSSProperties => ({ "--x": box.x, "--y": box.y, "--w": box.w, "--h": box.h }) as CSSProperties;

const TOKEN_LABEL: Record<ViewToken["kind"], string> = {
  crew: "crew",
  item: "item",
  npc: "person",
  foe: "hostile",
  threat: "threat",
  clue: "clue",
  body: "body",
  landmark: "landmark",
  "crew-start": "start",
};

// Each kind's icon, drawn in a few strokes so a token reads from the couch
// before its name does: a person's head and shoulders, a hostile's skull,
// the threat's eye, an item's crate, a clue's page, a body laid out, a
// landmark's flag. A token with a picture of its own wears that instead.
const ICON_PATHS: Partial<Record<ViewToken["kind"], string>> = {
  npc: "M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM4.5 21c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5",
  foe: "M12 3c-4.4 0-7.5 3-7.5 7.2 0 2.5 1.2 4.3 3 5.3V19h9v-3.5c1.8-1 3-2.8 3-5.3C19.5 6 16.4 3 12 3ZM9 9.5v2.5M15 9.5v2.5M10.5 19v2M13.5 19v2",
  threat: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  item: "M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8ZM3.5 8 12 12.5 20.5 8M12 12.5v8",
  clue: "M6 3h8.5L18 6.5V21H6V3ZM14.5 3v3.5H18M9 11h6M9 14.5h6M9 18h4",
  body: "M5.5 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM9.5 11H21M12 11l-1.5 5M17 11l1.5 5M3 19h18",
  landmark: "M6 21V3.5M6 4h12l-3 4 3 4H6",
};

function TokenIcon({ kind }: { kind: ViewToken["kind"] }) {
  const d = ICON_PATHS[kind];
  return d ? (
    <svg className="couch-site-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  ) : null;
}

// A section (a docked ship) is drawn in its own layer, one per layer of the
// map so it stays under the rest's tokens and names, all moved by the same
// transform: when it undocks it glides away and turns as one piece.
function driftStyle(section: ViewSection): CSSProperties {
  return {
    transform: section.state === "adrift" ? `translate(calc(${section.dx} * var(--t)), calc(${section.dy} * var(--t))) rotate(${section.turn}deg)` : "none",
    transformOrigin: `calc(${section.cx} * var(--t)) calc(${section.cy} * var(--t))`,
  };
}

function layered<T>(view: SiteView, layer: string, items: readonly T[], sectionOf: (item: T) => string | undefined, draw: (item: T, index: number) => ReactNode): ReactNode[] {
  const indexed = items.map((item, index) => ({ item, index, section: sectionOf(item) }));
  return [
    ...indexed.filter((entry) => !entry.section).map((entry) => draw(entry.item, entry.index)),
    ...view.sections.flatMap((section) => {
      const own = indexed.filter((entry) => entry.section === section.id);
      return own.length
        ? [
            <div key={`${layer}-${section.id}`} className="couch-site-drift" data-state={section.state} data-fresh={section.fresh || undefined} style={driftStyle(section)}>
              {own.map((entry) => draw(entry.item, entry.index))}
            </div>,
          ]
        : [];
    }),
  ];
}

const HAZARD_LABEL = { fire: "fire", smoke: "smoke", vacuum: "vacuum", wrecked: "wrecked", dark: "dark", lit: "lit" } as const;

function initials(name: string): string {
  const words = name.replace(/^(the|dr\.?)\s+/i, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function CouchSiteMap({
  view,
  variant,
  tile,
  youId = "",
  onZone,
  labels = true,
}: {
  view: SiteView;
  variant: "tv" | "phone" | "overview";
  // One tile, in CSS pixels.
  tile: number;
  youId?: string;
  onZone?: (zoneId: string, name: string) => void;
  labels?: boolean;
}) {
  const youZone = view.tokens.find((token) => token.id === youId)?.zone ?? "";
  const tags = labels ? tagPlaces(view) : [];
  const kindOf = new Map(view.tokens.map((token) => [token.id, token]));
  const sectionOfZone = new Map(view.zones.map((zone) => [zone.id, zone.section]));
  const inZone = (zone: string) => sectionOfZone.get(zone);
  const tokenSection = (id: string) => inZone(kindOf.get(id)?.zone ?? "");
  const rects = view.zones.flatMap((zone) => zone.rects.map((rect, i) => ({ zone, rect, i })));
  return (
    <div
      className={`couch-site couch-site-${variant}`}
      style={{ "--cols": view.cols, "--rows": view.rows, "--t": `${tile}px` } as CSSProperties}
      role={variant === "overview" ? undefined : "group"}
      aria-hidden={variant === "overview" ? true : undefined}
      aria-label={variant === "overview" ? undefined : `Overhead map: ${view.zones.length} places found.`}
    >
      {layered(view, "floor", rects, ({ zone }) => zone.section, ({ zone, rect, i }) => (
        <div
          key={`${zone.id}-${i}`}
          className="couch-site-floor"
          data-kind={zone.kind}
          data-sight={zone.sight}
          data-scene={zone.scene || undefined}
          data-dark={zone.features.includes("dark") || undefined}
          style={place(rect)}
          aria-hidden="true"
        />
      ))}
      {layered(view, "prop", view.props, (prop) => prop.section, (prop, i) => (
        <div key={`prop-${i}`} className="couch-site-prop" data-prop={prop.kind} style={place(prop)} aria-hidden="true" />
      ))}
      {layered(
        view,
        "hazard",
        rects.flatMap((entry) => (entry.zone.hazards ?? []).map((hazard) => ({ ...entry, hazard }))),
        ({ zone }) => zone.section,
        ({ zone, rect, i, hazard }) => <div key={`hazard-${zone.id}-${i}-${hazard}`} className="couch-site-hazard" data-hazard={hazard} style={place(rect)} aria-hidden="true" />,
      )}
      {layered(view, "wall", view.walls, (wall) => wall.section, (wall, i) => (
        <div key={`wall-${i}`} className="couch-site-wall" data-axis={wall.axis} style={place({ x: wall.x, y: wall.y, w: wall.axis === "h" ? wall.length : 0, h: wall.axis === "v" ? wall.length : 0 })} aria-hidden="true" />
      ))}
      {layered(view, "door", view.doors, (door) => (inZone(door.a) === inZone(door.b) ? inZone(door.a) : undefined), (door, i) => (
        <div
          key={`door-${i}`}
          className="couch-site-door"
          data-axis={door.axis}
          data-kind={door.kind}
          data-state={door.state}
          style={place(door.axis === "h" ? { x: door.x - door.span / 2, y: door.y, w: door.span, h: 0 } : { x: door.x, y: door.y - door.span / 2, w: 0, h: door.span })}
          aria-hidden="true"
        />
      ))}
      {labels
        ? layered(view, "label", view.zones, (zone) => zone.section, (zone) => {
            const rect = [...zone.rects].sort((p, q) => q.w * q.h - p.w * p.h)[0];
            if (!rect || zone.kind === "crawlway") return null;
            const hazards = zone.hazards ?? [];
            const label = (
              <>
                <span className="couch-site-name">{zone.name}</span>
                {zone.features.length || hazards.length ? (
                  <span className="couch-site-features">
                    {zone.features.join(" · ")}
                    {zone.features.length && hazards.length ? " · " : null}
                    {hazards.length ? <b>{hazards.map((hazard) => HAZARD_LABEL[hazard]).join(" · ")}</b> : null}
                  </span>
                ) : null}
              </>
            );
            const spoken = `${zone.name}${hazards.length ? `, ${hazards.join(", ")}` : ""}${zone.id === youZone ? ", you are here" : ""}`;
            return onZone ? (
              <button key={`label-${zone.id}`} type="button" className="couch-site-label" data-sight={zone.sight} style={place(rect)} onClick={() => onZone(zone.id, zone.name)} aria-label={spoken}>
                {label}
              </button>
            ) : (
              <div key={`label-${zone.id}`} className="couch-site-label" data-sight={zone.sight} style={place(rect)}>
                {label}
              </div>
            );
          })
        : null}
      {layered(view, "ping", view.pings, (ping) => inZone(ping.zone), (ping, i) => (
        <div key={`ping-${ping.zone}-${i}`} className="couch-site-ping" style={place({ x: ping.x, y: ping.y, w: 0, h: 0 })} role="img" aria-label="Motion tracker: movement" />
      ))}
      {layered(view, "alert", view.alerts, (alert) => inZone(alert.zone), (alert, i) => (
        <div key={`alert-${alert.zone}-${i}`} className="couch-site-alert" style={place({ x: alert.x, y: alert.y, w: 0, h: 0 })} role="img" aria-label="Alarm" />
      ))}
      {/* A name that had to stand off from its token: a line back to it,
          under the tokens. */}
      {layered(view, "leader", tags.filter((tag) => tag.leader), (tag) => tokenSection(tag.id), (tag) =>
        tag.leader ? (
          <svg key={`leader-${tag.id}`} className="couch-site-leaders" style={place({ x: 0, y: 0, w: view.cols, h: view.rows })} viewBox={`0 0 ${view.cols} ${view.rows}`} preserveAspectRatio="none" aria-hidden="true">
            <g data-kind={kindOf.get(tag.id)?.kind}>
              <line x1={tag.leader.x1} y1={tag.leader.y1} x2={tag.leader.x2} y2={tag.leader.y2} />
              <circle cx={tag.leader.x1} cy={tag.leader.y1} r={0.09} />
            </g>
          </svg>
        ) : null,
      )}
      {layered(view, "token", view.tokens, (token) => inZone(token.zone), (token) => (
        <div
          key={token.id}
          className="couch-site-token"
          data-kind={token.kind}
          data-stance={token.stance}
          data-you={token.id === youId || undefined}
          data-portrait={token.portraitUrl ? "" : undefined}
          data-last={token.last || undefined}
          style={place({ x: token.x, y: token.y, w: 0, h: 0 })}
          role="img"
          aria-label={`${token.name}, ${TOKEN_LABEL[token.kind]}${token.last ? ", last known here" : ""}`}
          title={token.name}
        >
          {token.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a portrait thumbnail inside a token, sized by CSS
            <img src={token.portraitUrl} alt="" draggable={false} />
          ) : token.kind === "crew" ? (
            <span className="couch-site-token-glyph">{initials(token.name)}</span>
          ) : (
            <TokenIcon kind={token.kind} />
          )}
        </div>
      ))}
      {layered(view, "tag", tags, (tag) => tokenSection(tag.id), (tag) => (
        <div key={`tag-${tag.id}`} className="couch-site-tag" data-kind={kindOf.get(tag.id)?.kind} data-last={kindOf.get(tag.id)?.last || undefined} style={place(tag)} aria-hidden="true">
          {tag.text}
        </div>
      ))}
    </div>
  );
}

// The plane is laid out at this tile and moved by one transform, so the
// camera glides when the crew finds a room or the scene cuts.
const PLANE_TILE = 32;
const OVERVIEW_BOX = { width: 280, height: 220 };

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function fitTransform(frame: Rect, box: { width: number; height: number }, tile: number) {
  const scale = Math.min(box.width / (frame.w * tile), box.height / (frame.h * tile));
  const x = (box.width - frame.w * tile * scale) / 2 - frame.x * tile * scale;
  const y = (box.height - frame.h * tile * scale) / 2 - frame.y * tile * scale;
  return { scale, x, y };
}

// The TV's map: the whole of what the crew has found, fitted to the screen
// while it fits at a size the couch can read; past that the camera follows
// the scene, and a small map of everything found sits in the corner with
// the camera's frame on it. The pings play a sound once each.
export function CouchTvSite({ view }: { view: SiteView }) {
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const camera = box.width ? cameraFrame(view, box) : null;
  const plane = camera ? fitTransform(camera.frame, box, PLANE_TILE) : null;
  usePingSound(view.pings.map((ping) => ping.zone).join(","));
  useAlarmSound(view.alerts.map((alert) => alert.zone).join(","));
  return (
    <div ref={ref} className="couch-tv-site" aria-label="The map">
      {plane ? (
        <div className="couch-tv-site-plane" style={{ transform: `translate(${plane.x}px, ${plane.y}px) scale(${plane.scale})` }}>
          <CouchSiteMap view={view} variant="tv" tile={PLANE_TILE} />
        </div>
      ) : null}
      {camera?.overview ? <CouchSiteOverview view={view} frame={camera.frame} whole={camera.whole} /> : null}
    </div>
  );
}

function CouchSiteOverview({ view, frame, whole }: { view: SiteView; frame: Rect; whole: Rect }) {
  const tile = Math.min(OVERVIEW_BOX.width / whole.w, OVERVIEW_BOX.height / whole.h);
  const width = whole.w * tile;
  const height = whole.h * tile;
  return (
    <div className="couch-tv-site-overview" style={{ width, height }} aria-hidden="true">
      <div style={{ position: "absolute", left: -whole.x * tile, top: -whole.y * tile }}>
        <CouchSiteMap view={view} variant="overview" tile={tile} labels={false} />
      </div>
      <div
        className="couch-tv-site-frame"
        style={{ left: (frame.x - whole.x) * tile, top: (frame.y - whole.y) * tile, width: frame.w * tile, height: frame.h * tile }}
      />
    </div>
  );
}

// A motion tracker's ping, heard from the couch: two short high beeps per
// new set of pings. Not on the first draw, so a reload is silent.
function usePingSound(key: string) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = key;
    if (before === null || !key || key === before) return;
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const audio = new Context();
      for (const at of [0, 0.32]) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = 1320;
        gain.gain.setValueAtTime(0.0001, audio.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.22);
        osc.connect(gain).connect(audio.destination);
        osc.start(audio.currentTime + at);
        osc.stop(audio.currentTime + at + 0.25);
      }
      window.setTimeout(() => void audio.close(), 1200);
    } catch {
      // No sound is better than a broken screen.
    }
  }, [key]);
}

// The ship's alarm, heard from the couch when the map changes under the
// crew (a fire, a blast, a vent to space, a ship pulling away): a low
// two-tone whoop, twice. Not on the first draw, so a reload is silent.
function useAlarmSound(key: string) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = key;
    if (before === null || !key || key === before) return;
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const audio = new Context();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sawtooth";
      const t0 = audio.currentTime;
      for (const [i, at] of [0, 0.55, 1.1, 1.65].entries()) osc.frequency.setValueAtTime(i % 2 ? 330 : 440, t0 + at);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
      gain.gain.setValueAtTime(0.08, t0 + 2.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + 2.35);
      window.setTimeout(() => void audio.close(), 2800);
    } catch {
      // No sound is better than a broken screen.
    }
  }, [key]);
}

// The phone's map: a tile a thumb wide, scrolled to the player's own token
// when it opens. Tapping a zone fills the action box (onZone).
export function CouchPhoneSite({ view, youId, onZone }: { view: SiteView; youId: string; onZone?: (zoneId: string, name: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const bounds = boundsOf(driftedRects(view), 2);
  const tile = 24;
  useEffect(() => {
    ref.current?.querySelector("[data-you]")?.scrollIntoView({ block: "center", inline: "center" });
  }, []);
  if (!bounds) return <p className="couch-site-empty">Nothing found yet.</p>;
  return (
    <div ref={ref} className="couch-phone-site" style={{ width: "100%", height: Math.min(bounds.h * tile, 460) }}>
      <div style={{ position: "relative", width: bounds.w * tile, height: bounds.h * tile }}>
        <div style={{ position: "absolute", left: -bounds.x * tile, top: -bounds.y * tile }}>
          <CouchSiteMap view={view} variant="phone" tile={tile} youId={youId} onZone={onZone} />
        </div>
      </div>
    </div>
  );
}
