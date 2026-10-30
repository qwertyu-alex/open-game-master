"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import { selectedCharacter } from "@/lib/player-characters";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { agendaAct, CouchFace, CouchHp, CouchPhoneShell, useAgendaFresh } from "@/components/couch/CouchParts";
import { CouchDock, useCouchTurn, type CouchMode } from "@/components/couch/CouchDock";
import { CouchStory } from "@/components/couch/CouchStory";
import { CouchWhispers } from "@/components/couch/CouchWhispers";
import { CouchCrewPicker } from "@/components/couch/CouchPhoneLobby";
import { CouchMapButton } from "@/components/couch/CouchNavigation";
import { CouchCharacter } from "@/components/couch/CouchCharacter";
import { CouchRollPrompt } from "@/components/couch/CouchRollPrompt";

type View = "story" | "character";

// The phone in couch mode (docs/couch-mode-spec.md 2.7). The TV is what the
// room watches together; the phone is each player's own, in two views
// behind two tabs along the top. Story reads like a chat: the GM's newest
// passage just above a one-line action box, what only you were told, and
// the crew's route when there is one to choose. Character is everything
// that is yours for deciding what to try: health, the secret agenda, your
// best checks, what you carry and what your features do. Both stay mounted,
// so a half-written move survives a look at the sheet. No table chrome, no
// tour and no sound: the TV plays it all.
export function CouchPhoneView({
  state,
  refresh,
  refreshWhispers,
}: {
  state: CampaignState;
  refresh: () => void;
  refreshWhispers: () => Promise<void>;
}) {
  const { campaign, me, sheets } = state;
  const meId = me?.id ?? "";
  const mySheet = useMemo(() => selectedCharacter(sheets, meId, state.activeSheetId), [sheets, meId, state.activeSheetId]);
  const [view, setView] = useState<View>("story");
  const [mode, setMode] = useState<CouchMode>("do");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turn = useCouchTurn(state);
  const agenda = mySheet?.agenda ?? null;
  const { fresh: agendaFresh, markSeen: markAgendaSeen } = useAgendaFresh(mySheet?.id ?? "", agenda ? agendaAct(agenda) : null);
  const storyNews = useStoryNews(state, view);

  // Each view keeps its own place in the page. Story's first visit is left
  // to CouchStory, which brings the newest passage into view.
  const scrolls = useRef<Record<View, number | null>>({ story: null, character: 0 });
  const switchTo = useCallback(
    (next: View) => {
      if (next === view) return;
      scrolls.current[view] = window.scrollY;
      setView(next);
    },
    [view],
  );
  useLayoutEffect(() => {
    const y = scrolls.current[view];
    if (y !== null) window.scrollTo(0, y);
  }, [view]);

  const replyPrivately = useCallback(() => {
    setMode("private");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  if (!campaign || !me) {
    return null;
  }
  // A player who joined after the start: a character first, from the crew
  // the forge wrote, as in the lobby.
  if (!mySheet) {
    return (
      <CouchPhoneShell title={campaign.title}>
        <CouchCrewPicker state={state} refresh={refresh} />
      </CouchPhoneShell>
    );
  }
  return (
    <CouchPhoneShell
      title={campaign.title}
      bar={
        <ViewTabs
          view={view}
          onView={switchTo}
          sheet={mySheet}
          storyMark={storyNews || (view !== "story" && turn.tone === "yours")}
          characterMark={agendaFresh}
          aside={<CouchMapButton state={state} />}
        />
      }
      dock={
        <CouchDock
          state={state}
          sheet={mySheet}
          turn={turn}
          mode={mode}
          onMode={setMode}
          inputRef={inputRef}
          refreshWhispers={refreshWhispers}
          hidden={view !== "story"}
        />
      }
    >
      <div id="couch-view-story" role="tabpanel" aria-labelledby="couch-tab-story" className="couch-view" hidden={view !== "story"}>
        <h1 className="couch-feed-title">{campaign.title}</h1>
        <CouchStory messages={state.messages} sheets={sheets} rolls={state.rolls} meUserId={me.id} active={view === "story"} />
        <CouchWhispers
          campaignId={campaign.id}
          whispers={state.whispers}
          unread={state.whisperUnread}
          loaded={state.whispersLoaded}
          refreshWhispers={refreshWhispers}
          onReply={replyPrivately}
        />
      </div>
      <div
        id="couch-view-character"
        role="tabpanel"
        aria-labelledby="couch-tab-character"
        className="couch-view"
        hidden={view !== "character"}
      >
        <CouchCharacter sheet={mySheet} agendaFresh={agendaFresh} onAgendaSeen={markAgendaSeen} />
      </div>
      <CouchRollPrompt state={state} sheet={mySheet} />
    </CouchPhoneShell>
  );
}

// Whether the story moved on while the player was in the Character view: a
// new GM passage or an unread private message.
function useStoryNews(state: CampaignState, view: View): boolean {
  const latestGm = useMemo(() => {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      if (state.messages[index].authorType === "dm") return state.messages[index].id;
    }
    return "";
  }, [state.messages]);
  // What the Story view last showed, caught up while it is the one up.
  const [seen, setSeen] = useState(latestGm);
  if (view === "story" && seen !== latestGm) setSeen(latestGm);
  return view !== "story" && (latestGm !== seen || state.whisperUnread > 0);
}

// The two views as tabs (the ARIA tabs pattern: arrow keys move between
// them). The Character tab is your face, name and health, so health stays
// in sight from the story; each tab carries a dot when something waits in
// it.
function ViewTabs({
  view,
  onView,
  sheet,
  storyMark,
  characterMark,
  aside,
}: {
  view: View;
  onView: (view: View) => void;
  sheet: CharacterSheet;
  storyMark: boolean;
  characterMark: boolean;
  // Beside the tabs, in the same bar: the crew's Map button.
  aside?: ReactNode;
}) {
  const hintId = useId();
  const max = effectiveMaxHp(sheet);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: View = view === "story" ? "character" : "story";
    onView(next);
    document.getElementById(`couch-tab-${next}`)?.focus();
  };
  return (
    <div className="couch-col couch-bar-row">
      <div className="couch-tabs" role="tablist" aria-label="Your phone">
        <button
          type="button"
          id="couch-tab-story"
          role="tab"
          className="couch-tab"
          aria-selected={view === "story"}
          aria-controls="couch-view-story"
          tabIndex={view === "story" ? 0 : -1}
          onClick={() => onView("story")}
          onKeyDown={onKeyDown}
        >
          Story
          {storyMark ? <Mark label="something new" /> : null}
        </button>
        <button
          type="button"
          id="couch-tab-character"
          role="tab"
          className="couch-tab couch-tab-you"
          aria-selected={view === "character"}
          aria-controls="couch-view-character"
          aria-describedby={hintId}
          tabIndex={view === "character" ? 0 : -1}
          onClick={() => onView("character")}
          onKeyDown={onKeyDown}
        >
          <CouchFace src={sheet.portrait?.url} name={sheet.name} size="30px" />
          <span className="couch-tab-text">
            <span className="couch-tab-name">{sheet.name}</span>
            <span className="couch-tab-hp" aria-hidden="true">
              <CouchHp current={sheet.currentHp} max={max} />
              {Math.max(0, sheet.currentHp)}/{max}
            </span>
          </span>
          <span id={hintId} className="sr-only">
            Your character, health {Math.max(0, sheet.currentHp)} of {max}
          </span>
          {characterMark ? <Mark label="a new agenda to read" /> : null}
        </button>
      </div>
      {aside}
    </div>
  );
}

function Mark({ label }: { label: string }) {
  return (
    <>
      <i className="couch-dot" aria-hidden="true" />
      <span className="sr-only">, {label}</span>
    </>
  );
}
