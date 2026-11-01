"use client";

import { useEffect, useState } from "react";
import { CouchFace } from "@/components/couch/CouchParts";
import {
  actBreakMs,
  earnedWords,
  ACT_BREAK_CREW_MS,
  ACT_BREAK_LEAD_MS,
  ACT_BREAK_POINT_MS,
  NEW_AGENDA_LINE,
  type CouchActBreak,
} from "@/lib/couch/act-break-logic";

// The act break on the TV (src/lib/couch/act-break-logic.ts): "End of Act
// I", the story so far one point at a time, then the crew one by one with
// the story points their agendas earned this act (never the agendas), and
// the reminder that every phone holds a new one. Paced to be read from the
// couch while the narrator reads the same words. Shown for a break newer
// than its own length, so a TV reloaded during it picks it up and one
// opened later does not replay it.

const crewOf = (actBreak: CouchActBreak) => actBreak.crew ?? [];

// The break on screen now, or null; while there is one, CouchTv holds the
// new act's title card back, so the title lands after the break.
export function useActBreakShowing(actBreak: CouchActBreak | null): CouchActBreak | null {
  const [showing, setShowing] = useState<string | null>(null);
  const id = actBreak?.id ?? null;
  const ends = actBreak ? actBreak.at + actBreakMs(actBreak.points.length, crewOf(actBreak).length) : 0;
  useEffect(() => {
    if (!id) return;
    const left = ends - Date.now();
    if (left <= 0) return;
    const timers = [window.setTimeout(() => setShowing(id), 0), window.setTimeout(() => setShowing(null), left)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [id, ends]);
  return actBreak && showing === actBreak.id ? actBreak : null;
}

export function CouchTvActBreak({ actBreak }: { actBreak: CouchActBreak }) {
  const crew = crewOf(actBreak);
  // The roll call follows the last story point.
  const rollAt = (actBreak.points.length ? ACT_BREAK_LEAD_MS + actBreak.points.length * ACT_BREAK_POINT_MS : ACT_BREAK_LEAD_MS) - 1200;
  return (
    <section className="couch-act-break" aria-label={`End of ${actBreak.ended}, before ${actBreak.next}`} aria-live="polite">
      <div className="couch-act-break-card">
        <span className="couch-label">End of {actBreak.ended}</span>
        {actBreak.points.length ? (
          <>
            <h2>The story so far</h2>
            <ol>
              {actBreak.points.map((point, index) => (
                // Each point arrives as the one before has had its time.
                <li key={point} style={{ animationDelay: `${ACT_BREAK_LEAD_MS - 1200 + index * ACT_BREAK_POINT_MS}ms` }}>
                  {point}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <h2>{actBreak.next} begins</h2>
        )}
        {crew.length ? (
          <ul className="couch-act-break-crew" aria-label="Story points this act">
            {crew.map((member, index) => (
              <li key={member.characterId} data-earned={member.earned ? "" : undefined} style={{ animationDelay: `${rollAt + index * ACT_BREAK_CREW_MS}ms` }}>
                <CouchFace src={member.portraitUrl} name={member.name} />
                <span className="couch-act-break-name">{member.name}</span>
                <span className="couch-act-break-earned">{earnedWords(member)}</span>
                <span className="couch-act-break-total">{member.total} total</span>
              </li>
            ))}
          </ul>
        ) : null}
        {crew.length ? (
          <p className="couch-act-break-agendas" style={{ animationDelay: `${rollAt + crew.length * ACT_BREAK_CREW_MS}ms` }}>
            {NEW_AGENDA_LINE}
          </p>
        ) : null}
      </div>
    </section>
  );
}
