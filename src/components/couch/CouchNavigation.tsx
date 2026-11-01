"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ChevronLeft, ChevronRight, MapIcon } from "lucide-react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { deckExits, type DeckView } from "@/lib/couch/deck-plan-logic";
import { CouchPhoneSite } from "@/components/couch/CouchSiteMap";
import type { SiteView } from "@/lib/couch/site-map-logic";
import { CouchDeckMap } from "@/components/couch/CouchDeckMap";
import { mapSplit, myGroup, picturedRooms, railTrail, type CouchNavigation, type MapCrew, type MapGroup, type MapRoom } from "@/lib/couch/navigation-logic";
import { hostOffers, useCapabilities } from "@/lib/use-capabilities";

// The crew's map (docs/couch-navigation.md): the deck plan of where the crew
// has been. The TV keeps the picture in front and carries the plan as one
// faint rail under the title; each phone has a Map button beside its tabs
// that opens the whole plan as a sheet. Nobody votes from it: the room
// talks it over and someone tells the GM where the crew goes.
//
// Each place the crew has seen carries its establishing shot
// (src/lib/couch/place-shots.ts): on the phone's plan it is a button that
// opens the picture, and the viewer pages through every place pictured. On
// the TV a new place's name comes up large over the picture as the crew
// arrives.
//
// Once the crew splits up (src/lib/couch/whereabouts.ts), every room
// someone stands in shows their faces. The TV's rail follows the scene and
// names the other groups under it; a cut brings "Meanwhile" and the
// group's place up large. Each phone's plan marks its own group's room as
// "You are here", the scene's as "In the scene", and lists its own exits.
// On the rail, each group's faces sit inside its own room's box.

const RAIL_ROOMS = 5;
const RAIL_EXITS = 4;
const RAIL_SIDES = 2;
// How far a sheet is dragged down, or how fast, before it lets go.
const DISMISS_PX = 110;
const DISMISS_SPEED = 0.6;
// How far a picture is swiped sideways before it turns to the next place.
const SWIPE_PX = 60;
// How long a place's name stays up on the TV as the crew arrives.
const TITLE_MS = 6000;

function useCrewMap(state: CampaignState): CouchNavigation | null {
  const capabilities = useCapabilities();
  const map = state.couchNavigation;
  return hostOffers(capabilities, "couchNavigation") && map ? { ...map, groups: map.groups ?? [] } : null;
}

function crewAt(map: CouchNavigation, roomId: string): MapCrew[] {
  return map.groups.find((group) => group.room.id === roomId)?.crew ?? [];
}

function listNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Faces of who stands in a room, while the crew is split.
function CrewFaces({ crew, className = "couch-crew-faces" }: { crew: readonly MapCrew[]; className?: string }) {
  if (!crew.length) return null;
  return (
    <span className={className} aria-label={listNames(crew.map((member) => member.name))}>
      {crew.map((member) =>
        member.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated portrait
          <img key={member.id} src={member.portraitUrl} alt="" title={member.name} />
        ) : (
          <span key={member.id} className="couch-crew-face-initial" title={member.name} aria-hidden="true">{member.name.slice(0, 1)}</span>
        ),
      )}
    </span>
  );
}

export function CouchMapRail({ state }: { state: CampaignState }) {
  const map = useCrewMap(state);
  if (!map) return null;
  // With a deck plan, the TV's corner shows the whole ship under the fog.
  if (map.deck) {
    return (
      <section className="couch-deckmap couch-deckmap-tv" aria-label={`Map. The ${mapSplit(map) ? "scene" : "crew"} is in ${map.here.name}.`}>
        <CouchDeckMap deck={map.deck} variant="tv" split={mapSplit(map)} />
      </section>
    );
  }
  const { earlier, rooms } = railTrail(map.trail, RAIL_ROOMS);
  const exits = map.exits.slice(0, RAIL_EXITS);
  const moreExits = map.exits.length - exits.length;
  const sided = rooms.some((room) => map.side.some((side) => side.at === room.id));
  const split = mapSplit(map);
  // Each group's faces sit on its own room. Only a group whose room the
  // rail no longer draws (folded into "earlier") is named under it.
  const drawn = new Set(rooms.map((room) => room.id));
  for (const side of map.side) if (drawn.has(side.at)) drawn.add(side.id);
  const elsewhere = map.groups.filter((group) => !group.inScene && !drawn.has(group.room.id));
  return (
    <section className="couch-rail" aria-label={`Map. The ${split ? "scene" : "crew"} is in ${map.here.name}.`} data-sided={sided ? "" : undefined} data-split={split ? "" : undefined}>
      {earlier ? <span className="couch-rail-earlier">{earlier} earlier</span> : null}
      <ol className="couch-rail-trail">
        {rooms.map((room) => (
          <li key={room.id} className="couch-rail-room" data-here={room.id === map.here.id ? "" : undefined}>
            <span className="couch-rail-box">
              {split ? <CrewFaces crew={crewAt(map, room.id)} /> : null}
              {room.id === map.here.id ? <span className="sr-only">Here: </span> : null}
              <span className="couch-rail-name">{room.name}</span>
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
      {elsewhere.length ? (
        <ul className="couch-rail-elsewhere" aria-label="Elsewhere">
          {elsewhere.map((group) => (
            <li key={group.room.id}>
              <CrewFaces crew={group.crew} />
              <span className="couch-rail-elsewhere-who">{listNames(group.crew.map((member) => member.name.split(" ")[0]))}</span>
              <span className="couch-rail-elsewhere-place">{group.room.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
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
// plan as a sheet over the story, closed by Done, a swipe down, a tap
// outside, Escape or the phone's own Back.
export function CouchMapButton({ state, onMove }: { state: CampaignState; onMove?: (line: string) => void }) {
  const map = useCrewMap(state);
  const site = state.couchSite;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const meId = state.me?.id ?? "";
  const mine = new Set(state.sheets.filter((sheet) => sheet.userId === meId).map((sheet) => sheet.id));
  // A night played on a map has one from the start (src/lib/couch/site.ts).
  if (site) {
    const youId = [...mine][0] ?? "";
    const here = site.zones.find((zone) => site.tokens.some((token) => token.id === youId && token.zone === zone.id));
    return (
      <>
        <button type="button" className="couch-map-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <MapIcon size={20} aria-hidden="true" />
          <span className="couch-map-button-label">Map</span>
          <span className="sr-only">{here ? `. You are in ${here.name}` : ""}</span>
        </button>
        <MapSheet map={map} mine={null} open={open} onClose={close} site={{ view: site, youId, onMove: onMove ? (line) => { close(); onMove(line); } : undefined }} />
      </>
    );
  }
  if (!map) return null;
  const group = mapSplit(map) ? myGroup(map, mine) : null;
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
        <span className="sr-only">
          {group && !group.inScene ? `. You are in ${group.room.name}; the scene is in ${map.here.name}` : `. The crew is in ${map.here.name}`}
        </span>
      </button>
      <MapSheet map={map} mine={group} open={open} onClose={close} />
    </>
  );
}

function MapSheet({ map, mine, open, onClose, site }: {
  map: CouchNavigation | null;
  mine: MapGroup | null;
  open: boolean;
  onClose: () => void;
  site?: { view: SiteView; youId: string; onMove?: (line: string) => void };
}) {
  // Where this player stands: their own group's room once the crew splits.
  const youId = mine?.room.id ?? map?.here.id ?? "";
  const split = map ? mapSplit(map) : false;
  const ref = useRef<HTMLDialogElement>(null);
  const hereRef = useRef<HTMLLIElement>(null);
  const titleId = useId();
  const drag = useRef<{ startY: number; startAt: number; lastY: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  // The place whose picture is open, by room id; null shows the plan.
  const [viewing, setViewing] = useState<string | null>(null);
  const viewingRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pictured = map ? picturedRooms(map) : [];
  const viewed = viewing ? pictured.find((room) => room.id === viewing) ?? null : null;
  const view = useCallback((id: string | null) => {
    const from = viewingRef.current;
    viewingRef.current = id;
    setViewing(id);
    // Focus follows: into the picture, and back to the place it came from.
    window.requestAnimationFrame(() => {
      const body = bodyRef.current;
      if (!body) return;
      body.scrollTop = 0;
      const target = id
        ? body.querySelector<HTMLElement>(".couch-place-back")
        : from
          ? body.querySelector<HTMLElement>(`[data-room="${CSS.escape(from)}"]`)
          : null;
      target?.focus();
      if (!id && target) target.scrollIntoView({ block: "center" });
    });
  }, []);
  // A closed sheet opens on the plan again.
  if (!open && viewing) setViewing(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => (hereRef.current ?? dialog.querySelector(".couch-deck [data-you]"))?.scrollIntoView({ block: "center", inline: "center" }));
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
      // Back from a picture goes back to the plan, and the sheet keeps its
      // entry for the next Back.
      if (viewingRef.current) {
        view(null);
        window.history.pushState(window.history.state, "");
        return;
      }
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
      viewingRef.current = null;
      if (pushed && !popped) window.history.back();
    };
  }, [open, onClose, view]);

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
            <p className="couch-map-sub">{site ? "What the crew has found, from above" : `${split && map ? `The crew is split in ${map.groups.length} groups` : map?.deck ? "The ship, as far as you know" : "Where the crew has been"} · not to scale`}</p>
          </div>
          <button type="button" className="couch-map-done" onClick={onClose}>Done</button>
        </div>
        <div className="couch-map-body" ref={bodyRef}>
          {site ? (
            <SiteSheet view={site.view} youId={site.youId} onMove={site.onMove} />
          ) : !map ? null : viewed ? (
            <PlaceViewer room={viewed} rooms={pictured} hereId={youId} onView={view} />
          ) : (
            <>
              {map.deck ? (
                <DeckSheet map={map} deck={map.deck} youId={youId} split={split} onView={view} />
              ) : (
                <DeckPlan map={map} youId={youId} hereRef={hereRef} onView={view} />
              )}
              <ul className="couch-map-legend" aria-label="Key">
                <li><i data-here="" aria-hidden="true" />You are here</li>
                {split ? <li><i data-scene="" aria-hidden="true" />In the scene</li> : null}
                <li><i aria-hidden="true" />Been there</li>
                <li><i data-unexplored="" aria-hidden="true" />Not explored</li>
                {map.deck ? <li><i data-fog="" aria-hidden="true" />Unknown</li> : null}
              </ul>
              <p className="couch-map-tip">
                {pictured.length ? "Tap a place to see it again. " : ""}To go somewhere, just say it: “We take the ladder up to the bridge.”
              </p>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

// The whole ship on the phone: the map, scrolled sideways when it is wider
// than the phone, then where this player can go from their room.
function DeckSheet({ map, deck, youId, split, onView }: {
  map: CouchNavigation;
  deck: DeckView;
  youId: string;
  split: boolean;
  onView: (id: string) => void;
}) {
  const pictured = new Set(picturedRooms(map).map((room) => room.id));
  const from = deck.rooms.find((room) => room.id === youId);
  const ways = deckExits(deck, youId);
  return (
    <div className="couch-deck-sheet">
      <div className="couch-deck-scroll">
        <CouchDeckMap deck={deck} variant="phone" youId={youId} split={split} onView={(id) => pictured.has(id) && onView(id)} />
      </div>
      {from?.name ? (
        <div className="couch-deck-ways">
          <h3>From {from.name} you can go to</h3>
          {ways.length ? (
            <ul aria-label={`Exits from ${from.name}`}>
              {ways.map((room) => (
                <li key={room.id} data-state={room.state}>
                  {room.name ?? "Somewhere unexplored"}
                  <small>{room.state === "visited" ? "Been there" : "Not explored"}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="couch-plan-none">No way on known from here yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// The plan top to bottom: the way the crew came, rooms they looked into
// beside it, and the exits from here at the foot.
function DeckPlan({ map, youId, hereRef, onView }: {
  map: CouchNavigation;
  youId: string;
  hereRef: RefObject<HTMLLIElement | null>;
  onView: (id: string) => void;
}) {
  const split = mapSplit(map);
  const exitsFrom = map.groups.find((group) => group.room.id === youId) ?? null;
  const exits = exitsFrom && !exitsFrom.inScene ? exitsFrom.exits : map.exits;
  const exitsName = exitsFrom && !exitsFrom.inScene ? exitsFrom.room.name : map.here.name;
  // The marks under a room's name: you, the scene, and who stands there.
  const marks = (roomId: string) => (
    <>
      {roomId === youId ? <small>You are here</small> : null}
      {split && roomId === map.here.id ? <small className="couch-plan-scene">In the scene</small> : null}
      {split ? <CrewFaces crew={crewAt(map, roomId)} /> : null}
    </>
  );
  return (
    <div className="couch-plan">
      <ol className="couch-plan-trail" aria-label="The way you came, from the start">
        {map.trail.map((room) => {
          const here = room.id === youId;
          return (
            <li key={room.id} ref={here ? hereRef : undefined} className="couch-plan-stop" data-here={here ? "" : undefined} data-scene={split && room.id === map.here.id ? "" : undefined}>
              {room.picture ? (
                <button type="button" className="couch-plan-room" data-room={room.id} onClick={() => onView(room.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a generated picture */}
                  <img className="couch-plan-thumb" src={room.picture.url} alt="" loading="lazy" decoding="async" />
                  <span className="couch-plan-room-name">{room.name}</span>
                  {marks(room.id)}
                  <span className="sr-only">. Show the picture</span>
                </button>
              ) : (
                <span className="couch-plan-room">
                  {room.name}
                  {marks(room.id)}
                </span>
              )}
              <SideRooms map={map} at={room.id} className="couch-plan-side" onView={onView} youId={youId} hereRef={hereRef} />
            </li>
          );
        })}
      </ol>
      {exits.length ? (
        <ul className="couch-plan-exits" aria-label={`Exits from ${exitsName}`}>
          {exits.map((exit) => (
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

function SideRooms({ map, at, limit, className, onView, youId, hereRef }: {
  map: CouchNavigation;
  at: string;
  limit?: number;
  className: string;
  onView?: (id: string) => void;
  // The phone's plan: the player's own room, scrolled to when it opens.
  youId?: string;
  hereRef?: RefObject<HTMLLIElement | null>;
}) {
  const rooms: MapRoom[] = map.side.filter((side) => side.at === at);
  if (!rooms.length) return null;
  const split = mapSplit(map);
  // A room someone stands in is never folded away.
  const occupied = (room: MapRoom) => split && crewAt(map, room.id).length > 0;
  const shown = limit ? rooms.filter((room, index) => index < limit || occupied(room)) : rooms;
  return (
    <ul className={className} aria-label="Rooms off it">
      {shown.map((room) => (
        <li
          key={room.id}
          ref={room.id === youId ? hereRef : undefined}
          data-pictured={room.picture && onView ? "" : undefined}
          data-here={room.id === youId ? "" : undefined}
          data-occupied={occupied(room) ? "" : undefined}
        >
          {/* On the TV's rail the faces sit in the room's box, before its name. */}
          {!onView && occupied(room) ? <CrewFaces crew={crewAt(map, room.id)} /> : null}
          {room.picture && onView ? (
            <button type="button" data-room={room.id} onClick={() => onView(room.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated picture */}
              <img className="couch-plan-side-thumb" src={room.picture.url} alt="" loading="lazy" decoding="async" />
              {room.name}
              <span className="sr-only">. Show the picture</span>
            </button>
          ) : (
            room.name
          )}
          {onView && room.id === youId ? <small>You are here</small> : null}
          {onView && occupied(room) ? <CrewFaces crew={crewAt(map, room.id)} /> : null}
        </li>
      ))}
      {rooms.length > shown.length ? <li className="couch-rail-more">+{rooms.length - shown.length}</li> : null}
    </ul>
  );
}

// One place's picture inside the sheet: the picture, its name and what is in
// it, a way back to the plan, and the other pictured places a tap or a swipe
// away.
function PlaceViewer({ room, rooms, hereId, onView }: {
  room: MapRoom;
  rooms: readonly MapRoom[];
  hereId: string;
  onView: (id: string | null) => void;
}) {
  const titleId = useId();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const index = rooms.findIndex((entry) => entry.id === room.id);
  const previous = index > 0 ? rooms[index - 1] : null;
  const next = index >= 0 && index < rooms.length - 1 ? rooms[index + 1] : null;
  const picture = room.picture;
  if (!picture) return null;
  return (
    <section className="couch-place-view" aria-labelledby={titleId}>
      <div className="couch-place-bar">
        <button type="button" className="couch-place-back" onClick={() => onView(null)}>
          <ChevronLeft size={20} aria-hidden="true" />
          Map
        </button>
        {rooms.length > 1 ? <span className="couch-place-count">{index + 1} of {rooms.length}</span> : null}
      </div>
      <figure
        className="couch-place-figure"
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = swipe.current;
          swipe.current = null;
          if (!from) return;
          const dx = event.clientX - from.x;
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(event.clientY - from.y)) return;
          const to = dx < 0 ? next : previous;
          if (to) onView(to.id);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated picture */}
        <img key={picture.url} className="couch-place-picture" src={picture.url} alt={`${room.name}, as the crew saw it`} draggable={false} />
        <figcaption>
          <h3 id={titleId} className="couch-place-name">
            {room.name}
            {room.id === hereId ? <small>You are here</small> : null}
          </h3>
          {picture.seen ? <p className="couch-place-seen">{picture.seen}</p> : null}
        </figcaption>
      </figure>
      {rooms.length > 1 ? (
        <div className="couch-place-nav">
          <button type="button" disabled={!previous} onClick={() => previous && onView(previous.id)}>
            <ChevronLeft size={20} aria-hidden="true" />
            <span>{previous ? previous.name : "First place"}</span>
            {previous ? <span className="sr-only">: previous place</span> : null}
          </button>
          <button type="button" disabled={!next} onClick={() => next && onView(next.id)}>
            <span>{next ? next.name : "Last place"}</span>
            {next ? <span className="sr-only">: next place</span> : null}
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

// A night played on a map (docs/couch-overhead-spec.md): what the crew has
// found, opening on this player's own token; tapping a place starts "I go
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
        <div className="couch-deck-ways">
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
          {things.length ? <p className="couch-plan-none">Here: {things.map((token) => token.name).join(", ")}</p> : null}
        </div>
      ) : null}
      <p className="couch-map-tip">{onMove ? "Tap a place to say you go there, or just say it." : "To go somewhere, just say it."}</p>
    </div>
  );
}
