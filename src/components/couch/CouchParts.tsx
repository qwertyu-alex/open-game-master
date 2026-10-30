"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SheetAgenda } from "@/lib/schemas/sheet";
import { actNumeral, healthView, maskSecret } from "@/components/couch/couch-logic";

// The small pieces both couch screens share (docs/couch-mode-spec.md 2.6,
// 2.7): a face, a health bar, and the agenda that only shows while held.

// The frame every couch phone screen shares: a bar held to the top (the
// title, or the play screen's own), the column and an optional dock held to
// the foot.
export function CouchPhoneShell({
  title,
  bar,
  children,
  dock,
}: {
  title: string;
  bar?: ReactNode;
  children: ReactNode;
  dock?: ReactNode;
}) {
  useCalmBackdrop();
  return (
    <div className="couch couch-phone">
      <header className="couch-bar">
        {bar ?? (
          <div className="couch-col">
            <h1 className="couch-bar-title">{title}</h1>
          </div>
        )}
      </header>
      <main className="couch-col couch-main">{children}</main>
      {dock}
    </div>
  );
}

// The app's backdrop (the contour canvas redrawn twenty times a second, the
// drifting dust, the star field) sits under every page. A couch phone covers
// it whole, and on an iPhone that hidden canvas, redrawn under two pinned
// bars, made the screen flicker and parts of it drop out. The canvas stops
// drawing and the layers go while a couch phone is up (couch-phone.css,
// TopoBackground.tsx).
function useCalmBackdrop() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.backdrop = "off";
    return () => {
      delete root.dataset.backdrop;
    };
  }, []);
}

// A portrait, or the name's first letter on a plain tile. Never a stand-in
// painting: the table's placeholders are fantasy plates, and a wrong face is
// worse than none on a sci-fi night.
export function CouchFace({ src, name, size }: { src: string | null | undefined; name: string; size?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = size ? ({ "--face": size } as CSSProperties) : undefined;
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="couch-face" style={style} onError={() => setFailed(src)} />
    );
  }
  return (
    <span className="couch-face couch-face-initial" style={style} aria-hidden="true">
      {Array.from(name.trim())[0] ?? "?"}
    </span>
  );
}

export function CouchHp({ current, max, label }: { current: number; max: number; label?: string }) {
  const { pct, tone } = healthView(current, max);
  return (
    <div
      className="couch-hp"
      data-tone={tone}
      role="meter"
      aria-label={label ?? "Health"}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, current)}
      aria-valuetext={`${Math.max(0, current)} of ${max}`}
      style={{ "--pct": `${pct}%` } as CSSProperties}
    >
      <i />
    </div>
  );
}

// Press and hold to read; let go and it is a smudge again. Pointer and
// keyboard alike (Space or Enter held), and losing focus or the pointer
// hides it, so it is never left open on a phone set down on the couch.
export function HoldToReveal({
  label,
  hint = "Press and hold to read",
  children,
  masked,
}: {
  // What the button is, for a screen reader: "Your secret agenda".
  label: string;
  hint?: string;
  // The secret itself, shown only while held.
  children: ReactNode;
  // The same shape with none of the words, shown blurred otherwise.
  masked: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const hintId = useId();
  const show = () => setRevealed(true);
  const hide = () => setRevealed(false);
  return (
    <button
      type="button"
      className="couch-secret"
      data-revealed={revealed ? "" : undefined}
      aria-label={label}
      aria-describedby={hintId}
      aria-pressed={revealed}
      onPointerDown={(event) => {
        show();
        // Keeps the press on this button while the finger drifts a little.
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the press still shows.
        }
      }}
      onPointerUp={hide}
      onPointerCancel={hide}
      onLostPointerCapture={hide}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          show();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          hide();
        }
      }}
      // A long press would otherwise open the browser's own menu.
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
    >
      <span className="couch-secret-text" aria-hidden={!revealed} aria-live={revealed ? "polite" : undefined}>
        {revealed ? children : masked}
      </span>
      <span id={hintId} className="couch-secret-hint">
        {hint}
      </span>
    </button>
  );
}

export function agendaAct(agenda: NonNullable<SheetAgenda>): number {
  return Math.max(0, Math.min(agenda.acts.length - 1, agenda.act));
}

// The agenda card: the act's mission and, for one crew member, who they
// really are; both behind the hold. Held down it is a few blacked-out lines,
// a redacted file rather than a blur: nothing to read, and no filter for a
// phone to redraw.
export function AgendaCard({ agenda, fresh = false }: { agenda: NonNullable<SheetAgenda>; fresh?: boolean }) {
  const act = agendaAct(agenda);
  const current = agenda.acts[act] ?? "";
  const role = agenda.hiddenRole.trim();
  const titleId = useId();
  const secret = (
    <>
      <span>{current}</span>
      {role ? (
        <span>
          <span className="couch-label">Who you really are</span>
          <br />
          {role}
        </span>
      ) : null}
    </>
  );
  const masked = (
    <>
      <span>
        <span className="couch-redact">{maskSecret(current)}</span>
      </span>
      {role ? (
        <span>
          <span className="couch-redact">{maskSecret(role)}</span>
        </span>
      ) : null}
    </>
  );
  return (
    <section className="couch-card couch-agenda" aria-labelledby={titleId}>
      <div className="couch-agenda-head">
        <h2 id={titleId} className="couch-label">
          Agenda — Act {actNumeral(act)}
          {fresh ? <span className="couch-secret-new"> · new</span> : null}
        </h2>
        <StoryPoints count={agenda.storyPoints} />
      </div>
      <HoldToReveal label={`Your secret agenda for act ${act + 1}`} masked={masked}>
        {secret}
      </HoldToReveal>
    </section>
  );
}

// Whether this act's agenda is still unread on this phone. Kept per
// character in the browser, so a reload does not mark it new again and a
// new act does. A new act also buzzes the phone (Android; iOS Safari has no
// vibration), since the agenda now waits behind a button.
export function useAgendaFresh(sheetId: string, act: number | null): { fresh: boolean; markSeen: () => void } {
  const key = `couch-agenda-seen:${sheetId}`;
  const [seen, setSeen] = useState<number | null>(() => readSeenAct(key));
  const fresh = act !== null && (seen === null || seen < act);
  const lastAct = useRef(act);
  useEffect(() => {
    if (act === null || lastAct.current === null || act <= lastAct.current) {
      lastAct.current = act;
      return;
    }
    lastAct.current = act;
    try {
      navigator.vibrate?.([120, 80, 120]);
    } catch {
      // No vibration here; the button's mark says it.
    }
  }, [act]);
  const markSeen = useCallback(() => {
    if (act === null) return;
    setSeen(act);
    try {
      window.localStorage.setItem(key, String(act));
    } catch {
      // Private browsing without storage: it reads as new again next load.
    }
  }, [act, key]);
  return { fresh, markSeen };
}

function readSeenAct(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    const value = stored === null ? NaN : Number(stored);
    return Number.isInteger(value) ? value : null;
  } catch {
    return null;
  }
}

function StoryPoints({ count }: { count: number }) {
  const shown = Math.min(count, 5);
  return (
    <span className="couch-points" aria-label={`${count} story ${count === 1 ? "point" : "points"}`}>
      <span aria-hidden="true">Story points</span>
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: Math.max(shown, 3) }, (_, index) => (
          <i key={index} data-on={index < shown ? "" : undefined} />
        ))}
      </span>
      {count > 5 ? <span aria-hidden="true">+{count - 5}</span> : null}
    </span>
  );
}
