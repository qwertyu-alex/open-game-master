"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DmWhisper } from "@/lib/db/dm-whispers";
import type { PrivateExchange } from "@/components/couch/phone-logic";

// The GM's private line to this phone (docs/couch-mode-spec.md 2.2, 2.7),
// one exchange at a time, in the story where it was asked: what the player
// asked and what send_whisper told them alone ("the motion tracker shows
// something only you can see"). It shows open while something in it is new
// or waiting, never folds while unread, and folds to one line once the story
// moves past it. A player asks from the action box's Ask GM button, or
// "Ask a follow-up" here.
export function CouchExchange({
  exchange,
  storyKey,
  onAsk,
  watchRef,
}: {
  exchange: PrivateExchange<DmWhisper>;
  // The newest story entry: an exchange shown open stays open until the
  // story moves on, so one does not fold the moment it is read.
  storyKey: string;
  onAsk: () => void;
  // Lets the story watch an unread exchange: reading it on screen, or
  // pointing the player to it from the action box when it is out of sight.
  watchRef?: (element: HTMLElement | null) => void;
}) {
  const [folded, setFolded] = useState<boolean | null>(null);
  const [openAt, setOpenAt] = useState(exchange.open ? storyKey : null);
  if (exchange.open && openAt !== storyKey) setOpenAt(storyKey);
  const titleId = useId();
  const listId = useId();
  const shownOpen = exchange.open || openAt === storyKey;
  const open = exchange.unread || (folded === null ? shownOpen : !folded);
  const asked = exchange.whispers.some((whisper) => whisper.direction === "to_dm");
  const answered = exchange.whispers.some((whisper) => whisper.direction === "to_player");
  const count = exchange.whispers.length;

  if (!open) {
    return (
      <button
        ref={watchRef}
        type="button"
        className="couch-private-fold"
        aria-expanded={false}
        onClick={() => setFolded(false)}
      >
        <Lock className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {asked ? (answered ? "You asked the GM · answered" : "You asked the GM") : "The GM, to you alone"}
          {" · "}
          <b>
            {count} message{count === 1 ? "" : "s"}
          </b>
        </span>
        <ChevronDown className="couch-chevron size-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <section
      ref={watchRef}
      className="couch-private"
      data-unread={exchange.unread ? "" : undefined}
      aria-labelledby={titleId}
    >
      <div className="couch-private-head">
        {exchange.unread ? (
          <h2 id={titleId} className="couch-label inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            Only you &amp; the GM
          </h2>
        ) : (
          <h2 id={titleId} className="couch-label">
            <button
              type="button"
              className="couch-private-toggle"
              aria-expanded
              aria-controls={listId}
              onClick={() => setFolded(true)}
            >
              <Lock className="size-3.5" aria-hidden="true" />
              Only you &amp; the GM
              <ChevronDown className="couch-chevron size-4" aria-hidden="true" />
            </button>
          </h2>
        )}
        {exchange.unread ? <span className="couch-private-new">New</span> : null}
      </div>
      <ul id={listId} className="grid gap-2" aria-live="polite">
        {exchange.whispers.map((whisper) => (
          <li
            key={whisper.id}
            className="couch-whisper"
            data-mine={whisper.direction === "to_dm" ? "" : undefined}
            data-unread={whisper.direction === "to_player" && !whisper.read ? "" : undefined}
          >
            <small className="couch-whisper-who">
              {whisper.direction === "to_dm"
                ? whisper.answered
                  ? "You to the GM · seen"
                  : "You to the GM · waiting for the GM's next turn"
                : whisper.recipientNames.length > 1
                  ? `The GM, to you and ${whisper.recipientNames.length - 1} other${whisper.recipientNames.length > 2 ? "s" : ""}`
                  : "The GM, to you alone"}
            </small>
            {whisper.content}
          </li>
        ))}
      </ul>
      {answered && !exchange.waiting ? (
        <button type="button" className="couch-link couch-private-follow" onClick={onAsk}>
          <Lock className="size-3.5" aria-hidden="true" />
          Ask a follow-up
        </button>
      ) : null}
    </section>
  );
}

// Watches the unread exchanges in the story: reads them once one is
// actually on screen (not merely loaded), says whether one is out of sight so
// the action box can point to it ("The GM answered you"), and buzzes the
// phone when a whisper lands after the page has its backlog.
export function useWhisperWatch({
  campaignId,
  unread,
  loaded,
  refreshWhispers,
}: {
  campaignId: string;
  unread: number;
  loaded: boolean;
  refreshWhispers: () => Promise<void>;
}) {
  const elements = useRef(new Map<string, HTMLElement>());
  const [watched, setWatched] = useState(0);
  const [inView, setInView] = useState(false);

  // One stable ref per exchange, so a render does not detach and reattach it.
  const refs = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const watchRef = useCallback((id: string) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (element: HTMLElement | null) => {
        if (element) elements.current.set(id, element);
        else elements.current.delete(id);
        setWatched(elements.current.size);
      };
      refs.current.set(id, ref);
    }
    return ref;
  }, []);

  useEffect(() => {
    const targets = [...elements.current.values()];
    if (!unread || !targets.length || typeof IntersectionObserver === "undefined") {
      setInView(false);
      return;
    }
    const visible = new Set<Element>();
    let read = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setInView(visible.size > 0);
        if (visible.size && !read) {
          read = true;
          void fetch(`/api/campaigns/${campaignId}/whispers/read`, { method: "POST" }).then(() => refreshWhispers());
        }
      },
      { threshold: 0.4 },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [unread, watched, campaignId, refreshWhispers]);

  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (lastUnread.current !== null && unread > lastUnread.current) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        // No vibration on this phone; the action box's pointer says it.
      }
    }
    lastUnread.current = unread;
  }, [unread, loaded]);

  // The first unread exchange, brought into view from the action box.
  const jump = useCallback(() => {
    const target = elements.current.values().next().value;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, []);

  return { watchRef, away: unread > 0 && !inView, jump };
}
