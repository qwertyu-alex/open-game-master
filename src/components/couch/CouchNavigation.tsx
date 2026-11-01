"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { MapIcon } from "lucide-react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { CouchPhoneSite } from "@/components/couch/CouchSiteMap";
import type { SiteView } from "@/lib/couch/site-map-logic";
import { mapSplit, type CouchNavigation } from "@/lib/couch/navigation-logic";
import { hostOffers, useCapabilities } from "@/lib/use-capabilities";

// Getting around a couch night (docs/couch-navigation.md). The map is the
// night's site (src/components/couch/CouchSiteMap.tsx): the TV draws it on
// its stage, and each phone has a Map button beside its tabs that opens it
// as a sheet. Nobody votes from it: the room talks it over and someone tells
// the GM where the crew goes. On the TV a new place's name comes up large
// over the picture as the crew arrives, and a cut to another group of a
// split crew (src/lib/couch/whereabouts.ts) brings "Meanwhile".

// How far a sheet is dragged down, or how fast, before it lets go.
const DISMISS_PX = 110;
const DISMISS_SPEED = 0.6;
// How long a place's name stays up on the TV as the crew arrives.
const TITLE_MS = 6000;

function useCrewMap(state: CampaignState): CouchNavigation | null {
  const capabilities = useCapabilities();
  const map = state.couchNavigation;
  return hostOffers(capabilities, "couchNavigation") && map ? { ...map, groups: map.groups ?? [] } : null;
}

function listNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The TV's arrival title: the name of the place the crew just moved to,
// large over the picture for a few seconds. Not on a reload, which is no
// arrival.
export function CouchPlaceTitle({ state }: { state: CampaignState }) {
  const map = useCrewMap(state);
  const loaded = Boolean(state.campaign);
  const hereId = map?.here.id ?? null;
  const [last, setLast] = useState<{ id: string | null } | null>(() => (loaded ? { id: hereId } : null));
  const [title, setTitle] = useState<{ key: number; name: string; meanwhile: string } | null>(null);
  if (loaded && !last) {
    setLast({ id: hereId });
  } else if (last && last.id !== hereId) {
    setLast({ id: hereId });
    // A split crew's scene turning to another group is a cut: "Meanwhile",
    // and who the story is with now.
    const scene = map && mapSplit(map) ? map.groups.find((group) => group.inScene) : null;
    if (map) setTitle({ key: (title?.key ?? 0) + 1, name: map.here.name, meanwhile: scene ? listNames(scene.crew.map((member) => member.name)) : "" });
  }
  useEffect(() => {
    if (!title) return;
    const timer = window.setTimeout(() => setTitle(null), TITLE_MS);
    return () => window.clearTimeout(timer);
  }, [title]);
  if (!title) return null;
  return (
    <div key={title.key} className="couch-tv-place" role="status" data-meanwhile={title.meanwhile ? "" : undefined}>
      {title.meanwhile ? <span className="couch-tv-place-kicker">Meanwhile</span> : null}
      <span className="couch-tv-place-name">{title.name}</span>
      {title.meanwhile ? <span className="couch-tv-place-who">{title.meanwhile}</span> : null}
    </div>
  );
}

// The phone's way in: a button the size of the tabs beside them, and the
// site as a sheet over the story, closed by Done, a swipe down, a tap
// outside, Escape or the phone's own Back.
export function CouchMapButton({ state, onMove }: { state: CampaignState; onMove?: (line: string) => void }) {
  const site = state.couchSite;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!site) return null;
  const meId = state.me?.id ?? "";
  const youId = state.sheets.find((sheet) => sheet.userId === meId)?.id ?? "";
  const here = site.zones.find((zone) => site.tokens.some((token) => token.id === youId && token.zone === zone.id));
  return (
    <>
      <button type="button" className="couch-map-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <MapIcon size={20} aria-hidden="true" />
        <span className="couch-map-button-label">Map</span>
        <span className="sr-only">{here ? `. You are in ${here.name}` : ""}</span>
      </button>
      <MapSheet open={open} onClose={close}>
        <SiteSheet view={site} youId={youId} onMove={onMove ? (line) => { close(); onMove(line); } : undefined} />
      </MapSheet>
    </>
  );
}

function MapSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useRef<{ startY: number; startAt: number; lastY: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Back closes the sheet instead of leaving the table: one history entry
  // while it is up, given back when it closes another way. Pushed a tick
  // late so a development double mount does not leave a stray entry.
  useEffect(() => {
    if (!open) return;
    let pushed = false;
    let popped = false;
    const timer = window.setTimeout(() => {
      window.history.pushState(window.history.state, "");
      pushed = true;
    }, 0);
    const onPop = () => {
      popped = true;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    const root = document.documentElement;
    root.dataset.sheet = "open";
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      delete root.dataset.sheet;
      if (pushed && !popped) window.history.back();
    };
  }, [open, onClose]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startAt: event.timeStamp, lastY: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.lastY = event.clientY;
    setDragY(Math.max(0, event.clientY - drag.current.startY));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const started = drag.current;
    drag.current = null;
    setDragY(0);
    if (!started) return;
    const moved = started.lastY - started.startY;
    const speed = moved / Math.max(1, event.timeStamp - started.startAt);
    if (moved > DISMISS_PX || (moved > 40 && speed > DISMISS_SPEED)) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="couch-map-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      // A tap on the dimmed page around the sheet lands on the dialog itself;
      // the sheet's own surface is the panel inside it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="couch-map-panel" style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
        <div
          className="couch-map-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="couch-map-grabber" aria-hidden="true" />
          <div className="couch-map-titles">
            <h2 id={titleId} className="couch-map-title">Map</h2>
            <p className="couch-map-sub">What the crew has found, from above</p>
          </div>
          <button type="button" className="couch-map-done" onClick={onClose}>Done</button>
        </div>
        <div className="couch-map-body">{open ? children : null}</div>
      </div>
    </dialog>
  );
}

// The site (docs/couch-overhead-spec.md): what the crew has found, opening
// on this player's own token; tapping a place starts "I go
// to …" in the action box, nothing sent until they send it. Under it, the
// ways out of where they stand and what lies there.
function SiteSheet({ view, youId, onMove }: { view: SiteView; youId: string; onMove?: (line: string) => void }) {
  const me = view.tokens.find((token) => token.id === youId);
  const here = me ? view.zones.find((zone) => zone.id === me.zone) : undefined;
  const exits = me ? (view.exits[me.zone] ?? []) : [];
  const things = me ? view.tokens.filter((token) => token.zone === me.zone && token.kind !== "crew") : [];
  const exitWord = (kind: string) => (kind === "open" ? "Open to" : kind === "vent" ? "Vent to" : kind === "airlock" ? "Airlock to" : kind === "hatch" ? "Hatch to" : kind === "breach" ? "Hole through to" : "Door to");
  return (
    <div className="couch-site-sheet">
      <CouchPhoneSite view={view} youId={youId} onZone={onMove ? (zoneId, name) => zoneId !== me?.zone && onMove(`I go to the ${name}.`) : undefined} />
      {here ? (
        <div className="couch-site-ways">
          <h3>
            {here.name}
            {here.features.length ? <small> · {here.features.join(", ")}</small> : null}
          </h3>
          {exits.length ? (
            <ul aria-label={`Ways out of ${here.name}`}>
              {exits.map((exit) => (
                <li key={exit.zone} data-state={exit.name ? "visited" : "unknown"}>
                  {exitWord(exit.kind)} {exit.name ?? "somewhere dark"}
                  {exit.state !== "open" && exit.kind !== "open" && exit.kind !== "breach" ? <small>{exit.state === "severed" ? "cut off" : exit.state}</small> : null}
                  {exit.hazards?.length ? <small data-hazard="">{exit.hazards.join(", ")}</small> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {things.length ? <p className="couch-site-here">Here: {things.map((token) => token.name).join(", ")}</p> : null}
        </div>
      ) : null}
      <p className="couch-map-tip">{onMove ? "Tap a place to say you go there, or just say it." : "To go somewhere, just say it."}</p>
    </div>
  );
}
