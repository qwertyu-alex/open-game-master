"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { CouchFace } from "@/components/couch/CouchParts";
import { CouchTvJoinCorner } from "@/components/couch/CouchTvJoin";
import type { CouchCrewCard, CouchRoster } from "@/components/couch/couch-logic";
import { briefingIntroduction, crewIntroduction, introReadMs, splitFlaw } from "@/lib/couch/intro-logic";

// The night's opening on the TV (docs/couch-mode-spec.md 2.6): before any
// phone may pick, the narrator reads the briefing over the cover, then
// introduces each crew member over their portrait: who they are aboard,
// their backstory, their temper, the thing they carry, and how they stand
// with the others. The phones follow along and open the cards when it ends.
//
// The lead's TV drives it: each step plays its clip through the table's own
// narration (so mute, volume and the ambience's ducking all hold), and when
// the clip ends, after a breath, the server is told to move on. Without a
// voice (narration off, muted, or a clip that failed) a step stays up for
// as long as it takes to read. A crew step waits a little for its portrait
// while the painter is still at work, so nobody is introduced as a letter.

const BREATH_MS = 1400;
const PORTRAIT_WAIT_MS = 15_000;

export function CouchTvIntro({
  campaignId,
  roster,
  narration,
  ttsOn,
  drives,
  inviteCode,
  onMoved,
}: {
  campaignId: string;
  roster: CouchRoster;
  narration: NarrationAudio;
  ttsOn: boolean;
  drives: boolean;
  inviteCode: string;
  onMoved: () => void;
}) {
  const { step, total, key } = roster.intro;
  const title = roster.scenario?.title ?? "";
  const card = step > 0 ? (roster.crew[step - 1] ?? null) : null;
  const words = card ? crewIntroduction({ ...card, gender: "" }) : briefingIntroduction(title, roster.scenario?.briefing ?? "");
  const clipId = `couch-intro-${key}-${step}`;
  const voiced = ttsOn && !narration.muted;
  const painting = roster.crew.some((entry) => entry.portraitUrl);

  // A crew step whose portrait has not landed holds for a while, when the
  // painter has finished others (a server with none never holds).
  const [waitedFor, setWaitedFor] = useState(-1);
  useEffect(() => {
    if (!card || card.portraitUrl || !painting) return;
    const timer = window.setTimeout(() => setWaitedFor(step), PORTRAIT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [card, painting, step]);
  const portraitReady = !card || Boolean(card.portraitUrl) || !painting || waitedFor === step;
  // With a voice, the browser must have heard a click first; the shell's
  // "Tap to start sound" asks for it, and the briefing waits for it.
  const soundReady = !voiced || narration.unlocked;

  const move = useCallback(
    async (from: number, to: number) => {
      await fetch(`/api/campaigns/${campaignId}/couch/intro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      }).catch(() => undefined);
      onMoved();
    },
    [campaignId, onMoved],
  );

  // One timer at a time, dropped whenever the step changes.
  const timer = useRef<number | undefined>(undefined);
  const later = useCallback((ms: number, then: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(then, ms);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), [step]);

  // Start the step: its clip, or its reading time.
  const started = useRef("");
  const { play, playingMessageId, playbackFailure, unlocked } = narration;
  useEffect(() => {
    if (!drives || step >= total || !portraitReady || !soundReady || started.current === clipId) return;
    started.current = clipId;
    if (voiced) {
      play(clipId, `/api/campaigns/${campaignId}/couch/intro?step=${step}&v=${key}`);
    } else {
      later(introReadMs(words), () => void move(step, step + 1));
    }
  }, [drives, step, total, portraitReady, soundReady, clipId, voiced, play, campaignId, key, words, later, move]);

  // The clip ended: a breath, then the next step. One that failed is read
  // on the screen for its reading time instead. One the browser held back
  // for a click is not over: the click plays it.
  const heard = useRef("");
  useEffect(() => {
    if (!drives) return;
    if (playingMessageId === clipId) {
      heard.current = clipId;
      return;
    }
    if (heard.current !== clipId) return;
    heard.current = "";
    if (!unlocked) return;
    later(playbackFailure === clipId ? introReadMs(words) : BREATH_MS, () => void move(step, step + 1));
  }, [drives, playingMessageId, playbackFailure, unlocked, clipId, words, step, later, move]);

  const next = () => {
    window.clearTimeout(timer.current);
    narration.skip(clipId);
    void move(step, step + 1);
  };
  const skipAll = () => {
    window.clearTimeout(timer.current);
    narration.skip(clipId);
    void move(step, total);
  };

  return (
    <div className="couch-tv-intro" data-kind={card ? "crew" : "briefing"}>
      {card ? (
        <CrewSpotlight key={card.id} card={card} crew={roster.crew} index={step - 1} waiting={!portraitReady} />
      ) : (
        <section key="briefing" className="couch-tv-intro-briefing" aria-label="Tonight's story">
          <span className="couch-label">Tonight&apos;s one-shot</span>
          <h1 className="couch-tv-lobby-title">{title}</h1>
          {roster.scenario?.logline ? <p className="couch-tv-lobby-logline">{roster.scenario.logline}</p> : null}
          {roster.scenario?.briefing ? <p className="couch-tv-intro-brief">{roster.scenario.briefing}</p> : null}
        </section>
      )}
      <ol className="couch-tv-intro-strip" aria-label="The crew">
        {roster.crew.map((entry, index) => (
          <li
            key={entry.id}
            data-state={index + 1 === step ? "now" : index + 1 < step ? "met" : "next"}
            aria-current={index + 1 === step ? "step" : undefined}
          >
            <CouchFace src={entry.portraitUrl} name={entry.name} />
            <span className="couch-tv-intro-strip-name">{entry.name}</span>
          </li>
        ))}
      </ol>
      <CouchTvJoinCorner inviteCode={inviteCode} note="Choosing opens after the introductions" />
      {drives ? (
        <div className="couch-tv-controls couch-tv-intro-controls">
          <button type="button" className="couch-tv-control" onClick={next}>
            {step + 1 >= total ? "Done" : "Next"}
          </button>
          <button type="button" className="couch-tv-control" onClick={skipAll}>
            Skip to choosing
          </button>
        </div>
      ) : null}
    </div>
  );
}

// One crew member, big: the portrait on the left, slowly closing in; who
// they are on the right, and how they stand with the rest of the crew.
function CrewSpotlight({
  card,
  crew,
  index,
  waiting,
}: {
  card: CouchCrewCard;
  crew: CouchCrewCard[];
  index: number;
  waiting: boolean;
}) {
  const { traits, flaw } = splitFlaw(card.personality);
  return (
    <article className="couch-tv-intro-crew" aria-label={card.name}>
      <figure className="couch-tv-intro-portrait">
        {card.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.portraitUrl} alt={`${card.name}'s portrait`} />
        ) : (
          <span className="couch-tv-intro-initial" aria-hidden="true">
            {Array.from(card.name.trim())[0] ?? "?"}
          </span>
        )}
        {waiting ? <figcaption className="couch-tv-intro-painting">Painting the portrait…</figcaption> : null}
      </figure>
      <div className="couch-tv-intro-who">
        <span className="couch-label">
          The crew · {index + 1} of {crew.length}
        </span>
        <h1 className="couch-tv-intro-name">{card.name}</h1>
        {card.crewRole ? <p className="couch-tv-intro-role">{card.crewRole}</p> : null}
        {card.backstory ? <p className="couch-tv-intro-story">{card.backstory}</p> : null}
        <dl className="couch-tv-intro-facts">
          {traits ? (
            <div>
              <dt>Temper</dt>
              <dd>{traits}</dd>
            </div>
          ) : null}
          {flaw ? (
            <div>
              <dt>Flaw</dt>
              <dd>{flaw}</dd>
            </div>
          ) : null}
          {card.signatureItem ? (
            <div>
              <dt>Carries</dt>
              <dd>{card.signatureItem}</dd>
            </div>
          ) : null}
        </dl>
        {card.ties.length ? (
          <ul className="couch-tv-intro-ties" aria-label={`${card.name} and the crew`}>
            {card.ties.map((tie) => {
              const other = crew.find((entry) => entry.name === tie.to);
              return (
                <li key={tie.to}>
                  <CouchFace src={other?.portraitUrl} name={tie.to} />
                  <span>
                    <span className="couch-tv-intro-tie-name">{tie.to}</span>
                    <span className="couch-tv-intro-tie-line">{tie.line}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
