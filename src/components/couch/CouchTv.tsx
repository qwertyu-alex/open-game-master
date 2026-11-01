"use client";

import { CouchTvSite } from "@/components/couch/CouchSiteMap";
import { mapSplit } from "@/lib/couch/navigation-logic";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from "react";
import { HandoutStage } from "@/components/HandoutStage";
import { SceneTitle } from "@/components/SceneTitle";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { useTableAudio } from "@/app/campaigns/[campaignId]/useTableAudio";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { useNarrationReplay } from "@/app/campaigns/[campaignId]/NarrationFailureBanner";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { CouchFace, CouchHp, CouchStress } from "@/components/couch/CouchParts";
import type { StressView } from "@/lib/couch/stress-logic";
import { CouchTvLobby } from "@/components/couch/CouchTvLobby";
import { TvPictures } from "@/components/couch/CouchTvPictures";
import { CouchTvJoinButton } from "@/components/couch/CouchTvJoin";
import { CouchTvDebugButton } from "@/components/couch/CouchTvDebug";
import { CouchTvAutoplay } from "@/components/couch/CouchTvAutoplay";
import { CouchTvAnswers } from "@/components/couch/CouchTvAnswers";
import { CouchTvHalted } from "@/components/couch/CouchTvHalted";
import { CouchTvSpeaker, useSpeakerNow } from "@/components/couch/CouchTvSpeaker";
import { CouchTvActBreak, useActBreakShowing } from "@/components/couch/CouchTvActBreak";
import { CouchTvEndNight, CouchTvFinale } from "@/components/couch/CouchTvFinale";
import { CouchRolls, type RollStageState } from "@/components/couch/CouchRolls";
import { CouchPlaceTitle } from "@/components/couch/CouchNavigation";
import { CouchTvFightHud, CouchTvFightOrder, CouchTvFightOver, useFightArt } from "@/components/couch/CouchTvFight";
import { CouchTvFightMap } from "@/components/couch/CouchTvFightMap";
import { useTruceShown } from "@/components/couch/CouchTruce";
import { couchFight, crewHealthOf, type CouchFight } from "@/lib/couch/fight-logic";
import { couchAnswersVisible } from "@/lib/couch/answers-logic";
import type { CouchObjective } from "@/lib/couch/pacing-logic";
import { isAiCrewUserId } from "@/lib/couch/ai-crew-logic";
import { itemShowCaption, tvItemShow } from "@/lib/couch/item-show-logic";
import {
  couchHaltedTurn,
  couchGmStatus,
  gmAtWork,
  gmStatusWords,
  latestNarration,
  isDead,
  previousSubtitlePages,
  speakingFace,
  subtitlePageMs,
  subtitlePages,
  voicedSubtitlePage,
  tvCrew,
  tvTurnSeats,
  tvPictures,
  type SpeakingFace,
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
  // Muted by the Mute button on this screen, so the sound gate below does
  // not jump up to undo it. A mute left from an earlier visit still asks.
  const [hushed, setHushed] = useState(false);
  // Counts Replay presses, so the subtitles start over with the voice.
  const [replays, setReplays] = useState(0);
  const { campaign, me } = state;
  const replayNarration = useNarrationReplay(campaign?.id ?? "", narration, state.narrationAudio);
  // What Replay reads: the passage being read, else the newest one.
  const replayId = useMemo(() => {
    const spoken = state.messages.find((message) => message.id === narration.playingMessageId && message.authorType === "dm");
    return spoken?.id ?? latestNarration(state.messages)?.id ?? null;
  }, [state.messages, narration.playingMessageId]);
  const lobby = campaign?.status === "lobby";
  // The story so far at an act break holds the new act's title card back.
  const actBreak = useActBreakShowing(lobby ? null : state.couchActBreak);
  const ttsOn = Boolean(campaign?.gameSettings?.ttsEnabled);
  const canPause = ttsOn && Boolean(narration.playingMessageId);
  const canReplay = ttsOn && !lobby && !narration.muted && Boolean(replayId);
  const togglePause = () => (narration.paused ? narration.resume() : narration.pause());
  const replay = () => {
    if (!replayId) return;
    setReplays((count) => count + 1);
    void replayNarration(replayId).then((error) => {
      if (error) console.warn(error);
    });
  };
  // The laptop's keyboard, for whoever sits at it: Space or K pauses and
  // resumes, R reads the passage again. A focused control keeps its keys.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable]")) return;
    const key = event.key.toLowerCase();
    if ((key === " " || key === "k") && canPause) {
      event.preventDefault();
      togglePause();
    } else if (key === "r" && canReplay) {
      event.preventDefault();
      replay();
    }
  });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  if (!campaign || !me) {
    return null;
  }
  const ambienceOn = Boolean(campaign.gameSettings?.ambienceEnabled);
  // The TV is the room's only speaker, so one Mute covers both channels.
  // The music has its own account-wide mute (the Sound panel, device
  // settings), which would otherwise silence it here with Mute still lit.
  const muted = (ttsOn && narration.muted) || (ambienceOn && ambience.muted);
  const askForSound =
    !narration.unlocked || (ttsOn && narration.held > 0) || (muted && !hushed) || (ambienceOn && ambience.waiting);
  const startSound = () => {
    if (narration.muted) narration.setMuted(false);
    if (ambience.muted) ambience.setMuted(false);
    narration.unlock();
    ambience.unlock();
  };
  return (
    <main className="couch couch-tv" aria-label={`${campaign.title}, on the TV`} data-idle={awake ? undefined : ""}>
      {lobby ? <CouchTvLobby state={state} refresh={refresh} narration={narration} ttsOn={ttsOn} /> : <CouchTvPlay state={state} narration={narration} ttsOn={ttsOn} replays={replays} />}
      {actBreak ? <CouchTvActBreak actBreak={actBreak} /> : null}
      <SceneTitle card={actBreak ? null : state.titleCard} onShown={markTitleCardShown} />
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
          onClick={startSound}
        >
          Tap to start sound
        </button>
      ) : askForSound ? (
        <button
          type="button"
          className="couch-tv-gate"
          // The click itself is the gesture the browser waits for.
          onClick={startSound}
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
      {/* The night is over: the closing covers the scene (src/lib/couch/finale.ts). */}
      {!lobby ? <CouchTvFinale state={state} narration={narration} ttsOn={ttsOn} /> : null}
      <div className="couch-tv-controls" ref={controls}>
        <Link href={`/campaigns/${campaign.id}?host=1`} className="couch-tv-control">
          Host controls
        </Link>
        <button
          type="button"
          className="couch-tv-control"
          aria-pressed={muted}
          onClick={() => {
            const next = !muted;
            setHushed(next);
            narration.setMuted(next);
            ambience.setMuted(next);
            if (!next) {
              narration.unlock();
              ambience.unlock();
            }
          }}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        {canPause ? (
          <button type="button" className="couch-tv-control" aria-pressed={narration.paused} onClick={togglePause}>
            {narration.paused ? "Resume narrator" : "Pause narrator"}
          </button>
        ) : null}
        {canReplay ? (
          <button type="button" className="couch-tv-control" onClick={replay}>
            Replay
          </button>
        ) : null}
        {!lobby && campaign.inviteCode ? <CouchTvJoinButton inviteCode={campaign.inviteCode} /> : null}
        <CouchTvDebugButton state={state} narration={narration} ambience={ambience} />
        <CouchTvAutoplay state={state} narration={narration} />
        {campaign.status === "active" ? <CouchTvEndNight campaignId={campaign.id} /> : null}
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

function CouchTvPlay({ state, narration, ttsOn, replays }: {
  state: CampaignState;
  narration: NarrationAudio;
  ttsOn: boolean;
  replays: number;
}) {
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
  // Everyone has acted (or the wait ran out): the passage they answered has
  // done its job, so the narrator stops reading it and drops what queued
  // behind it, and the answers and the GM's reply come next. Passages still
  // being voiced are dropped too. Once per live round; a reload never cuts.
  const { flush, skip } = narration;
  const liveRoundId = round?.live ? round.id : null;
  const roundThrough = round?.throughSeq ?? 0;
  const flushedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!liveRoundId || flushedRef.current === liveRoundId) return;
    flushedRef.current = liveRoundId;
    flush(liveRoundId);
    for (const message of messages) {
      if (message.authorType === "dm" && message.seq <= roundThrough) skip(message.id);
    }
  }, [liveRoundId, roundThrough, messages, flush, skip]);
  const herePicture = state.couchNavigation?.here.picture ?? null;
  const pictures = useMemo(() => tvPictures(messages, herePicture), [messages, herePicture]);
  // An item used this turn takes the find's column (item-show-logic.ts).
  const itemShow = useMemo(() => tvItemShow(state.couchItems, messages), [state.couchItems, messages]);
  const itemCaption = useMemo(() => (itemShow ? itemShowCaption(itemShow) : null), [itemShow]);
  // The passage being read aloud, while one is; else the newest.
  const passage = useMemo(() => {
    const spoken = narration.playingMessageId
      ? messages.find((message) => message.id === narration.playingMessageId && message.authorType === "dm")
      : undefined;
    return spoken ? { id: spoken.id, content: spoken.content } : latestNarration(messages);
  }, [messages, narration.playingMessageId]);
  const voiceStatus = passage ? state.narrationStatus[passage.id]?.state : undefined;
  const voiceExpected = ttsOn && !narration.muted && voiceStatus !== "failed" && voiceStatus !== "skipped";
  // Whose turn it is: the ones the GM asked, or the seats the open floor
  // waits for. Their faces light up in the crew strip.
  const waitingOn = tvTurnSeats({
    floor: campaign?.floor ?? { mode: "open" },
    gmIdle: couchGmStatus(state) === "idle",
    waitingOn: state.tableWait?.waitingOn ?? [],
    names: Object.fromEntries(sheets.filter((sheet) => !sheet.isCompanion).map((sheet) => [sheet.userId, sheet.name])),
  });
  const waitingIds = new Set(waitingOn.map((seat) => seat.userId));
  const crew = useMemo(() => tvCrew(sheets, campaign?.leadUserId), [sheets, campaign?.leadUserId]);
  // Whose line is being heard: their face over the subtitles, and a crew
  // member's tile lit in the strip.
  const speakerName = useSpeakerNow(narration, state.narrationCues);
  const speaking = useMemo(() => speakingFace(speakerName, sheets, state.cast), [speakerName, sheets, state.cast]);
  // A fight holds the story until it ends (docs/couch-mode-spec.md 2.11):
  // the screen turns to it, and the last one is kept for the card that
  // closes it.
  const fight = useMemo(
    () => couchFight(state.encounter, crewHealthOf(sheets)),
    [state.encounter, sheets],
  );
  const [lastFight, setLastFight] = useState<CouchFight | null>(null);
  if (fight && fight !== lastFight) setLastFight(fight);
  const fightArt = useFightArt(campaign?.id ?? "", fight ? `${state.encounter?.id}:${fight.enemies.map((enemy) => enemy.artKey).join(",")}` : "");
  // As CouchRolls reads it: a secret roll is never called on the TV.
  const rollCalled = state.pendingRolls.some((pending) => (pending as { visibility?: string }).visibility !== "secret");
  const fightTurnId = fight?.turn?.kind === "crew" ? fight.turn.characterId : "";
  // A split crew's members off scene, by the room they stand in
  // (src/lib/couch/whereabouts.ts).
  const navigation = state.couchNavigation;
  const site = state.couchSite;
  // The map's share of the stage: split beside the turn's picture, or the
  // whole stage until there is one.
  const sitePicture = pictures.scene ?? campaign?.cover?.url ?? null;
  const siteLayout: "split" | "full" | null = site && !fight ? (sitePicture ? "split" : "full") : null;
  const awayFrom = (sheetId: string) =>
    mapSplit(navigation) ? (navigation?.groups.find((group) => !group.inScene && group.crew.some((member) => member.id === sheetId))?.room.name ?? "") : "";
  const fightNextId = fight?.upNext?.characterId ?? "";
  const truce = useTruceShown(state.couchTruce);
  // In a fight a roll's card goes in the right-hand column's slot, never over
  // the grid, and what it decides waits on the grid until the dice land.
  const [fightSlot, setFightSlot] = useState<HTMLElement | null>(null);
  const [rollStage, setRollStage] = useState<RollStageState>({ showing: false, hold: false });
  const gmStatus = couchGmStatus(state);
  const gmWords = gmStatusWords(gmStatus);
  const gmBusy = gmAtWork(gmStatus);
  const halted = useMemo(() => (gmStatus === "idle" ? couchHaltedTurn(messages) : null), [messages, gmStatus]);
  return (
    <>
      {/* While the GM works, the scene behind it dims so the room can tell
          from the couch that its moves are in and nobody needs to act. The
          answers it is reading and the dice stay outside, at full
          brightness. */}
      <div className="couch-tv-stage" data-gm-busy={gmBusy ? "" : undefined} data-fight={fight ? "" : undefined} data-site={siteLayout ?? undefined}>
        {/* The site's map splits the stage: the map on the left,
            the turn's picture in a column on the right with the words over
            it; a fight takes the whole stage back for the creature
            (docs/couch-overhead-spec.md). */}
        {siteLayout ? (
          <>
            <CouchTvSite view={site as NonNullable<typeof site>} />
            {sitePicture ? (
              <div className="couch-tv-site-side" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- a generated picture */}
                <img key={sitePicture} src={sitePicture} alt="" />
              </div>
            ) : null}
          </>
        ) : (
          <TvPictures
            scene={pictures.scene ?? campaign?.cover?.url ?? null}
            insert={itemShow?.art ?? pictures.insert}
            item={itemCaption}
          />
        )}
        <div className="couch-tv-scrim" aria-hidden="true" />
        <CouchPlaceTitle state={state} />
        <div className="couch-tv-top">
          <div className="couch-tv-title">
            <strong>{campaign?.title}</strong>
          </div>
          <div className="couch-tv-side">
            {/* A fight sets the objective aside: the screen is the fight's. */}
            {state.couchObjective && !fight ? <CouchTvObjective key={state.couchObjective.text} objective={state.couchObjective} /> : null}
            {halted && campaign ? <CouchTvHalted campaignId={campaign.id} turnId={halted.turnId} reason={halted.reason} /> : null}
            {/* In a fight the corner under the creatures says whose move it is. */}
            {waitingOn.length && !fight ? (
              <div className="couch-tv-waiting" role="status">
                <span className="couch-label">Waiting on</span>
                <strong>{waitingOn.map((seat) => seat.name).join(", ")}</strong>
              </div>
            ) : null}
          </div>
        </div>
        {fight ? <CouchTvFightOrder fight={fight} art={fightArt} sheets={sheets} /> : null}
        {fight ? <CouchTvFightMap state={state} fight={fight} art={fightArt} sheets={sheets} hold={rollStage.hold} /> : null}
        {showAnswers && round && !rollCalled ? null : passage ? (
          <TvSubtitles
            key={`${passage.id}:${replays}`}
            id={passage.id}
            content={passage.content}
            messages={messages}
            speaking={narration.playingMessageId === passage.id}
            paused={narration.paused && narration.playingMessageId === passage.id}
            voiceExpected={voiceExpected}
            clock={narration.clock}
            speaker={speaking}
            // In a fight the screen belongs to the fight: one line of the
            // story at a time, the rest is in the voice and on the phones.
            sentenceOnly={siteLayout === "split" || Boolean(fight)}
          />
        ) : null}
        <ul className="couch-tv-crew" aria-label="The crew">
          {crew.map((sheet) => (
            <CrewMember
              key={sheet.id}
              sheet={sheet}
              away={awayFrom(sheet.id)}
              waiting={waitingIds.has(sheet.userId)}
              speaking={speaking?.sheetId === sheet.id}
              inFight={Boolean(fight)}
              fightTurn={fight ? (sheet.id === fightTurnId ? "now" : sheet.id === fightNextId ? "next" : "") : ""}
              against={Boolean(fight?.turned.includes(sheet.id))}
              stress={state.couchStress?.[sheet.id]}
            />
          ))}
        </ul>
      </div>
      {/* The fight's right-hand column sits outside the stage: a roll in its
          card slot stays at full brightness while the GM works. */}
      {fight ? (
        <CouchTvFightHud
          fight={fight}
          art={fightArt}
          sheets={sheets}
          gmBusy={gmBusy}
          rollsWaiting={rollCalled || rollStage.showing}
          diceHold={rollStage.hold}
          truce={truce}
          slotRef={setFightSlot}
        />
      ) : null}
      {/* A roll called on the TV is what the room looks at next: the
          answers it came from give way rather than sit under the call. */}
      {showAnswers && round && !rollCalled ? <CouchTvAnswers round={round} sheets={sheets} /> : null}
      <CouchTvFightOver summary={state.fightSummary} sheets={sheets} art={fightArt} lastFight={lastFight} />
      {gmBusy ? <div className="couch-gm-edge" aria-hidden="true" /> : null}
      {/* Always mounted, so a screen reader hears the words arrive. */}
      <div className="couch-tv-gm-slot" role="status">
        {gmWords ? (
          <span className="couch-tv-gm">
            <span className="couch-pulse" aria-hidden="true" />
            {gmWords}…
          </span>
        ) : null}
      </div>
      <CouchRolls state={state} narration={narration} slot={fight ? fightSlot : null} onStage={setRollStage} />
    </>
  );
}

// What the crew must do now (set_objective, src/lib/couch/pacing.ts), big
// enough to read from the couch, in the right column so it never covers the
// map. Only the goal: its clock is the GM's to voice. Keyed by its words, so
// a new objective arrives with the same fade as a new scene.
function CouchTvObjective({ objective }: { objective: CouchObjective }) {
  return (
    <div className="couch-tv-objective" role="status">
      <span className="couch-label">Objective</span>
      <span className="couch-tv-objective-text">{objective.text}</span>
    </div>
  );
}

function CrewMember({ sheet, away = "", waiting, speaking, inFight, fightTurn, against, stress }: {
  sheet: CharacterSheet;
  // The room they stand in while the scene is elsewhere.
  away?: string;
  waiting: boolean;
  // Their line is being heard.
  speaking: boolean;
  // In a fight the strip is the crew's side of it: a card each, marked with
  // whose move it is, who is next and who was just hit, and no roles.
  inFight: boolean;
  fightTurn: "now" | "next" | "";
  against: boolean;
  // Their stress and any panic taking their moves (src/lib/couch/stress.ts).
  stress?: StressView;
}) {
  const max = effectiveMaxHp(sheet);
  // Health lost flashes the face red, so the room sees who was hit. Only a
  // drop seen on this screen: a reload does not replay it.
  // `struck` counts only the blows landed in a fight, so a fight starting
  // does not mark a card for a hit taken before it.
  const [seen, setSeen] = useState({ hp: sheet.currentHp, hits: 0, struck: 0 });
  if (seen.hp !== sheet.currentHp) {
    const hit = sheet.currentHp < seen.hp;
    setSeen({ hp: sheet.currentHp, hits: hit ? seen.hits + 1 : seen.hits, struck: hit && inFight ? seen.struck + 1 : seen.struck });
  }
  // The dead stay in the strip, shrunk to a dark face marked Dead, until
  // their player plays on as someone else (tvCrew); the room should never
  // read a death as low health.
  const dead = isDead(sheet);
  const fightTag = !inFight || dead ? null
    : fightTurn === "now" ? { tone: against ? "danger" : "accent", words: "Your move" }
    : against ? { tone: "danger", words: "Against the crew" }
    : fightTurn === "next" ? { tone: "plain", words: "Next" }
    : null;
  return (
    <li
      className="couch-tv-member"
      data-waiting={!dead && (waiting || fightTurn === "now") ? "" : undefined}
      data-speaking={speaking ? "" : undefined}
      data-down={sheet.currentHp <= 0 ? "" : undefined}
      data-dead={dead ? "" : undefined}
      data-fight-turn={fightTurn || undefined}
      data-against={against ? "" : undefined}
      data-away={away && !dead ? "" : undefined}
      data-in-fight={inFight ? "" : undefined}
    >
      {seen.hits ? <span key={seen.hits} className="couch-tv-member-hit" aria-hidden="true" /> : null}
      {/* A blow seen on this screen marks the card for a few seconds, so
          the room reads who the creature went for. */}
      {inFight && seen.struck && !dead ? <span key={`struck:${seen.struck}`} className="couch-tv-member-struck" aria-hidden="true" /> : null}
      <CouchFace src={sheet.portrait?.url} name={sheet.name} />
      <span className="couch-tv-member-text">
        {/* Always there in a fight, empty or not, so the cards keep one
            height as the marks come and go. */}
        {inFight && !dead ? (
          <span className="couch-tv-member-tags">
            {fightTag ? <span className="couch-tv-member-tag" data-tone={fightTag.tone}>{fightTag.words}</span> : null}
            {seen.struck ? <span key={`hit-tag:${seen.struck}`} className="couch-tv-member-tag couch-tv-member-hit-tag" data-tone="danger">Hit</span> : null}
          </span>
        ) : null}
        <span className="couch-tv-member-name">
          {/* An AI crewmate (src/lib/couch/ai-crew.ts) says so, so the room
              knows whose move it waits on is nobody's phone. */}
          {isAiCrewUserId(sheet.userId) ? (
            <span className="couch-tv-member-ai">
              AI<span className="sr-only"> crewmate:</span>
            </span>
          ) : null}
          {sheet.name}
        </span>
        {dead ? (
          <span className="couch-tv-member-dead">Dead</span>
        ) : (
          <>
            {/* A panic says so where their role is, loud enough for the room;
                a crew member fighting the others says so there too. */}
            {stress?.panic ? (
              <span className="couch-tv-member-role couch-tv-member-panic">Panicking · {stress.panic.label}</span>
            ) : against && !inFight ? (
              <span className="couch-tv-member-role couch-tv-member-against">Fighting the crew</span>
            ) : away ? (
              <span className="couch-tv-member-role couch-tv-member-away">
                <span className="sr-only">Off scene, in </span>
                {away}
              </span>
            ) : sheet.crewRole?.trim() && !inFight ? (
              <span className="couch-tv-member-role">{sheet.crewRole}</span>
            ) : null}
            <CouchHp current={sheet.currentHp} max={max} label={`${sheet.name}'s health`} />
            <CouchStress value={stress?.stress ?? 0} label={`${sheet.name}'s stress`} />
          </>
        )}
      </span>
    </li>
  );
}

// How long a passage waits on the first page for its voice before it is
// paged for reading instead: the voice is usually there in two seconds.
const VOICE_WAIT_MS = 8000;

type Pacing = "await" | "read" | "voice" | "done";

// How often a page read aloud checks where the voice has got to.
const VOICE_POLL_MS = 200;

// The passage as subtitles, a page at a time. Read aloud, it turns where the
// voice reaches it (voicedSubtitlePage) and holds the last page once the
// voice stops; without a voice, at a reading pace. Keyed by the passage, so
// a new one always starts at its first page. Beside a map (`sentenceOnly`)
// the column is narrow: only the sentence being spoken, no earlier lines.
function TvSubtitles({ id, content, messages, speaking, paused, voiceExpected, clock, speaker, sentenceOnly }: {
  id: string;
  content: string;
  messages: CampaignState["messages"];
  speaking: boolean;
  // The narrator is held: the page stays until the voice goes on.
  paused: boolean;
  voiceExpected: boolean;
  clock: NarrationAudio["clock"];
  // Whose line is being heard, shown over it; null while the narrator reads.
  speaker: SpeakingFace | null;
  sentenceOnly: boolean;
}) {
  const pages = useMemo(() => subtitlePages(content, undefined, sentenceOnly), [content, sentenceOnly]);
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
    if (paused) {
      return;
    }
    if (pacing === "await") {
      const timer = window.setTimeout(
        () => setCursor((current) => (current.pacing === "await" ? { ...current, pacing: "read" } : current)),
        VOICE_WAIT_MS,
      );
      return () => window.clearTimeout(timer);
    }
    if (pacing === "voice") {
      // Timers rather than animation frames: a background tab still turns.
      const timer = window.setInterval(() => {
        const at = clock();
        if (!at || at.messageId !== id) return;
        const next = voicedSubtitlePage(pages, at.seconds, at.duration);
        setCursor((current) => (current.pacing === "voice" && current.page !== next ? { ...current, page: next } : current));
      }, VOICE_POLL_MS);
      return () => window.clearInterval(timer);
    }
    if (pacing === "read" && page < pages.length - 1) {
      const timer = window.setTimeout(
        () => setCursor((current) => (current.page === page ? { ...current, page: page + 1 } : current)),
        subtitlePageMs(pages[page]),
      );
      return () => window.clearTimeout(timer);
    }
  }, [pacing, page, pages, paused, clock, id]);
  if (!pages.length) {
    return null;
  }
  const shown = Math.min(page, pages.length - 1);
  return (
    <div className="couch-tv-subs">
      {earlier.length && !sentenceOnly ? (
        <div className="couch-tv-history" role="group" aria-label="Earlier narration">
          {earlier.map((entry) => <p key={entry.id}>{entry.content}</p>)}
        </div>
      ) : null}
      {speaker ? <CouchTvSpeaker key={speaker.name} face={speaker} /> : null}
      <p key={`${id}:${shown}`}>{pages[shown]}</p>
    </div>
  );
}

