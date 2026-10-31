"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CampaignState, PendingRoll } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { buzz, onShake, supportsShake } from "@/lib/dice/shake-to-roll";
import { couchRollCall } from "@/lib/couch/roll-feedback-logic";
import { groupTally } from "@/lib/couch/group-check-logic";
import type { CharacterSheet } from "@/lib/schemas/sheet";

// The phone's roll screen (docs/couch-mode-spec.md 2.10). When the GM calls
// for this player's roll, the phone turns into the die: what the roll is
// for, then one big die that says Roll, and the numbers in a line under it.
// Nothing to type and nothing to choose. The server draws the number the
// moment it is thrown (a held roll, src/lib/dice/held-rolls.ts), the TV,
// which has been showing the call since it parked, throws the same faces
// in 3D, and the phone shows the result once the TV has had time to land it.
//
// Mount it once and unconditionally inside the couch phone: it renders
// nothing until a roll waits on this player, and it outlives the roll so
// the result can show.

// The TV's dice take about this long to fly and settle; the phone holds
// the number back until then so the room sees it land first.
const REVEAL_AFTER_MS = 3200;
// The result closes on its own, back to the story.
const CLOSE_AFTER_MS = 7000;

type Thrown = { pendingId: string; at: number };

export function CouchRollPrompt({ state, sheet }: { state: CampaignState; sheet: CharacterSheet }) {
  const meId = state.me?.id ?? "";
  const campaignId = state.campaign?.id ?? "";
  const waiting = state.pendingRolls.filter((pending) => pending.userId === meId);
  const [thrown, setThrown] = useState<Thrown | null>(null);
  // Stable, so the stream's every update does not restart the close timer.
  const close = useCallback(() => setThrown(null), [setThrown]);
  const current = waiting.find((pending) => pending.id !== thrown?.pendingId);
  if (thrown) {
    const landed = state.couchRolls.find((entry) => entry.pendingId === thrown.pendingId);
    return (
      <ThrownSheet
        key={thrown.pendingId}
        thrown={thrown}
        landed={landed ?? null}
        name={sheet.name}
        nextUp={Boolean(current)}
        close={close}
      />
    );
  }
  // A group check's roll says so: everyone is throwing, and how many must
  // make it (src/lib/couch/group-check.ts).
  const group = current && state.couchGroup?.members.some((member) => member.pendingId === current.id) ? groupTally(state.couchGroup) : null;
  return current ? (
    <RollSheet
      key={current.id}
      campaignId={campaignId}
      pending={current}
      sheet={sheet}
      group={group}
      onThrown={() => setThrown({ pendingId: current.id, at: Date.now() })}
    />
  ) : null;
}

const D20 = "M50 3 96 29v52l-46 26L4 81V29Z M50 3 25 40l25 45 25-45Z M4 29l21 11L4 81l46 4 46-4-21-41 21-11 M50 85v22";
const D6 = "M8 12h84v86H8Z";
// The die's silhouette, filled under its facet lines: the facets cross each
// other, so filling them alone leaves holes behind the word Roll.
const D20_BODY = "M50 3 96 29v52l-46 26L4 81V29Z";

function RollSheet({ campaignId, pending, sheet, group = null, onThrown }: {
  campaignId: string;
  pending: PendingRoll;
  sheet: CharacterSheet;
  group?: ReturnType<typeof groupTally> | null;
  onThrown: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = couchRollCall(pending, sheet.name);
  const sides = Number(/d(\d+)/.exec(call.formula)?.[1] ?? 20);
  // A shake throws it too, where the phone reports motion without asking:
  // over plain HTTP on the cabin LAN, or behind iOS's permission prompt, it
  // never does, so the hint offers it only where it works.
  const [canShake] = useState(() => supportsShake() && window.isSecureContext &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission !== "function");
  const sent = useRef(false);

  async function throwIt() {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    setError("");
    buzz();
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/pending-rolls/${pending.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallback: "digital" }),
      });
      if (response.ok) {
        onThrown();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "The roll did not go through. Tap Roll to try again.");
    } catch {
      setError("Could not reach the server. Tap Roll to try again.");
    }
    sent.current = false;
    setBusy(false);
  }

  const throwRef = useRef(throwIt);
  useEffect(() => {
    throwRef.current = throwIt;
  });
  useEffect(() => {
    if (!canShake) return;
    return onShake(() => void throwRef.current());
  }, [canShake]);

  return (
    <div className="couch-roll-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="couch-roll-sheet-body">
        <span className="couch-label">{group ? `Group check · ${sheet.name}, your roll` : `${sheet.name}, your roll`}</span>
        <h2 id={titleId} className="couch-roll-sheet-title">{call.what}</h2>
        {pending.reason.trim() ? <p className="couch-roll-sheet-why">{pending.reason}</p> : null}
        <button
          type="button"
          className="couch-roll-die"
          data-busy={busy ? "" : undefined}
          onClick={() => void throwIt()}
          disabled={busy}
          // The roll is the only thing this screen is for.
          autoFocus
          aria-describedby={`${titleId}-odds ${titleId}-hint`}
        >
          <svg viewBox="0 0 100 110" fill="none" aria-hidden="true">
            <path className="couch-roll-die-body" d={sides === 6 ? D6 : D20_BODY} />
            <path d={sides === 6 ? D6 : D20} />
          </svg>
          <span className="couch-roll-die-face">
            {busy ? <Loader2 className="size-9 animate-spin" aria-hidden="true" /> : "Roll"}
          </span>
          {busy ? <span className="sr-only">Throwing</span> : null}
        </button>
        <p id={`${titleId}-odds`} className="couch-roll-sheet-odds">
          {call.formula}
          {call.target !== null ? ` · need ${call.target} or more` : ""}
        </p>
        {group && group.count > 1 ? (
          <p className="couch-roll-sheet-group">
            Everyone rolls. {group.needed === group.count ? `All ${group.count}` : `${group.needed} of ${group.count}`} of you must make it.
          </p>
        ) : null}
        {call.edge ? <p className="couch-roll-sheet-edge">{call.edge}</p> : null}
        <p id={`${titleId}-hint`} className="couch-roll-sheet-hint">
          {canShake ? "Tap Roll or shake your phone." : "Tap Roll."} The dice land on the TV for everyone.
        </p>
        {error ? <p className="couch-error" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}

function ThrownSheet({ thrown, landed, name, nextUp, close }: {
  thrown: Thrown;
  landed: CampaignState["couchRolls"][number] | null;
  name: string;
  nextUp: boolean;
  close: () => void;
}) {
  const titleId = useId();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), Math.max(0, thrown.at + REVEAL_AFTER_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [thrown.at]);
  const shown = revealed && landed;
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(close, CLOSE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [shown, close]);
  // A roll the server could not present (behind the GM's screen) has no
  // number to show; the TV and the story carry on without it.
  useEffect(() => {
    if (!revealed || landed) return;
    const timer = window.setTimeout(close, 4000);
    return () => window.clearTimeout(timer);
  }, [revealed, landed, close]);
  return (
    <div className="couch-roll-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="couch-roll-sheet-body" role="status" aria-live="polite">
        {shown ? (
          <>
            <span className="couch-label">{landed.label}</span>
            <h2 id={titleId} className="couch-roll-sheet-total">{landed.roll.total}</h2>
            <strong className="couch-roll-sheet-verdict" data-good={landed.good ? "" : undefined} data-bad={landed.bad ? "" : undefined}>
              {landed.verdict}
            </strong>
            <span className="couch-roll-sheet-math">
              {landed.math}
              {landed.target !== null ? ` · target ${landed.target}` : ""}
            </span>
            <button type="button" className="couch-btn couch-btn-primary couch-roll-sheet-close" onClick={close} autoFocus>
              {nextUp ? "Next roll" : "Back to the story"}
            </button>
          </>
        ) : (
          <>
            <span className="couch-label">{name}</span>
            <h2 id={titleId} className="couch-roll-sheet-title">Look at the TV</h2>
            <div className="couch-roll-die" data-busy="" aria-hidden="true">
              <svg viewBox="0 0 100 110" fill="none">
                <path d={D20} />
              </svg>
            </div>
            <p className="couch-roll-sheet-hint">Your dice are rolling for the whole room.</p>
          </>
        )}
      </div>
    </div>
  );
}
