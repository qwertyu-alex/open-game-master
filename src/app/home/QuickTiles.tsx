"use client";

import Link from "next/link";
import { GameIcon } from "@/components/ui/GameIcon";

// The title screen's menu, the way a game's main menu lists its doors:
// diamond bullets, Cinzel, the painted glyph rising beside the line you
// hover. This fork plays couch nights only (AGENTS.md, "This fork"), so
// there are two doors: start a night on this laptop, which becomes the TV,
// or join one with a code. Start a night disappears rather than greying out
// when the server has no story model or this account may not start a
// table: a couch night is nothing without the AI storyteller, and a dead
// line explains nothing. The tour anchors are the ones the shells' own home
// tiles carry, so a guide can point at either.
export const STARTING_ROUTES = {
  couch: "This laptop becomes the TV; everyone plays on their phone",
  join: "Sit down at a night someone else started",
} as const;

export function HomeMenu({
  showCouch,
  onJoin,
  firstTime = false,
}: {
  // False on a server with no storyteller, or whose admin starts every
  // table: the door is not there rather than greyed.
  showCouch: boolean;
  onJoin: () => void;
  // No night yet: Start a night is marked as the place to begin.
  firstTime?: boolean;
}) {
  type Item = { id: string; label: string; glyph: string; href?: string; onClick?: () => void; tour: string; sub?: string; tag?: string };
  const ways: Item[] = [
    ...(showCouch
      ? [{ id: "couch", label: "Start a night", glyph: "ui-act", href: "/couch", tour: "tile-couch", sub: STARTING_ROUTES.couch, tag: firstTime ? "Start here" : undefined }]
      : []),
    { id: "join", label: "Join with a code", glyph: "ui-join", onClick: onJoin, tour: "tile-join", sub: STARTING_ROUTES.join },
  ];
  return (
    <nav className="ts-menu" aria-label="Main menu">
      <div className="ts-menu-group">{ways.map((item, index) => menuItem(item, index))}</div>
    </nav>
  );

  function menuItem(item: Item, index: number) {
    const body = (
      <>
        <span className="ts-menu-diamond" aria-hidden="true" />
        <span className="ts-menu-text">
          <span className="ts-menu-label">
            {item.label}
            {item.tag ? <span className="ts-menu-tag">{item.tag}</span> : null}
          </span>
          {item.sub ? <span className="ts-menu-sub">{item.sub}</span> : null}
        </span>
        <span className="ts-menu-glyph" aria-hidden="true">
          <GameIcon icon={{ kind: "glyph", key: item.glyph }} size="size-9" />
        </span>
      </>
    );
    const style = { animationDelay: `${800 + index * 55}ms` };
    return item.href ? (
      <Link key={item.id} href={item.href} className="ts-menu-item ts-reveal" data-tour={item.tour} style={style} data-no-motion>
        {body}
      </Link>
    ) : (
      <button key={item.id} type="button" onClick={item.onClick} className="ts-menu-item ts-reveal" data-tour={item.tour} style={style} data-no-motion>
        {body}
      </button>
    );
  }
}
