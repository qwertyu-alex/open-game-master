"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { CouchFace } from "@/components/couch/CouchParts";
import type { CouchDice } from "@/components/couch/useCouchDice";
import { couchGroupVoiceId, groupTally, type CouchGroupCheck } from "@/lib/couch/group-check-logic";

// The TV's group check (docs/couch-mode-spec.md 2.10). One card for the
// whole crew: what everyone rolls, the target and how many must make it,
// and a place for each crew member that fills as their phone throws. The
// dice land one after another in the tray even when the phones throw at
// once, so each is seen; the narrator read the call once, and reads the
// verdict once when the last die is in. Nothing on it is the room's to press
// except the host's stand-in throw for a phone that went quiet.

type Group = CouchGroupCheck & { seq: number };

// As long as a single roll waits before the host may throw it.
const HOST_ROLL_AFTER_MS = 45_000;

export function CouchGroupStage({ group, state, narration, dice, complete }: {
  group: Group;
  state: CampaignState;
  narration: NarrationAudio;
  dice: CouchDice;
  complete: () => void;
}) {
  // Who has been shown landing. Those already in when the card mounts (a TV
  // that reloaded mid-check) are shown at once, without a throw.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(
    () => new Set(group.members.filter((member) => member.state !== "waiting").map((member) => member.characterId)),
  );
  const throwing = useRef<string | null>(null);
  const { throwDice, clear } = dice;

  const landed = group.members.find((member) => member.state !== "waiting" && !revealed.has(member.characterId));
  useEffect(() => {
    if (!landed || throwing.current) return;
    throwing.current = landed.characterId;
    const entry = state.couchRolls.find((roll) => roll.roll.id === landed.rollId);
    let live = true;
    const reveal = () => {
      if (!live) return;
      throwing.current = null;
      setRevealed((before) => new Set([...before, landed.characterId]));
    };
    if (!entry) {
      reveal();
      return;
    }
    clear();
    void throwDice(entry.roll).then((threw) => {
      if (threw) reveal();
      else window.setTimeout(reveal, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
    });
    return () => {
      live = false;
      throwing.current = null;
    };
    // One throw per crew member; the stream's other updates must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed?.characterId, throwDice, clear]);

  const shown = { ...group, members: group.members.map((member) => revealed.has(member.characterId) ? member : { ...member, state: "waiting" as const }) };
  const tally = groupTally(shown);
  const over = group.status === "done" && tally.waiting === 0;

  // The verdict holds while the narrator reads it, then the card goes.
  const resultId = couchGroupVoiceId(group.id, "result");
  const voice = Boolean(state.campaign?.gameSettings.ttsEnabled) && !narration.muted && narration.unlocked;
  const playing = narration.playingMessageId;
  const heard = useRef(false);
  useEffect(() => {
    if (!over) return;
    if (voice && playing === resultId) {
      heard.current = true;
      return;
    }
    if (voice && heard.current) {
      complete();
      return;
    }
    const status = state.narrationStatus[resultId]?.state;
    const waiting = voice && (status === "queued" || status === "generating");
    const timer = window.setTimeout(complete, waiting ? 15000 : 8000);
    return () => window.clearTimeout(timer);
  }, [over, voice, playing, resultId, complete, state.narrationStatus]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (over) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [over]);
  const quiet = group.members.filter((member) => member.state === "waiting" && member.pendingId &&
    state.pendingRolls.some((pending) => pending.id === member.pendingId));
  const hostMayRoll = !over && state.caps.steersStory && quiet.length > 0 && now - new Date(group.createdAt).getTime() > HOST_ROLL_AFTER_MS;

  const share = tally.count === 1 ? "" : tally.needed === tally.count ? `All ${tally.count} must make it` : `${tally.needed} of ${tally.count} must make it`;
  return (
    <section className="couch-tv-group" data-over={over ? "" : undefined} role="status" aria-label="Group check" aria-live="polite">
      <span className="couch-label">Group check</span>
      <h2 className="couch-tv-group-what">{group.what}</h2>
      {group.reason.trim() ? <p className="couch-tv-call-why">{group.reason}</p> : null}
      <div className="couch-tv-call-facts">
        <span>
          <span className="couch-label">Target</span>
          <b>{group.dc}</b>
        </span>
        {share ? (
          <span>
            <span className="couch-label">{share}</span>
            <b>{tally.passes} made it</b>
          </span>
        ) : null}
      </div>
      <ul className="couch-tv-group-crew">
        {shown.members.map((member) => {
          const sheet = state.sheets.find((entry) => entry.id === member.characterId);
          const decider = over && tally.count > 2 && member.characterId === group.decidedBy;
          return (
            <li key={member.characterId} className="couch-tv-group-member" data-state={member.state} data-decider={decider ? "" : undefined}>
              <CouchFace src={sheet?.portrait?.url} name={member.name} />
              <strong>{member.name}</strong>
              {member.state === "waiting" ? (
                <span className="couch-tv-group-wait">
                  <span className="couch-pulse" aria-hidden="true" />
                  {landed?.characterId === member.characterId ? "Rolling…" : "Waiting"}
                </span>
              ) : (
                <>
                  <span className="couch-tv-group-total">{member.total ?? "—"}</span>
                  <span className="couch-tv-group-verdict">
                    {member.total === null ? "Out" : member.state === "pass" ? "Made it" : "Missed"}
                  </span>
                  {decider ? <span className="couch-tv-group-decider">Decided it</span> : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {over ? (
        <strong className="couch-tv-group-result" data-good={tally.passed ? "" : undefined} data-bad={tally.passed ? undefined : ""}>
          {tally.passed ? "The group succeeds" : "The group fails"}
        </strong>
      ) : (
        <p className="couch-tv-call-wait">
          <span className="couch-pulse" aria-hidden="true" />
          Everyone throws from their phone
        </p>
      )}
      {hostMayRoll ? <HostRoll campaignId={state.campaign?.id ?? ""} pendingIds={quiet.map((member) => member.pendingId as string)} /> : null}
    </section>
  );
}

// The host throws for every phone still quiet, as the single call's
// "Roll for" does for one.
function HostRoll({ campaignId, pendingIds }: { campaignId: string; pendingIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function rollFor() {
    setBusy(true);
    setError("");
    try {
      for (const id of pendingIds) {
        const response = await fetch(`/api/campaigns/${campaignId}/pending-rolls/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fallback: "digital" }),
        });
        // A phone that threw a moment ago answers 409; the rest still go.
        if (!response.ok && response.status !== 409) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          setError(data.error || "Could not roll it.");
          break;
        }
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="couch-btn" disabled={busy} onClick={() => void rollFor()}>
        {pendingIds.length === 1 ? "Roll for the last one" : `Roll for the ${pendingIds.length} still waiting`}
      </button>
      {error ? <p className="couch-error" role="alert">{error}</p> : null}
    </>
  );
}
