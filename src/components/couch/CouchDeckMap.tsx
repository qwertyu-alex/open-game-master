"use client";

import { useId, type KeyboardEvent } from "react";
import type { DeckRoom, DeckView } from "@/lib/couch/deck-plan-logic";

// The whole ship under the fog of war (docs/couch-navigation.md "The deck
// plan", src/lib/couch/deck-plan-logic.ts): every room's outline and the
// corridors between them, a room's name once the crew has been next to it,
// the way the crew walked lit, and the faces of whoever stands in a room.
// The same drawing is the TV's corner map and the phone's Map sheet; only
// the phone's pictured rooms are buttons.

const CELL_W = 130;
const CELL_H = 86;
const ROOM_W = 104;
const ROOM_H = 48;
const FACE_R = 12;
const NAME_MAX = 14;

const centre = (room: Pick<DeckRoom, "col" | "row">) => ({ x: room.col * CELL_W + CELL_W / 2, y: room.row * CELL_H + CELL_H / 2 });

function shortName(name: string): string {
  return name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1).trimEnd()}…` : name;
}

export function CouchDeckMap({
  deck,
  variant,
  youId = "",
  split = false,
  onView,
}: {
  deck: DeckView;
  variant: "tv" | "phone";
  // The phone's own room ("You are here"); the TV marks only the scene.
  youId?: string;
  split?: boolean;
  onView?: (id: string) => void;
}) {
  const clipId = useId().replace(/:/g, "");
  const byId = new Map(deck.rooms.map((room) => [room.id, room]));
  const width = deck.cols * CELL_W;
  const height = deck.rows * CELL_H;
  const named = deck.rooms.filter((room) => room.name);
  return (
    <svg
      className={`couch-deck couch-deck-${variant}`}
      viewBox={`0 0 ${width} ${height}`}
      style={variant === "phone" ? { width: `${deck.cols * 104}px`, minWidth: "100%" } : undefined}
      role="img"
      aria-label={`Deck plan: ${named.length} known rooms of ${deck.rooms.length}.`}
    >
      <defs>
        <clipPath id={`${clipId}-face`} clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>
      <g className="couch-deck-links" aria-hidden="true">
        {deck.links.map((link) => {
          const a = byId.get(link.a);
          const b = byId.get(link.b);
          if (!a || !b) return null;
          const from = centre(a);
          const to = centre(b);
          return (
            <line
              key={`${link.a}-${link.b}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              data-walked={link.walked ? "" : undefined}
              data-known={link.known ? "" : undefined}
            />
          );
        })}
      </g>
      {deck.rooms.map((room) => {
        const { x, y } = centre(room);
        const here = room.id === deck.here;
        const you = variant === "phone" && room.id === (youId || deck.here);
        const button = variant === "phone" && room.picture && onView;
        const label = room.name
          ? `${room.name}${you ? ", you are here" : ""}${split && here ? ", in the scene" : ""}${room.state === "seen" ? ", not explored" : ""}${room.crew?.length ? `, ${room.crew.map((member) => member.name).join(", ")}` : ""}`
          : "Unexplored";
        const open = () => onView?.(room.id);
        return (
          <g
            key={room.id}
            className="couch-deck-room"
            data-state={room.state}
            data-here={here ? "" : undefined}
            data-you={you ? "" : undefined}
            data-room={room.id}
            transform={`translate(${x - ROOM_W / 2} ${y - ROOM_H / 2})`}
            {...(button
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": `${label}. Show the picture`,
                  onClick: open,
                  onKeyDown: (event: KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open();
                    }
                  },
                }
              : { "aria-label": label })}
          >
            <rect width={ROOM_W} height={ROOM_H} rx={6} />
            {room.name ? (
              <text x={ROOM_W / 2} y={ROOM_H / 2} dominantBaseline="central" textAnchor="middle">
                {shortName(room.name)}
              </text>
            ) : (
              <text x={ROOM_W / 2} y={ROOM_H / 2} dominantBaseline="central" textAnchor="middle" className="couch-deck-fog-mark" aria-hidden="true">
                ?
              </text>
            )}
            {room.crew?.slice(0, 4).map((member, index) => {
              const cx = ROOM_W - 4 - index * (FACE_R * 1.5);
              return member.portraitUrl ? (
                <image
                  key={member.id}
                  className="couch-deck-face"
                  href={member.portraitUrl}
                  x={cx - FACE_R}
                  y={-FACE_R + 2}
                  width={FACE_R * 2}
                  height={FACE_R * 2}
                  clipPath={`url(#${clipId}-face)`}
                  preserveAspectRatio="xMidYMid slice"
                >
                  <title>{member.name}</title>
                </image>
              ) : (
                <g key={member.id} className="couch-deck-face-initial">
                  <circle cx={cx} cy={2} r={FACE_R} />
                  <text x={cx} y={2} dominantBaseline="central" textAnchor="middle">{member.name.slice(0, 1)}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
