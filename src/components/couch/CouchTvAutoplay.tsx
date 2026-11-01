"use client";

import { useEffect, useState } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { couchGmStatus, tvTurnSeats } from "@/components/couch/couch-logic";

// Stand-in players for testing, in the TV's host controls (the server half
// is src/lib/couch/autoplay.ts): Play a turn writes a move for everyone the
// GM is waiting on, throws their rolls and answers their truces; Autoplay
// presses it again after each passage, so a night plays itself out. Shown
// only where the server allows it (development, or COUCH_AUTOPLAY=1).

// How long Autoplay leaves the room after the narrator stops, so the last
// line is heard before the crew answers it.
const SETTLE_MS = 1500;

export function CouchTvAutoplay({ state, narration }: { state: CampaignState; narration: NarrationAudio }) {
  const campaignId = state.campaign?.id ?? "";
  const storageKey = `couch-autoplay:${campaignId}`;
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  // Kept per tab, so a reload carries on and a new night starts off.
  const [auto, setAuto] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(storageKey) === "1");
  // The beat Autoplay last pressed for and found nothing to do in, so it
  // waits for the night to change instead of asking again every render.
  const [triedBeat, setTriedBeat] = useState("");

  useEffect(() => {
    if (!campaignId) return;
    let live = true;
    fetch(`/api/campaigns/${campaignId}/couch/autoplay`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ allowed?: boolean }>) : null))
      .then((data) => live && setAllowed(Boolean(data?.allowed)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [campaignId]);

  useEffect(() => {
    if (!said) return;
    const timer = window.setTimeout(() => setSaid(""), 4000);
    return () => window.clearTimeout(timer);
  }, [said]);

  async function play(beat: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/couch/autoplay`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { played?: string[]; refused?: string[]; idle?: string; error?: string };
      if (!response.ok) {
        setSaid(data.error || "Could not play a turn.");
        return;
      }
      const played = data.played ?? [];
      const refused = data.refused ?? [];
      // Nothing went through: wait for the night to change before trying again.
      if (!played.length) setTriedBeat(beat);
      setSaid(
        played.length
          ? `Played ${played.length === 1 ? "one move" : `${played.length} moves`}${refused.length ? `, ${refused.length} refused` : ""}`
          : refused[0] || data.idle || "Nothing to play.",
      );
      for (const line of played) console.info(`[autoplay] ${line}`);
      for (const line of refused) console.warn(`[autoplay] refused: ${line}`);
    } catch {
      setSaid("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  // What the night owes the stand-ins now: a move, a roll or a truce answer.
  const sheets = state.sheets ?? [];
  const waiting = tvTurnSeats({
    floor: state.campaign?.floor ?? { mode: "open" },
    gmIdle: couchGmStatus(state) === "idle",
    waitingOn: state.tableWait?.waitingOn ?? [],
    names: Object.fromEntries(sheets.map((sheet) => [sheet.userId, sheet.name])),
  });
  const owed = waiting.length > 0 || state.pendingRolls.length > 0 || state.couchTruce?.status === "open";
  const beat = [state.messages.at(-1)?.seq ?? 0, state.pendingRolls.map((roll) => roll.id).join(","), state.couchTruce?.id ?? "", waiting.map((seat) => seat.userId).join(",")].join("|");
  const quiet = !narration.playingMessageId && narration.held === 0;
  const ready = allowed && auto && !busy && state.campaign?.status === "active" && owed && quiet && triedBeat !== beat;

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void play(beat), SETTLE_MS);
    return () => window.clearTimeout(timer);
    // play reads the latest props when it runs; the beat is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, beat]);

  if (!allowed || state.campaign?.status !== "active") return null;
  const toggle = () => {
    const next = !auto;
    setAuto(next);
    setTriedBeat("");
    window.sessionStorage.setItem(storageKey, next ? "1" : "0");
  };
  return (
    <>
      <button
        type="button"
        className="couch-tv-control"
        onClick={() => void play(beat)}
        disabled={busy}
        title="Write a move for everyone the GM is waiting on (a development tool)"
      >
        {busy ? "Playing…" : "Play a turn"}
      </button>
      <button
        type="button"
        className="couch-tv-control"
        aria-pressed={auto}
        onClick={toggle}
        title="Keep playing a turn for the crew after each passage until turned off"
      >
        {auto ? "Autoplay on" : "Autoplay"}
      </button>
      <span className="couch-tv-control-note" aria-live="polite">
        {said}
      </span>
    </>
  );
}
