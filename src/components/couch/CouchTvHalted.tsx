"use client";

import { useState } from "react";
import { retryHaltedTurn } from "@/app/campaigns/[campaignId]/HaltedTurnBanner";

// A GM turn that crashed, on the room's screen (couchHaltedTurn). The TV is
// the lead's account, so it can send the GM back in where it stopped, as the
// transcript's banner does on the host screens. The notice leaves when the
// retry is claimed (its dmTurnId goes) or a passage lands after it. The
// button stays up while the mouse rests: it is the one thing the room needs.
export function CouchTvHalted({ campaignId, turnId, reason }: { campaignId: string; turnId: string; reason: string }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setError(await retryHaltedTurn(campaignId, turnId));
    setRetrying(false);
  }

  return (
    <section className="couch-tv-halted" aria-label="The GM hit a problem">
      <span className="couch-label">The GM hit a problem</span>
      {reason ? <p className="couch-tv-halted-reason">{reason}</p> : null}
      <button type="button" className="couch-tv-halted-retry" onClick={retry} disabled={retrying}>
        {retrying ? "Picking the thread back up…" : "Retry the turn"}
      </button>
      {error ? (
        <p role="alert" className="couch-tv-halted-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
