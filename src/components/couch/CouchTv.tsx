"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { HandoutStage } from "@/components/HandoutStage";
import { SceneTitle } from "@/components/SceneTitle";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { useTableAudio } from "@/app/campaigns/[campaignId]/useTableAudio";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { CouchFace, CouchHp } from "@/components/couch/CouchParts";
import { CouchTvLobby } from "@/components/couch/CouchTvLobby";
import { TvPictures } from "@/components/couch/CouchTvPictures";
import { CouchTvJoinButton } from "@/components/couch/CouchTvJoin";
import { CouchTvAnswers } from "@/components/couch/CouchTvAnswers";
import { CouchTvHalted } from "@/components/couch/CouchTvHalted";
import { CouchRolls } from "@/components/couch/CouchRolls";
import { CouchMapRail } from "@/components/couch/CouchNavigation";
import { couchAnswersVisible } from "@/lib/couch/answers-logic";
import {
  couchHaltedTurn,
  gmStatusWords,
  latestNarration,
  previousSubtitlePages,
  subtitlePageMs,
  subtitlePages,
  tvPictures,
} from "@/components/couch/couch-logic";

// The room's screen in couch mode (docs/couch-mode-spec.md 2.6), the TV the
// lead's account drives: the newest scene full bleed and slowly drifting
// (with a thing found there beside it, while that is the newest picture),
// the GM's words as subtitles, the crew along the bottom, who the GM is
// waiting on, rolls big enough to read from the couch, and all the sound.
// Join sharing and host controls sit beside the scene. It reads the same
// stream as any seat and renders nothing private: never an agenda, never a
// whisper, never a roll that was not rolled in the open. The host buttons and
// the cursor show only while someone is using the mouse or keyboard.
export function CouchTv({
  state,
  refresh,
  markTitleCardShown,
}: {
  state: CampaignState;
  refresh: () => void;
  markTitleCardShown: (id: string) => void;
}) {
  // Here, above the lobby and the play screen alike, so the sound unlocked
  // in the lobby carries straight into the first scene.
  const { narration, ambience } = useTableAudio(state);
  const controls = useRef<HTMLDivElement>(null);
  const awake = useAwake(controls);
  const { campaign, me } = state;
  if (!campaign || !me) {
    return null;
  }
  const lobby = campaign.status === "lobby";
  const ttsOn = Boolean(campaign.gameSettings?.ttsEnabled);
  const ambienceOn = Boolean(campaign.gameSettings?.ambienceEnabled);
  const askForSound =
    !narration.unlocked || (ttsOn && (narration.held > 0 || narration.muted)) || (ambienceOn && ambience.waiting);
  return (
    <main className="couch couch-tv" aria-label={`${campaign.title}, on the TV`} data-idle={awake ? undefined : ""}>
      {lobby ? <CouchTvLobby state={state} refresh={refresh} /> : <CouchTvPlay state={state} narration={narration} ttsOn={ttsOn} />}
      <SceneTitle card={state.titleCard} onShown={markTitleCardShown} />
      {!lobby ? (
        <HandoutStage
          campaignId={campaign.id}
          handout={state.handout}
          userId={me.id}
          steersStory={false}
          canTakeDown={false}
          onDismiss={async () => {}}
        />
      ) : null}
      {askForSound && lobby ? (
        // In the lobby the QR stays clear to scan; the lead's Begin press
        // unlocks the sound as well.
        <button
          type="button"
          className="couch-tv-sound"
          onClick={() => {
            if (narration.muted) narration.setMuted(false);
            narration.unlock();
            ambience.unlock();
          }}
        >
          Tap to start sound
        </button>
      ) : askForSound ? (
        <button
          type="button"
          className="couch-tv-gate"
          // The click itself is the gesture the browser waits for.
          onClick={() => {
            if (narration.muted) narration.setMuted(false);
            narration.unlock();
            ambience.unlock();
          }}
          autoFocus
        >
          <span className="couch-tv-gate-box">
            <span className="couch-tv-gate-title">Tap to start sound</span>
            <span className="couch-tv-gate-hint">
              The browser keeps quiet until someone clicks. Dice, narration and ambience play from this screen only.
            </span>
          </span>
        </button>
      ) : null}
      <div className="couch-tv-controls" ref={controls}>
        <Link href={`/campaigns/${campaign.id}?host=1`} className="couch-tv-control">
          Host controls
        </Link>
        {!lobby && campaign.inviteCode ? <CouchTvJoinButton inviteCode={campaign.inviteCode} /> : null}
      </div>
    </main>
  );
}

// How long the room must leave the mouse and keyboard alone before the host
// buttons and the cursor leave the scene, as in a video player.
const IDLE_MS = 3000;

// Any mouse movement, touch or key brings them back. A button still pointed
// at, or reached by keyboard, keeps them up so it never fades under the hand.
function useAwake(controls: RefObject<HTMLElement | null>): boolean {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer = 0;
    const rest = () => {
      const held = controls.current?.matches(":hover") || controls.current?.querySelector(":focus-visible");
      if (held) timer = window.setTimeout(rest, IDLE_MS);
      else setAwake(false);
    };
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(rest, IDLE_MS);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    timer = window.setTimeout(rest, IDLE_MS);
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
    };
  }, [controls]);
  return awake;
}

function CouchTvPlay({ state, narration, ttsOn }: { state: CampaignState; narration: NarrationAudio; ttsOn: boolean }) {
  const { campaign, messages, sheets } = state;
  const round = state.couchAnswers;
  const [dismissedAnswersId, setDismissedAnswersId] = useState<string | null>(null);
  const newest = latestNarration(messages);
  const latestNarrationSeq = messages.find((message) => message.id === newest?.id)?.seq ?? 0;
  const playing = messages.find((message) => message.id === narration.playingMessageId && message.authorType === "dm");
  if (round && playing && playing.seq > round.throughSeq && dismissedAnswersId !== round.id) {
    setDismissedAnswersId(round.id);
  }
  const answerVoiceStatus = round ? state.narrationStatus[round.id]?.state : undefined;
  const readoutExpected = Boolean(round && ttsOn && !narration.muted && narration.playbackFailure !== round.id &&
    answerVoiceStatus !== "failed" && answerVoiceStatus !== "skipped" && (
      answerVoiceStatus === "queued" || answerVoiceStatus === "generating" || state.narrationAudio[round.id] || state.latestTts?.messageId === round.id
    ));
  const showAnswers = couchAnswersVisible({
    round, latestNarrationSeq, playingMessageId: narration.playingMessageId,
    readoutExpected, live: Boolean(round?.live), dismissedId: dismissedAnswersId,
  });
  const pictures = useMemo(() => tvPictures(messages), [messages]);
  // The passage being read aloud, while one is; else the newest.
  const passage = useMemo(() => {
    const spoken = narration.playingMessageId
      ? messages.find((message) => message.id === narration.playingMessageId && message.authorType === "dm")
      : undefined;
    return spoken ? { id: spoken.id, content: spoken.content } : latestNarration(messages);
  }, [messages, narration.playingMessageId]);
  const voiceStatus = passage ? state.narrationStatus[passage.id]?.state : undefined;
  const voiceExpected = ttsOn && !narration.muted && voiceStatus !== "failed" && voiceStatus !== "skipped";
  const floorOpen = (campaign?.floor?.mode ?? "open") === "open";
  const waitingOn = floorOpen && state.dmStatus === "idle" ? (state.tableWait?.waitingOn ?? []) : [];
  const waitingIds = new Set(waitingOn.map((seat) => seat.userId));
  const crew = sheets.filter((sheet) => !sheet.isCompanion && sheet.userId !== campaign?.leadUserId);
  const gmWords = gmStatusWords(state.dmStatus);
  const halted = useMemo(() => (state.dmStatus === "idle" ? couchHaltedTurn(messages) : null), [messages, state.dmStatus]);
  return (
    <>
      <TvPictures scene={pictures.scene ?? campaign?.cover?.url ?? null} insert={pictures.insert} />
      <div className="couch-tv-scrim" aria-hidden="true" />
      <div className="couch-tv-top">
        <div className="couch-tv-title">
          <strong>{campaign?.title}</strong>
          {gmWords ? (
            <span className="couch-tv-gm" role="status">
              <span className="couch-pulse" aria-hidden="true" />
              {gmWords}…
            </span>
          ) : null}
          <CouchMapRail state={state} />
        </div>
        <div className="couch-tv-side">
          {halted && campaign ? <CouchTvHalted campaignId={campaign.id} turnId={halted.turnId} reason={halted.reason} /> : null}
          {waitingOn.length ? (
            <div className="couch-tv-waiting" role="status">
              <span className="couch-label">Waiting on</span>
              <strong>{waitingOn.map((seat) => seat.name).join(", ")}</strong>
            </div>
          ) : null}
        </div>
      </div>
      {showAnswers && round ? <CouchTvAnswers round={round} sheets={sheets} /> : passage ? (
        <TvSubtitles
          key={passage.id}
          id={passage.id}
          content={passage.content}
          messages={messages}
          speaking={narration.playingMessageId === passage.id}
          voiceExpected={voiceExpected}
        />
      ) : null}
      <ul className="couch-tv-crew" aria-label="The crew">
        {crew.map((sheet) => (
          <CrewMember key={sheet.id} sheet={sheet} waiting={waitingIds.has(sheet.userId)} />
        ))}
      </ul>
      <CouchRolls state={state} narration={narration} />
    </>
  );
}

function CrewMember({ sheet, waiting }: { sheet: CharacterSheet; waiting: boolean }) {
  const max = effectiveMaxHp(sheet);
  return (
    <li className="couch-tv-member" data-waiting={waiting ? "" : undefined} data-down={sheet.currentHp <= 0 ? "" : undefined}>
      <CouchFace src={sheet.portrait?.url} name={sheet.name} />
      <span className="couch-tv-member-text">
        <span className="couch-tv-member-name">{sheet.name}</span>
        {sheet.crewRole?.trim() ? <span className="couch-tv-member-role">{sheet.crewRole}</span> : null}
        <CouchHp current={sheet.currentHp} max={max} label={`${sheet.name}'s health`} />
      </span>
    </li>
  );
}

// How long a passage waits on the first page for its voice before it is
// paged for reading instead: the voice is usually there in two seconds.
const VOICE_WAIT_MS = 8000;

type Pacing = "await" | "read" | "voice" | "done";

// The passage as subtitles, a page at a time. Read aloud, it turns at the
// narrator's pace from the moment the voice starts and holds the last page
// once the voice stops; without a voice, at a reading pace. Keyed by the
// passage, so a new one always starts at its first page.
function TvSubtitles({ id, content, messages, speaking, voiceExpected }: {
  id: string;
  content: string;
  messages: CampaignState["messages"];
  speaking: boolean;
  voiceExpected: boolean;
}) {
  const pages = useMemo(() => subtitlePages(content), [content]);
  const [cursor, setCursor] = useState<{ page: number; pacing: Pacing }>(() => ({
    page: 0,
    pacing: speaking ? "voice" : voiceExpected ? "await" : "read",
  }));
  // The voice starting or stopping moves the pages (state from props).
  if (speaking && cursor.pacing !== "voice") {
    setCursor({ page: 0, pacing: "voice" });
  } else if (!speaking && cursor.pacing === "voice") {
    setCursor({ page: Math.max(0, pages.length - 1), pacing: "done" });
  }
  const { page, pacing } = cursor;
  const earlier = useMemo(() => previousSubtitlePages(messages, id, page), [messages, id, page]);
  useEffect(() => {
    if (pacing === "await") {
      const timer = window.setTimeout(
        () => setCursor((current) => (current.pacing === "await" ? { ...current, pacing: "read" } : current)),
        VOICE_WAIT_MS,
      );
      return () => window.clearTimeout(timer);
    }
    if ((pacing === "read" || pacing === "voice") && page < pages.length - 1) {
      const timer = window.setTimeout(
        () => setCursor((current) => (current.page === page ? { ...current, page: page + 1 } : current)),
        subtitlePageMs(pages[page], pacing === "voice"),
      );
      return () => window.clearTimeout(timer);
    }
  }, [pacing, page, pages]);
  if (!pages.length) {
    return null;
  }
  const shown = Math.min(page, pages.length - 1);
  return (
    <div className="couch-tv-subs">
      {earlier.length ? (
        <div className="couch-tv-history" role="group" aria-label="Earlier narration">
          {earlier.map((entry) => <p key={entry.id}>{entry.content}</p>)}
        </div>
      ) : null}
      <p key={`${id}:${shown}`}>{pages[shown]}</p>
    </div>
  );
}

