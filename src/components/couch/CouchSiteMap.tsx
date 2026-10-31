"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { boundsOf, cameraFrame, type Rect, type SiteView, type ViewToken } from "@/lib/couch/site-map-logic";

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
  "crew-start": "start",
};

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
  return (
    <div
      className={`couch-site couch-site-${variant}`}
      style={{ "--cols": view.cols, "--rows": view.rows, "--t": `${tile}px` } as CSSProperties}
      role={variant === "overview" ? undefined : "group"}
      aria-hidden={variant === "overview" ? true : undefined}
      aria-label={variant === "overview" ? undefined : `Overhead map: ${view.zones.length} places found.`}
    >
      {view.zones.map((zone) =>
        zone.rects.map((rect, i) => (
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
        )),
      )}
      {view.props.map((prop, i) => (
        <div key={`prop-${i}`} className="couch-site-prop" data-prop={prop.kind} style={place(prop)} aria-hidden="true" />
      ))}
      {view.walls.map((wall, i) => (
        <div key={`wall-${i}`} className="couch-site-wall" data-axis={wall.axis} style={place({ x: wall.x, y: wall.y, w: wall.axis === "h" ? wall.length : 0, h: wall.axis === "v" ? wall.length : 0 })} aria-hidden="true" />
      ))}
      {view.doors.map((door, i) => (
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
        ? view.zones.map((zone) => {
            const rect = [...zone.rects].sort((p, q) => q.w * q.h - p.w * p.h)[0];
            if (!rect || zone.kind === "crawlway") return null;
            const label = (
              <>
                <span className="couch-site-name">{zone.name}</span>
                {zone.features.length ? <span className="couch-site-features">{zone.features.join(" · ")}</span> : null}
              </>
            );
            return onZone ? (
              <button
                key={`label-${zone.id}`}
                type="button"
                className="couch-site-label"
                data-sight={zone.sight}
                style={place(rect)}
                onClick={() => onZone(zone.id, zone.name)}
                aria-label={`${zone.name}${zone.id === youZone ? ", you are here" : ""}`}
              >
                {label}
              </button>
            ) : (
              <div key={`label-${zone.id}`} className="couch-site-label" data-sight={zone.sight} style={place(rect)}>
                {label}
              </div>
            );
          })
        : null}
      {view.pings.map((ping, i) => (
        <div key={`ping-${ping.zone}-${i}`} className="couch-site-ping" style={place({ x: ping.x, y: ping.y, w: 0, h: 0 })} role="img" aria-label="Motion tracker: movement" />
      ))}
      {view.tokens.map((token) => (
        <div
          key={token.id}
          className="couch-site-token"
          data-kind={token.kind}
          data-stance={token.stance}
          data-you={token.id === youId || undefined}
          data-portrait={token.portraitUrl ? "" : undefined}
          style={place({ x: token.x, y: token.y, w: 0, h: 0 })}
          role="img"
          aria-label={`${token.name}, ${TOKEN_LABEL[token.kind]}`}
          title={token.name}
        >
          {token.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a portrait thumbnail inside a token, sized by CSS
            <img src={token.portraitUrl} alt="" draggable={false} />
          ) : (
            <span>{token.kind === "crew" || token.kind === "npc" ? initials(token.name) : ""}</span>
          )}
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

// The phone's map: a tile a thumb wide, scrolled to the player's own token
// when it opens. Tapping a zone fills the action box (onZone).
export function CouchPhoneSite({ view, youId, onZone }: { view: SiteView; youId: string; onZone?: (zoneId: string, name: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const bounds = boundsOf(view.zones.flatMap((zone) => zone.rects), 2);
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
