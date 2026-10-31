"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { CouchFace } from "@/components/couch/CouchParts";

// Playing on after a death (docs/couch-mode-spec.md 2.12), on the phone of
// the player whose character died: in the Story view, where their action box
// was, the people in the story they can play from now on (the ones the crew
// has met first), and someone new for when nobody fits. One tap reads a
// card, a second takes them over. While the GM writes them up the panel
// says so; the new character then takes over the phone by itself, from the
// stream.

type Choice = { key: string; name: string; role: string; look: string; portraitUrl: string | null; met: boolean; where: string };
type View = {
  fallen: { id: string; name: string } | null;
  choices: Choice[];
  pending: { name: string; status: "writing" | "failed"; error: string } | null;
};

const SOMEONE_NEW = "new";
// While the GM writes, how often the phone looks again. The stream's sheet
// event usually lands first.
const WRITING_POLL_MS = 3000;

export function CouchTakeover({ campaignId, sheet, signal }: { campaignId: string; sheet: CharacterSheet; signal: string }) {
  const headingId = useId();
  const { view, error, take, busy } = useTakeover(campaignId, signal);
  const [chosen, setChosen] = useState("");
  const writing = view?.pending?.status === "writing";
  const failed = view?.pending?.status === "failed" ? view.pending.error : "";
  const shown = error || failed;
  return (
    <section className="couch-card couch-takeover" aria-labelledby={headingId}>
      <div className="couch-takeover-head">
        <CouchFace src={sheet.portrait?.url} name={sheet.name} size="48px" />
        <div className="grid min-w-0 gap-0.5">
          <h2 id={headingId} className="couch-takeover-title">
            {sheet.name} is dead
          </h2>
          {sheet.crewRole ? <p className="couch-me-role">{sheet.crewRole}</p> : null}
        </div>
      </div>
      {writing ? (
        <div className="couch-takeover-writing" role="status">
          <span className="couch-pulse" aria-hidden="true" />
          <div className="grid gap-1">
            <p className="font-semibold">
              {view?.pending?.name === "Someone new" ? "Someone new is joining the crew…" : `${view?.pending?.name} is joining the crew…`}
            </p>
            <p className="couch-muted text-[0.95rem]">The GM is writing who they are and what they want. Your phone switches over by itself.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="couch-muted">You play on. Choose who to play from now on: the GM brings them into the crew.</p>
          {shown ? (
            <p role="alert" className="couch-error">
              {shown}
            </p>
          ) : null}
          {!view ? (
            <p className="couch-muted" role="status">
              Looking for who is still around…
            </p>
          ) : (
            <ul className="couch-crew-list" aria-label="Who you can play">
              {[...view.choices, null].map((choice) => {
                const key = choice?.key ?? SOMEONE_NEW;
                const open = chosen === key;
                const name = choice?.name ?? "Someone new";
                return (
                  <li key={key} className="couch-card couch-crew" data-state={open ? "chosen" : "open"}>
                    <button
                      type="button"
                      className="couch-crew-head w-full text-left"
                      aria-expanded={open}
                      disabled={busy}
                      onClick={() => setChosen(open ? "" : key)}
                    >
                      <CouchFace src={choice?.portraitUrl} name={choice ? name : "+"} size="56px" />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="couch-me-name">{name}</span>
                        <span className="couch-me-role">{choice ? choice.role || "In the story" : "A survivor the story has not met yet"}</span>
                        {choice ? (
                          <span className="couch-label">{choice.met ? (choice.where ? `Met · ${choice.where}` : "Met") : "Not met yet"}</span>
                        ) : null}
                      </span>
                    </button>
                    {open && choice?.look ? <p className="couch-crew-story">{choice.look}</p> : null}
                    {open && !choice ? (
                      <p className="couch-crew-story">The GM writes someone who fits where the crew is now.</p>
                    ) : null}
                    {open ? (
                      <button type="button" className="couch-btn couch-btn-primary w-full" disabled={busy} onClick={() => void take(key)}>
                        {busy ? "Sending…" : choice ? `Play as ${name}` : "Play someone new"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function useTakeover(campaignId: string, signal: string) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/couch/takeover`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<View>) : null))
      .then((value) => {
        if (!cancelled && value) setView(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [campaignId, signal, version]);

  const writing = view?.pending?.status === "writing";
  useEffect(() => {
    if (!writing) return;
    const timer = window.setInterval(() => setVersion((current) => current + 1), WRITING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [writing]);

  const take = useCallback(
    async (choice: string) => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/couch/takeover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          setError(data.error || "That did not work. Try again.");
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
        setVersion((current) => current + 1);
      }
    },
    [campaignId],
  );

  return { view, error, take, busy };
}
