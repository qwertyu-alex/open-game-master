"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignState, PendingRoll } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { CouchFace } from "@/components/couch/CouchParts";
import { COUCH_DICE_TRAY_ID, useCouchDice, type CouchDice } from "@/components/couch/useCouchDice";
import { couchRollCall, couchRollVoiceId, type CouchRollFeedback } from "@/lib/couch/roll-feedback-logic";

// The TV's dice (docs/couch-mode-spec.md 2.10). While the GM waits on a crew
// member's roll, the TV shows the call: who, what for, the dice and the
// target. When their phone throws it, the dice tumble across the scene and
// land on the server's faces, and the result follows. Several rolls can
// land in one tool call: keep them in order instead of replacing an attack
// with its damage before anyone can read the attack.
export function CouchRolls({ state, narration }: { state: CampaignState; narration: NarrationAudio }) {
  const dice = useCouchDice({ volume: narration.volume * 0.8, on: narration.unlocked && !narration.muted });
  const [through, setThrough] = useState(() => state.lastSeq);
  const next = state.couchRolls.find((entry) => entry.seq > through);
  const seq = next?.seq ?? through;
  const { clear } = dice;
  const complete = useCallback(() => {
    clear();
    setThrough(seq);
  }, [clear, seq]);
  // A roll behind the GM's screen waits like any other, but is not called
  // out on the room's screen.
  const calls = state.pendingRolls.filter((pending) => (pending as { visibility?: string }).visibility !== "secret");
  return (
    <>
      <div id={COUCH_DICE_TRAY_ID} className="couch-dice-tray" aria-hidden="true" />
      {next ? (
        <RollStage key={next.roll.id} feedback={next} state={state} narration={narration} dice={dice} complete={complete} />
      ) : calls.length ? (
        <RollCalls calls={calls} state={state} />
      ) : null}
    </>
  );
}

// How long a called roll waits before the host may throw it for an absent
// player: a phone that went flat must not stall the night.
const HOST_ROLL_AFTER_MS = 45_000;

function RollCalls({ calls, state }: { calls: PendingRoll[]; state: CampaignState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const shown = calls.slice(0, 4);
  return (
    <section className="couch-tv-call" role="status" aria-label="Rolls the GM is waiting on">
      <span className="couch-label">{shown.length === 1 ? "Roll called" : `${shown.length} rolls called`}</span>
      <ul className="couch-tv-call-list">
        {shown.map((pending) => (
          <RollCallCard
            key={pending.id}
            pending={pending}
            sheet={state.sheets.find((sheet) => sheet.id === pending.characterId)}
            campaignId={state.campaign?.id ?? ""}
            hostMayRoll={state.caps.steersStory && now - new Date(pending.createdAt).getTime() > HOST_ROLL_AFTER_MS}
          />
        ))}
      </ul>
    </section>
  );
}

function RollCallCard({ pending, sheet, campaignId, hostMayRoll }: {
  pending: PendingRoll;
  sheet: CharacterSheet | undefined;
  campaignId: string;
  hostMayRoll: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = sheet?.name ?? "A crew member";
  const call = couchRollCall(pending, sheet?.name);
  async function rollFor() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/pending-rolls/${pending.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallback: "digital" }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not roll it.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="couch-tv-call-card">
      <div className="couch-tv-call-who">
        <CouchFace src={sheet?.portrait?.url} name={name} />
        <span className="grid min-w-0 gap-1">
          <strong>{name}</strong>
          <span className="couch-tv-call-what">{call.what}</span>
        </span>
      </div>
      {pending.reason.trim() ? <p className="couch-tv-call-why">{pending.reason}</p> : null}
      <div className="couch-tv-call-facts">
        <span>
          <span className="couch-label">Dice</span>
          <b>{call.formula}</b>
        </span>
        {call.target !== null ? (
          <span>
            <span className="couch-label">Target</span>
            <b>{call.target}</b>
          </span>
        ) : null}
      </div>
      {call.edge ? <p className="couch-tv-call-edge">{call.edge}</p> : null}
      <p className="couch-tv-call-wait">
        <span className="couch-pulse" aria-hidden="true" />
        {name} throws from their phone
      </p>
      {hostMayRoll ? (
        <button type="button" className="couch-btn" disabled={busy} onClick={() => void rollFor()}>
          Roll for {name}
        </button>
      ) : null}
      {error ? <p className="couch-error" role="alert">{error}</p> : null}
    </li>
  );
}

type Phase = "announce" | "rolling" | "result";
// How the dice show: the 3D tray, the card's own flat die where the tray
// cannot play, or nothing yet while the tray decides.
type DiceShow = "pending" | "three" | "flat";

function RollStage({ feedback, state, narration, dice, complete }: {
  feedback: CouchRollFeedback;
  state: CampaignState;
  narration: NarrationAudio;
  dice: CouchDice;
  complete: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("announce");
  const [show, setShow] = useState<DiceShow>("pending");
  const heard = useRef(false);
  const resultHeard = useRef(false);
  const soundRef = useRef<HTMLAudioElement | null>(null);
  // A roll thrown from a phone was called aloud when it parked: the stage
  // waits only for that call to finish speaking, then throws.
  const thrown = Boolean(feedback.pendingId);
  const announceId = feedback.pendingId ? couchRollVoiceId(feedback.pendingId, "call") : couchRollVoiceId(feedback.roll.id, "announce");
  const resultId = couchRollVoiceId(feedback.roll.id, "result");
  const playing = narration.playingMessageId;
  const voice = Boolean(state.campaign?.gameSettings.ttsEnabled) && !narration.muted && narration.unlocked;
  const status = state.narrationStatus[announceId]?.state;
  const failed = status === "failed" || status === "skipped" || narration.playbackFailure === announceId;

  useEffect(() => () => soundRef.current?.pause(), []);
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.volume = narration.volume * 0.55;
      if (narration.muted) soundRef.current.pause();
    }
  }, [narration.muted, narration.volume]);

  useEffect(() => {
    if (phase !== "announce") return;
    if (voice && playing === announceId) {
      heard.current = true;
      return;
    }
    if (thrown || heard.current || (voice && playing === resultId)) {
      setPhase("rolling");
      return;
    }
    // The previous passage or another crew member's roll is still being
    // spoken. Its audio owns the screen's pace, not the synthesis clock.
    if (voice && playing && !failed) return;
    const readingMs = Math.max(2800, Math.min(9000, feedback.announcement.split(/\s+/).length * 250));
    const timer = window.setTimeout(() => setPhase("rolling"), voice && !failed && status ? 15000 : readingMs);
    return () => window.clearTimeout(timer);
  }, [phase, thrown, voice, playing, announceId, resultId, failed, status, feedback.announcement]);

  const { throwDice } = dice;
  const roll = feedback.roll;
  useEffect(() => {
    if (phase !== "rolling") return;
    let live = true;
    let timer = 0;
    void throwDice(roll).then((threw) => {
      if (!live) return;
      if (threw) {
        setShow("three");
        setPhase("result");
        return;
      }
      setShow("flat");
      // The flat die tumbles with one of the shipped dice samples. Sound is
      // cosmetic and a blocked browser must never stop the result.
      if (narration.unlocked && !narration.muted && !soundRef.current) {
        const sound = new Audio("/dice-box/sounds/dicehit/dicehit_plastic7.mp3");
        soundRef.current = sound;
        sound.volume = narration.volume * 0.55;
        void sound.play().catch(() => {});
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timer = window.setTimeout(() => setPhase("result"), reduced ? 0 : 1100);
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // Thrown once per stage; the sound settings are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, throwDice, roll]);

  useEffect(() => {
    if (phase !== "result") return;
    if (voice && playing === resultId) {
      resultHeard.current = true;
      return;
    }
    if (voice && resultHeard.current) {
      complete();
      return;
    }
    const resultStatus = state.narrationStatus[resultId]?.state;
    const waiting = voice && (resultStatus === "queued" || resultStatus === "generating");
    const timer = window.setTimeout(complete, waiting ? 15000 : 7000);
    return () => window.clearTimeout(timer);
  }, [phase, voice, playing, resultId, complete, state.narrationStatus]);

  return <CouchRollCard feedback={feedback} phase={phase} dice={phase === "announce" ? "flat" : show} />;
}

export function CouchRollCard({ feedback, phase, dice = "flat" }: { feedback: CouchRollFeedback; phase: Phase; dice?: DiceShow }) {
  const faces = feedback.roll.breakdown.terms.filter((term) => term.kind === "dice").flatMap((term) => term.dice).filter((die) => die.kept).slice(0, 4);
  return (
    <section className="couch-tv-roll" data-phase={phase} data-dice={dice} aria-label="Dice roll" role="status" aria-live="polite" aria-atomic="true">
      <span className="couch-label">{phase === "announce" ? "Roll coming up" : phase === "rolling" ? "Rolling…" : feedback.verdict}</span>
      <strong className="couch-tv-roll-lead">{feedback.label}</strong>
      {dice === "flat" ? (
        <div className="couch-dice" aria-hidden="true">
          {faces.map((die, index) => (
            <div key={index} className="couch-die">
              <svg viewBox="0 0 100 110" fill="none">
                <path d={die.sides === 6 ? "M8 12h84v86H8Z" : "M50 3 96 29v52l-46 26L4 81V29Z M50 3 25 40l25 45 25-45Z M4 29l21 11L4 81l46 4 46-4-21-41 21-11 M50 85v22"} />
              </svg>
              <span>{phase === "result" ? die.value : "?"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {phase === "result" ? (
        <>
          <span className="couch-tv-roll-total">{feedback.roll.total}<small> total</small></span>
          <strong className="couch-tv-roll-verdict" data-good={feedback.good ? "" : undefined} data-bad={feedback.bad ? "" : undefined}>{feedback.verdict}</strong>
          <span className="couch-tv-roll-math">{feedback.math}</span>
          <span className="couch-tv-roll-explain">{feedback.target !== null ? `Target ${feedback.target} · ${feedback.roll.kind === "attack" ? feedback.verdict : feedback.good ? "Target met" : "Target missed"}` : feedback.roll.kind === "initiative" ? "Higher rolls act earlier" : feedback.roll.kind === "damage" ? "Defenses may change health lost" : "The GM explains what happens next"}</span>
        </>
      ) : phase === "announce" ? (
        <p className="couch-tv-roll-explain">{feedback.announcement}</p>
      ) : null}
    </section>
  );
}
