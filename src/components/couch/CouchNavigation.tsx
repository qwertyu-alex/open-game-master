"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { MapIcon } from "lucide-react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { railTrail, type CouchNavigation, type MapRoom } from "@/lib/couch/navigation-logic";
import { hostOffers, useCapabilities } from "@/lib/use-capabilities";

// The crew's map (docs/couch-navigation.md): the deck plan of where the crew
// has been. The TV keeps the picture in front and carries the plan as one
// faint rail under the title; each phone has a Map button beside its tabs
// that opens the whole plan as a sheet. Nobody votes from it: the room
// talks it over and someone tells the GM where the crew goes.

const RAIL_ROOMS = 5;
const RAIL_EXITS = 4;
const RAIL_SIDES = 2;
// How far a sheet is dragged down, or how fast, before it lets go.
const DISMISS_PX = 110;
const DISMISS_SPEED = 0.6;

function useCrewMap(state: CampaignState): CouchNavigation | null {
  const capabilities = useCapabilities();
  const map = state.couchNavigation;
  return hostOffers(capabilities, "couchNavigation") && map ? map : null;
}

export function CouchMapRail({ state }: { state: CampaignState }) {
  const map = useCrewMap(state);
  if (!map) return null;
  const { earlier, rooms } = railTrail(map.trail, RAIL_ROOMS);
  const exits = map.exits.slice(0, RAIL_EXITS);
  const moreExits = map.exits.length - exits.length;
  const sided = rooms.some((room) => map.side.some((side) => side.at === room.id));
  return (
    <section className="couch-rail" aria-label={`Map. The crew is in ${map.here.name}.`} data-sided={sided ? "" : undefined}>
      {earlier ? <span className="couch-rail-earlier">{earlier} earlier</span> : null}
      <ol className="couch-rail-trail">
        {rooms.map((room) => (
          <li key={room.id} className="couch-rail-room" data-here={room.id === map.here.id ? "" : undefined}>
            <span className="couch-rail-box">
              {room.id === map.here.id ? <span className="sr-only">Here: </span> : null}
              {room.name}
            </span>
            <SideRooms map={map} at={room.id} limit={RAIL_SIDES} className="couch-rail-side" />
          </li>
        ))}
      </ol>
      {exits.length ? (
        <ul className="couch-rail-exits" aria-label="Exits">
          {exits.map((exit) => (
            <li key={exit.id} data-visited={exit.visited ? "" : undefined}>{exit.name}</li>
          ))}
          {moreExits ? <li className="couch-rail-more">+{moreExits} more</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

// The phone's way in: a button the size of the tabs beside them, and the
// plan as a sheet over the story, closed by Done, a swipe down, a tap
// outside, Escape or the phone's own Back.
export function CouchMapButton({ state }: { state: CampaignState }) {
  const map = useCrewMap(state);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!map) return null;
  return (
    <>
      <button
        type="button"
        className="couch-map-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MapIcon size={20} aria-hidden="true" />
        <span className="couch-map-button-label">Map</span>
        <span className="sr-only">. The crew is in {map.here.name}</span>
      </button>
      <MapSheet map={map} open={open} onClose={close} />
    </>
  );
}

function MapSheet({ map, open, onClose }: { map: CouchNavigation; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const hereRef = useRef<HTMLLIElement>(null);
  const titleId = useId();
  const drag = useRef<{ startY: number; startAt: number; lastY: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => hereRef.current?.scrollIntoView({ block: "center" }));
    } else if (!open && dialog.open) {
      dialog.close();
    }
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
            <p className="couch-map-sub">Where the crew has been · not to scale</p>
          </div>
          <button type="button" className="couch-map-done" onClick={onClose}>Done</button>
        </div>
        <div className="couch-map-body">
          <DeckPlan map={map} hereRef={hereRef} />
          <ul className="couch-map-legend" aria-label="Key">
            <li><i data-here="" aria-hidden="true" />You are here</li>
            <li><i aria-hidden="true" />Been there</li>
            <li><i data-unexplored="" aria-hidden="true" />Not explored</li>
          </ul>
          <p className="couch-map-tip">To go somewhere, just say it: “We take the ladder up to the bridge.”</p>
        </div>
      </div>
    </dialog>
  );
}

// The plan top to bottom: the way the crew came, rooms they looked into
// beside it, and the exits from here at the foot.
function DeckPlan({ map, hereRef }: { map: CouchNavigation; hereRef: RefObject<HTMLLIElement | null> }) {
  return (
    <div className="couch-plan">
      <ol className="couch-plan-trail" aria-label="The way you came, from the start">
        {map.trail.map((room) => {
          const here = room.id === map.here.id;
          return (
            <li key={room.id} ref={here ? hereRef : undefined} className="couch-plan-stop" data-here={here ? "" : undefined}>
              <span className="couch-plan-room">
                {room.name}
                {here ? <small>You are here</small> : null}
              </span>
              <SideRooms map={map} at={room.id} className="couch-plan-side" />
            </li>
          );
        })}
      </ol>
      {map.exits.length ? (
        <ul className="couch-plan-exits" aria-label={`Exits from ${map.here.name}`}>
          {map.exits.map((exit) => (
            <li key={exit.id} className="couch-plan-exit" data-visited={exit.visited ? "" : undefined}>
              {exit.name}
              <small>{exit.visited ? "Been there" : "Not explored"}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="couch-plan-none">No exits known from here yet.</p>
      )}
    </div>
  );
}

function SideRooms({ map, at, limit, className }: { map: CouchNavigation; at: string; limit?: number; className: string }) {
  const rooms: MapRoom[] = map.side.filter((side) => side.at === at);
  if (!rooms.length) return null;
  const shown = limit ? rooms.slice(0, limit) : rooms;
  return (
    <ul className={className} aria-label="Rooms off it">
      {shown.map((room) => <li key={room.id}>{room.name}</li>)}
      {rooms.length > shown.length ? <li className="couch-rail-more">+{rooms.length - shown.length}</li> : null}
    </ul>
  );
}
