"use client";

import { useEffect, useState } from "react";
import { CouchFace } from "@/components/couch/CouchParts";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { truceAsks, type CouchTruce } from "@/lib/couch/truce-logic";

// A truce in a couch fight (docs/couch-mode-spec.md 2.11). The TV holds up
// the offer and fills in each answer as the phones send it; the phone of
// everyone asked carries the two buttons, whoever's move it is. Nothing on
// the TV is the room's to press.

// How long a settled truce stays up on the TV after its last answer.
const SETTLED_MS = 9000;

const ANSWER_WORDS = { waiting: "Deciding…", accept: "Accepts", refuse: "Fights on" } as const;

// Whether the TV shows this truce: while it waits on answers, and for a
// moment once settled live (a reload never brings a settled one back).
export function useTruceShown(truce: CouchTruce | null): CouchTruce | null {
  const [gone, setGone] = useState<string | null>(null);
  const key = truce && truce.status !== "open" ? `${truce.id}:${truce.status}` : null;
  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(() => setGone(key), SETTLED_MS);
    return () => window.clearTimeout(timer);
  }, [key]);
  return truce && (!key || gone !== key) ? truce : null;
}

export function CouchTvTruce({ truce, sheets }: { truce: CouchTruce; sheets: readonly CharacterSheet[] }) {
  const face = (id: string) => sheets.find((sheet) => sheet.id === id)?.portrait?.url;
  const result =
    truce.status === "accepted" ? "The truce holds" : truce.status === "refused" ? "The fight goes on" : null;
  return (
    <section className="couch-truce-tv" data-status={truce.status} role="status" aria-live="polite" aria-label="Truce">
      <div className="couch-truce-tv-head">
        <CouchFace src={face(truce.offeredBy.characterId)} name={truce.offeredBy.name} />
        <span className="couch-truce-tv-text">
          <span className="couch-label">Truce offered</span>
          <strong>{truce.offeredBy.name} offers a truce</strong>
          {truce.terms.trim() ? <span className="couch-truce-tv-terms">“{truce.terms.trim()}”</span> : null}
        </span>
      </div>
      <ul className="couch-truce-tv-answers">
        {truce.members.map((member) => (
          <li key={member.characterId} data-answer={member.answer}>
            <CouchFace src={face(member.characterId)} name={member.name} />
            <strong>{member.name}</strong>
            <span>{ANSWER_WORDS[member.answer]}</span>
          </li>
        ))}
      </ul>
      {result ? <strong className="couch-truce-tv-result">{result}</strong> : <p className="couch-truce-tv-hint">Answer on your phone</p>}
    </section>
  );
}

// The phone's card, over the turn line: Accept or Fight on for a crew
// member the truce asks, what they answered and who it still waits on once
// they have, and the offerer's own wait. Nothing for anyone else.
export function CouchPhoneTruce({ campaignId, truce, myCharacterIds }: {
  campaignId: string;
  truce: CouchTruce | null;
  myCharacterIds: ReadonlySet<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!truce || truce.status !== "open") return null;
  const asked = truceAsks(truce, myCharacterIds);
  const offering = myCharacterIds.has(truce.offeredBy.characterId);
  if (!asked && !offering) return null;
  const waitingOn = truce.members.filter((member) => member.answer === "waiting" && member.characterId !== asked?.characterId).map((member) => member.name);
  const waitLine = waitingOn.length ? `Waiting on ${waitingOn.join(", ")}.` : "";

  async function answer(accept: boolean) {
    if (!truce) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/couch/truce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truceId: truce.id, accept }),
      });
      if (!response.ok && response.status !== 409) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not send your answer.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const terms = truce.terms.trim();
  return (
    <section className="couch-truce-phone" aria-label="Truce">
      <span className="couch-label">Truce</span>
      {offering ? (
        <>
          <strong className="couch-truce-phone-title">You offered a truce</strong>
          <p className="couch-truce-phone-line">{waitLine || "Everyone has answered."}</p>
        </>
      ) : asked?.answer === "waiting" ? (
        <>
          <strong className="couch-truce-phone-title">{truce.offeredBy.name} offers a truce</strong>
          {terms ? <p className="couch-truce-phone-terms">“{terms}”</p> : null}
          <p className="couch-truce-phone-line">If everyone accepts, the fight stops. It doesn&apos;t use your turn.</p>
          <div className="couch-truce-phone-actions" role="group" aria-label="Your answer to the truce">
            <button type="button" className="couch-btn couch-btn-primary" disabled={busy} onClick={() => void answer(true)}>
              Accept truce
            </button>
            <button type="button" className="couch-btn" disabled={busy} onClick={() => void answer(false)}>
              Fight on
            </button>
          </div>
          {error ? <p className="couch-error" role="alert">{error}</p> : null}
        </>
      ) : (
        <>
          <strong className="couch-truce-phone-title">You accepted the truce</strong>
          <p className="couch-truce-phone-line">{waitLine || "Everyone has answered."}</p>
        </>
      )}
    </section>
  );
}
