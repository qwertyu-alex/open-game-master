"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { CouchFace } from "@/components/couch/CouchParts";
import { latestNarration } from "@/components/couch/couch-logic";
import { actName } from "@/lib/couch/prompt-logic";
import {
  crewRevealMs,
  finaleSpeech,
  finaleStepMs,
  finaleSteps,
  minutesWords,
  OUTCOME_WORDS,
  VERDICT_BEAT_MS,
  VERDICT_WORDS,
  type CouchFinale,
  type FinaleCrew,
  type FinaleStep,
} from "@/lib/couch/finale-logic";

// The night's closing on the TV (src/lib/couch/finale-logic.ts,
// docs/couch-mode-spec.md 2.2 "Finale reveal"): once the GM's last passage
// has been heard, the screen goes dark and walks the room through the end
// card, the story in a few beats, each crew member in turn (their fate,
// their agendas act by act with whether they pulled them off, their story
// points, and the hidden role stamped last), what was really going on, the
// GM's review with its grade, and a board that stays up. Each step moves on
// by itself at a pace read from across the room; the laptop's arrow keys
// step back and forward for whoever sits at it. Nothing on it is touched.
//
// The night's own pictures carry it: the last scene behind the end card,
// one full-screen picture per recap beat, each crew member's moment behind
// them, and a wall of the night behind the review. The narrator reads every
// step (src/lib/couch/finale-voice.ts) through the table's own narration,
// so mute and volume hold, and a step moves on when its clip ends; without
// a voice it stays up for as long as it takes to read.

// How long the TV waits for the closing passage's voice before it stops
// waiting: a voice that never comes must not hold the end back all night.
const VOICE_HOLD_MAX_MS = 120_000;
// After the last words, a breath before the screen goes dark.
const AFTER_VOICE_MS = 1800;

export function CouchTvFinale({ state, narration, ttsOn }: { state: CampaignState; narration: NarrationAudio; ttsOn: boolean }) {
  const ended = state.campaign?.status === "ended";
  const held = useClosingHeld(state, narration, ttsOn, ended);
  if (!ended || held) return null;
  const view = state.couchFinale;
  if (view?.status === "ready" && state.campaign) {
    return <FinaleShow campaignId={state.campaign.id} finale={view.finale} voiceKey={view.voice ?? ""} narration={narration} ttsOn={ttsOn} />;
  }
  return (
    <section className="couch-finale" aria-label="The end" aria-live="polite">
      <div className="couch-finale-end">
        <span className="couch-label">{state.campaign?.title}</span>
        <h2 className="couch-finale-the-end">The end</h2>
        <p className="couch-finale-writing">
          <span className="couch-pulse" aria-hidden="true" />
          The GM is writing the closing…
        </p>
      </div>
    </section>
  );
}

// Whether the closing waits on the GM's last passage: while its voice is
// queued or playing (at most two minutes), a breath after it stops, and
// without a voice as long as it takes to read. A TV that opens on a night
// already over shows the closing at once.
function useClosingHeld(state: CampaignState, narration: NarrationAudio, ttsOn: boolean, ended: boolean): boolean {
  const [openedEnded] = useState(ended);
  const [released, setReleased] = useState(false);
  const [heard, setHeard] = useState(false);
  const last = latestNarration(state.messages);
  const voice = last ? state.narrationStatus[last.id]?.state : undefined;
  const voicing = ttsOn && !narration.muted && Boolean(last) && (narration.playingMessageId === last?.id || voice === "queued" || voice === "generating");
  if (ended && voicing && !heard) setHeard(true);
  const readMs = last ? Math.min(30_000, 2000 + last.content.split(/\s+/).length * 300) : 0;
  const waiting = ended && !openedEnded && !released;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setReleased(true), voicing ? VOICE_HOLD_MAX_MS : heard ? AFTER_VOICE_MS : readMs);
    return () => window.clearTimeout(timer);
  }, [waiting, voicing, heard, readMs]);
  return waiting;
}

// After a step's clip ends, a breath before the next.
const STEP_BREATH_MS = 1200;
// A clip that never starts or never ends must not stop the closing.
const CLIP_GRACE_MS = 45_000;

function FinaleShow({
  campaignId,
  finale,
  voiceKey,
  narration,
  ttsOn,
}: {
  campaignId: string;
  finale: CouchFinale;
  voiceKey: string;
  narration: NarrationAudio;
  ttsOn: boolean;
}) {
  const steps = useMemo(() => finaleSteps(finale), [finale]);
  // run: bumped on every move, so stepping back to a step reads it again.
  const [at, setAt] = useState({ index: 0, run: 0 });
  const index = Math.min(at.index, steps.length - 1);
  const step = steps[index];
  const last = index >= steps.length - 1;
  const words = finaleSpeech(step, finale);
  const clipId = `couch-finale-${voiceKey}-${index}-${at.run}`;
  const voiced = ttsOn && Boolean(voiceKey) && !narration.muted && narration.unlocked && Boolean(words);
  const readMs = finaleStepMs(step, finale);
  // A crew step stays up until its verdicts and its secret have landed,
  // however soon the voice is done.
  const minMs = step.kind === "crew" && finale.crew[step.index] ? crewRevealMs(finale.crew[step.index]) : 3000;
  const { play, skip, playingMessageId, playbackFailure } = narration;

  const move = (delta: number) => setAt((current) => ({ index: Math.max(0, Math.min(steps.length - 1, current.index + delta)), run: current.run + 1 }));

  // Start the step: its clip, or its reading time. The board is not read
  // and never moves on.
  const startedAt = useRef(0);
  const playing = useRef("");
  useEffect(() => {
    startedAt.current = window.performance.now();
    if (last && !words) return;
    if (voiced) {
      playing.current = clipId;
      play(clipId, `/api/campaigns/${campaignId}/couch/finale?step=${index}&v=${voiceKey}`);
      const grace = window.setTimeout(() => move(1), readMs + CLIP_GRACE_MS);
      return () => window.clearTimeout(grace);
    }
    if (!readMs) return;
    const timer = window.setTimeout(() => move(1), readMs);
    return () => window.clearTimeout(timer);
    // move is stable in effect (it only uses setAt and steps.length).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, voiced]);

  // The clip ended: a breath (or what is left of the step's reveal), then
  // the next step. One that failed to play holds for its reading time.
  const heard = useRef("");
  useEffect(() => {
    if (!voiced) return;
    if (playingMessageId === clipId) {
      heard.current = clipId;
      return;
    }
    const failed = playbackFailure === clipId;
    if (heard.current !== clipId && !failed) return;
    heard.current = "";
    if (last) return;
    const elapsed = window.performance.now() - startedAt.current;
    const wait = failed ? Math.max(0, readMs - elapsed) : Math.max(STEP_BREATH_MS, minMs - elapsed);
    const timer = window.setTimeout(() => move(1), wait);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiced, playingMessageId, playbackFailure, clipId, last, readMs, minMs]);

  // A closing taken off the screen (a new night) takes its voice with it.
  useEffect(() => () => skip(playing.current), [skip]);

  // The laptop's arrows, for whoever sits at it: back and on, cutting the
  // voice of the step it leaves.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    skip(clipId);
    move(event.key === "ArrowRight" ? 1 : -1);
  });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const backdrop = stepBackdrop(step, finale);
  return (
    <section className="couch-finale" aria-label={`The end of ${finale.title}`} aria-live="polite" data-outcome={finale.outcome} data-step={step.kind}>
      {backdrop.length === 1 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={backdrop[0]} className="couch-finale-backdrop" src={backdrop[0]} alt="" aria-hidden="true" />
      ) : backdrop.length ? (
        <div className="couch-finale-wall" aria-hidden="true">
          {backdrop.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" />
          ))}
        </div>
      ) : null}
      <FinaleStepView key={`${step.kind}:${index}:${at.run}`} step={step} finale={finale} />
      {step.kind !== "board" ? (
        <ol className="couch-finale-progress" aria-hidden="true">
          {steps.map((entry, place) => (
            <li key={place} data-on={place === index ? "" : undefined} data-past={place < index ? "" : undefined} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

// The picture (or wall of pictures) behind a step: none behind the truth,
// which is told in the dark.
function stepBackdrop(step: FinaleStep, finale: CouchFinale): string[] {
  const pictures = finale.pictures;
  const one = (url: string | null | undefined) => (url ? [url] : []);
  switch (step.kind) {
    case "end":
    case "board":
      return one(pictures?.end);
    case "recap":
      return one(pictures?.recap[step.index]);
    case "crew":
      return one(finale.crew[step.index]?.moment);
    case "review":
      return pictures?.review ?? [];
    case "truth":
      return [];
  }
}

function FinaleStepView({ step, finale }: { step: FinaleStep; finale: CouchFinale }) {
  switch (step.kind) {
    case "end":
      return (
        <div className="couch-finale-end">
          <span className="couch-label">{finale.title}</span>
          <h2 className="couch-finale-the-end">The end</h2>
          <p className="couch-finale-headline">{finale.headline}</p>
          <span className="couch-finale-outcome">{OUTCOME_WORDS[finale.outcome]}</span>
        </div>
      );
    case "recap":
      return (
        <div className="couch-finale-beat">
          <span className="couch-label">
            What happened · {step.index + 1} of {finale.recap.length}
          </span>
          <p>{finale.recap[step.index]}</p>
        </div>
      );
    case "crew": {
      const member = finale.crew[step.index];
      return member ? <FinaleMember member={member} /> : null;
    }
    case "truth":
      return (
        <div className="couch-finale-card couch-finale-truth">
          <span className="couch-label">What was really going on</span>
          <p>{finale.truth}</p>
        </div>
      );
    case "review":
      return finale.review ? <FinaleReviewView finale={finale} /> : null;
    case "board":
      return <FinaleBoard finale={finale} />;
  }
}

// One crew member: who they were and how they ended, then each agenda,
// its verdict landing a beat after it is read, then the hidden role.
function FinaleMember({ member }: { member: FinaleCrew }) {
  const roleAt = 1400 + member.agendas.length * (VERDICT_BEAT_MS + 600);
  return (
    <div className="couch-finale-member" data-dead={member.dead ? "" : undefined}>
      <div className="couch-finale-portrait">
        <CouchFace src={member.portraitUrl} name={member.name} size="100%" />
        {member.dead ? <span className="couch-finale-stamp" data-tone="danger">Dead</span> : null}
      </div>
      <div className="couch-finale-member-text">
        <span className="couch-label">{member.crewRole || "Crew"}</span>
        <h2>{member.name}</h2>
        <p className="couch-finale-fate">{member.fate}</p>
        {member.agendas.length ? (
          <ol className="couch-finale-agendas" aria-label={`${member.name}'s secret agendas`}>
            {member.agendas.map((agenda, at) => (
              <li key={agenda.act} style={{ animationDelay: `${900 + at * (VERDICT_BEAT_MS + 600)}ms` }}>
                <span className="couch-finale-agenda-act">{actName(agenda.act)}</span>
                <span className="couch-finale-agenda-text">{agenda.text}</span>
                {agenda.verdict ? (
                  <span
                    className="couch-finale-verdict"
                    data-verdict={agenda.verdict}
                    style={{ animationDelay: `${900 + at * (VERDICT_BEAT_MS + 600) + VERDICT_BEAT_MS}ms` }}
                  >
                    {VERDICT_WORDS[agenda.verdict]}
                  </span>
                ) : null}
                {agenda.line ? <span className="couch-finale-agenda-line">{agenda.line}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="couch-finale-member-foot" style={{ animationDelay: `${roleAt}ms` }}>
          <span className="couch-finale-points">
            <b>{member.storyPoints}</b> story {member.storyPoints === 1 ? "point" : "points"}
          </span>
          {member.award ? <span className="couch-finale-award">{member.award}</span> : null}
        </div>
        {member.hiddenRole ? (
          <p className="couch-finale-hidden" style={{ animationDelay: `${roleAt + 1200}ms` }}>
            <span className="couch-label">Secretly</span>
            {member.hiddenRole}
          </p>
        ) : null}
        {member.highlight ? (
          <p className="couch-finale-highlight" style={{ animationDelay: `${roleAt + (member.hiddenRole ? 2600 : 1200)}ms` }}>
            {member.highlight}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FinaleReviewView({ finale }: { finale: CouchFinale }) {
  const review = finale.review!;
  return (
    <div className="couch-finale-review">
      <div className="couch-finale-grade" data-grade={review.grade} aria-label={`Grade ${review.grade}`}>
        {review.grade}
      </div>
      <div className="couch-finale-review-text">
        <span className="couch-label">The GM&rsquo;s review</span>
        {review.title ? <h2>{review.title}</h2> : null}
        <p className="couch-finale-commentary">{review.commentary}</p>
        <dl>
          {review.bestMove ? (
            <div>
              <dt className="couch-label">Best call</dt>
              <dd>{review.bestMove}</dd>
            </div>
          ) : null}
          {review.missed ? (
            <div>
              <dt className="couch-label">You missed</dt>
              <dd>{review.missed}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

// What stays up once the closing has played: the crew, their awards and
// whether they made it, and the night in numbers.
function FinaleBoard({ finale }: { finale: CouchFinale }) {
  const stats = finale.stats;
  const numbers = [
    { label: "Played", value: minutesWords(stats.minutes) },
    { label: "Ended in", value: actName(stats.act) },
    { label: "Rolls", value: String(stats.rolls) },
    { label: "Natural 20s", value: String(stats.nat20s) },
    { label: "Natural 1s", value: String(stats.nat1s) },
    { label: "Fights", value: String(stats.fights) },
    { label: "Dead", value: String(stats.deaths) },
  ];
  return (
    <div className="couch-finale-board">
      <div className="couch-finale-board-head">
        <span className="couch-label">{finale.title} · {OUTCOME_WORDS[finale.outcome]}</span>
        <h2>{finale.headline}</h2>
        {finale.review ? (
          <span className="couch-finale-board-grade">
            <b data-grade={finale.review.grade}>{finale.review.grade}</b>
            {finale.review.title}
          </span>
        ) : null}
      </div>
      <ul className="couch-finale-board-crew" aria-label="The crew">
        {finale.crew.map((member) => (
          <li key={member.characterId} data-dead={member.dead ? "" : undefined}>
            <CouchFace src={member.portraitUrl} name={member.name} size="clamp(4rem, 7vw, 8rem)" />
            <strong>{member.name}</strong>
            <span className="couch-finale-board-award">{member.award || (member.dead ? "Did not make it" : "Made it out")}</span>
            <span className="couch-finale-board-tally">
              {member.agendas.filter((agenda) => agenda.verdict === "done").length}/{member.agendas.length} agendas · {member.storyPoints} pts
            </span>
            {member.hiddenRole ? <span className="couch-finale-board-hidden">Secretly {member.hiddenRole}</span> : null}
          </li>
        ))}
      </ul>
      <dl className="couch-finale-numbers">
        {numbers.map((entry) => (
          <div key={entry.label}>
            <dt className="couch-label">{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// The host's own end, among the TV's host buttons, for a night the GM has
// not ended: the room has to leave, or the story ran past its ending. It
// was only on the upstream session screen before. Asked once more, since
// it cannot be undone.
export function CouchTvEndNight({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = async () => {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "The night could not be ended. Try again.");
    }
  };
  return (
    <Dialog.Root onOpenChange={() => setError("")}>
      <Dialog.Trigger asChild>
        <button type="button" className="couch-tv-control">End the night</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="couch-tv-join-overlay" />
        <Dialog.Content className="couch couch-tv-join-dialog">
          <Dialog.Title>End the night now?</Dialog.Title>
          <Dialog.Description>
            The TV shows the closing: what happened, everyone&rsquo;s agendas, the hidden role and the GM&rsquo;s review. The phones stop taking moves. This cannot be undone.
          </Dialog.Description>
          {error ? <p role="alert" className="couch-finale-error">{error}</p> : null}
          <div className="couch-finale-dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="couch-btn">Keep playing</button>
            </Dialog.Close>
            <button type="button" className="couch-btn couch-finale-end-btn" onClick={end} disabled={busy}>
              {busy ? "Ending…" : "End the night"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
