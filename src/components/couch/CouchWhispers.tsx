"use client";

import { Lock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { DmWhisper } from "@/lib/db/dm-whispers";
import { privateThread } from "@/components/couch/phone-logic";

// The GM's private line to this phone (docs/couch-mode-spec.md 2.2, 2.7):
// what send_whisper told this player alone ("the motion tracker shows
// something only you can see"), under the story where the player is
// reading, never folded away while unread. Nothing shows until there is a
// message: a player writes to the GM from the action box's Private mode,
// which "Reply privately" opens. A new whisper buzzes the phone it was sent
// to.
export function CouchWhispers({
  campaignId,
  whispers,
  unread,
  loaded,
  refreshWhispers,
  onReply,
}: {
  campaignId: string;
  whispers: DmWhisper[];
  unread: number;
  loaded: boolean;
  refreshWhispers: () => Promise<void>;
  onReply: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const { shown, hidden } = privateThread(whispers, showAll);

  // Read once the card is actually on screen, not merely loaded.
  useEffect(() => {
    const card = cardRef.current;
    if (!unread || !card || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void fetch(`/api/campaigns/${campaignId}/whispers/read`, { method: "POST" }).then(() => refreshWhispers());
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [unread, campaignId, refreshWhispers]);

  // A whisper that lands after the page has its backlog buzzes the phone.
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (lastUnread.current !== null && unread > lastUnread.current) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        // No vibration on this phone; the card's highlight says it.
      }
    }
    lastUnread.current = unread;
  }, [unread, loaded]);

  if (!whispers.length) {
    return null;
  }
  return (
    <section ref={cardRef} className="couch-private" data-unread={unread ? "" : undefined} aria-labelledby={titleId}>
      <div className="couch-private-head">
        <h2 id={titleId} className="couch-label inline-flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden="true" />
          Only you
        </h2>
        {unread ? <span className="couch-private-new">{unread} new</span> : null}
      </div>
      {hidden ? (
        <button type="button" className="couch-link justify-self-start text-sm" onClick={() => setShowAll(true)}>
          Show {hidden} earlier
        </button>
      ) : null}
      <ul className="grid gap-2" aria-live="polite">
        {shown.map((whisper) => (
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
                  : "You to the GM · waiting"
                : whisper.recipientNames.length > 1
                  ? `The GM, to you and ${whisper.recipientNames.length - 1} other${whisper.recipientNames.length > 2 ? "s" : ""}`
                  : "The GM, to you alone"}
            </small>
            {whisper.content}
          </li>
        ))}
      </ul>
      <button type="button" className="couch-btn couch-private-reply" onClick={onReply}>
        <Lock className="size-4" aria-hidden="true" />
        Reply privately
      </button>
    </section>
  );
}
