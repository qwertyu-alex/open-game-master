"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { agendaAct, CouchFace, CouchHp, CouchPhoneShell, useAgendaFresh } from "@/components/couch/CouchParts";
import { CouchDock, CouchTurnLine, useCouchTurn, type CouchMode } from "@/components/couch/CouchDock";
import { CouchPhoneFight } from "@/components/couch/CouchTvFight";
import { CouchPhoneTruce } from "@/components/couch/CouchTruce";
import { couchFight, crewHealthOf } from "@/lib/couch/fight-logic";
import { CouchStory } from "@/components/couch/CouchStory";
import { useWhisperWatch } from "@/components/couch/CouchWhispers";
import { CouchCrewPicker } from "@/components/couch/CouchPhoneLobby";
import { CouchMapButton } from "@/components/couch/CouchNavigation";
import { CouchCharacter } from "@/components/couch/CouchCharacter";
import { couchCharacter, itemKeys, sectionOnEntry, type CharacterSection, type CouchItem } from "@/components/couch/character-logic";
import { useItemArt, useNewGear } from "@/components/couch/useCouchGear";
import { itemMoveLine } from "@/lib/couch/item-art-logic";
import { CouchRollPrompt } from "@/components/couch/CouchRollPrompt";
import { couchSheetFor, gmAtWork, isDead } from "@/components/couch/couch-logic";
import { CouchTakeover } from "@/components/couch/CouchTakeover";

type View = "story" | "character";

// The phone in couch mode (docs/couch-mode-spec.md 2.7). The TV is what the
// room watches together; the phone is each player's own, in two views
// behind two tabs along the top. Story reads like a chat: the GM's newest
// passage just above a one-line action box with whose move it is under
// it, what only you asked and were told standing where it was asked, and
// the crew's route when there is one to choose. Character is everything
// that is yours, in three sections: Gear (pictures of what you carry, and
// Use, which starts a move with it here), Skills and About. Both stay
// mounted, so a half-written move survives a look at the sheet. No table chrome, no
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
  // The living character first: after a death, the person this player
  // took over (docs/couch-mode-spec.md 2.12).
  const mySheet = useMemo(() => couchSheetFor(sheets, meId, state.activeSheetId), [sheets, meId, state.activeSheetId]);
  const dead = mySheet ? isDead(mySheet) : false;
  const takeoverSignal = `${sheets.map((sheet) => `${sheet.id}:${sheet.deathSaves?.dead ? 1 : 0}`).join("|")}#${String((campaign as { couchStamp?: unknown } | null)?.couchStamp ?? "")}`;
  const [view, setView] = useState<View>("story");
  const [mode, setMode] = useState<CouchMode>("do");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turn = useCouchTurn(state);
  const fight = useMemo(() => couchFight(state.encounter, crewHealthOf(sheets)), [state.encounter, sheets]);
  const myCharacterIds = useMemo(() => new Set(sheets.filter((sheet) => sheet.userId === meId).map((sheet) => sheet.id)), [sheets, meId]);
  const agenda = mySheet?.agenda ?? null;
  const { fresh: agendaFresh, markSeen: markAgendaSeen } = useAgendaFresh(mySheet?.id ?? "", agenda ? agendaAct(agenda) : null);
  const storyNews = useStoryNews(state, view);
  const character = useMemo(() => (mySheet ? couchCharacter(mySheet) : null), [mySheet]);
  const gearKeys = useMemo(() => (character ? itemKeys(character) : []), [character]);
  // Only the items the painted icon set lacks are the night's to paint.
  const unpainted = useMemo(
    () =>
      character
        ? [...new Set([character.signature, ...character.weapons, ...character.worn, ...character.gear].flatMap((item) => (item && !item.icon ? [item.name] : [])))]
        : [],
    [character],
  );
  const itemArt = useItemArt(campaign?.id ?? "", unpainted);
  const newGear = useNewGear(mySheet?.id ?? "", gearKeys);
  const acted = useMemo(() => state.messages.some((message) => message.authorType === "player" && message.userId === meId), [state.messages, meId]);
  const [section, setSection] = useState<CharacterSection | null>(null);
  const [draft, setDraft] = useState<{ id: number; text: string } | null>(null);
  const whisperWatch = useWhisperWatch({
    campaignId: campaign?.id ?? "",
    unread: state.whisperUnread,
    loaded: state.whispersLoaded,
    refreshWhispers,
  });

  // Each view keeps its own place in the page. Story's first visit is left
  // to CouchStory, which brings the newest passage into view.
  const scrolls = useRef<Record<View, number | null>>({ story: null, character: 0 });
  const { markSeen: markGearSeen } = newGear;
  const switchTo = useCallback(
    (next: View) => {
      if (next === view) return;
      scrolls.current[view] = window.scrollY;
      // Leaving the Gear section is having looked at what was new there.
      if (view === "character" && section === "gear") markGearSeen();
      if (next === "character") {
        const entered = sectionOnEntry(section, { agendaFresh, newGear: newGear.fresh.size > 0, acted });
        // A different section than last time starts at the top of the view.
        if (entered !== section && section !== null) scrolls.current.character = 0;
        setSection(entered);
      }
      setView(next);
    },
    [view, section, markGearSeen, agendaFresh, newGear.fresh.size, acted],
  );
  const chooseSection = useCallback(
    (next: CharacterSection) => {
      if (section === "gear" && next !== "gear") markGearSeen();
      setSection(next);
    },
    [section, markGearSeen],
  );
  // An item's Use: back to the story with the move begun in the box.
  const startWithItem = useCallback(
    (item: CouchItem) => {
      setMode("do");
      setDraft((current) => ({ id: (current?.id ?? 0) + 1, text: itemMoveLine(item.name) }));
      switchTo("story");
      window.requestAnimationFrame(() => {
        const field = inputRef.current;
        if (!field) return;
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      });
    },
    [switchTo],
  );
  // A place tapped on the map: back to the story with the move begun.
  const startWithMove = useCallback(
    (line: string) => {
      setMode("do");
      setDraft((current) => ({ id: (current?.id ?? 0) + 1, text: line }));
      switchTo("story");
      window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [switchTo],
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
          characterMark={dead ? "" : agendaFresh ? "a new agenda to read" : newGear.fresh.size ? "something new picked up" : ""}
          aside={<CouchMapButton state={state} onMove={dead ? undefined : startWithMove} />}
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
          answerAway={whisperWatch.away}
          onAnswerJump={whisperWatch.jump}
          hidden={view !== "story" || dead}
          draft={draft}
        />
      }
    >
      <div id="couch-view-story" role="tabpanel" aria-labelledby="couch-tab-story" className="couch-view" hidden={view !== "story"}>
        <h1 className="couch-feed-title">{campaign.title}</h1>
        {/* What the crew must do now (set_objective), at the head of the
            story rather than on the dock: the box keeps the screen it has. */}
        {state.couchObjective ? (
          <p className="couch-objective" role="status">
            <span className="couch-objective-label">Objective</span>
            <span className="couch-objective-text">{state.couchObjective.text}</span>
            {state.couchObjective.clock ? <span className="couch-objective-clock">{state.couchObjective.clock}</span> : null}
          </p>
        ) : null}
        <CouchStory
          messages={state.messages}
          sheets={sheets}
          rolls={state.rolls}
          meUserId={me.id}
          active={view === "story"}
          whispers={state.whispers}
          onAsk={replyPrivately}
          watchRef={whisperWatch.watchRef}
          sceneTags={state.couchSceneTags}
          mySheetId={mySheet.id}
        />
        <CouchPhoneFight fight={fight} myCharacterIds={myCharacterIds} />
        {fight ? <CouchPhoneTruce campaignId={campaign.id} truce={state.couchTruce} myCharacterIds={myCharacterIds} /> : null}
        {/* Dead: where the action box was, who to play on as. */}
        {dead ? <CouchTakeover campaignId={campaign.id} sheet={mySheet} signal={takeoverSignal} /> : <CouchTurnLine campaignId={campaign.id} turn={turn} />}
      </div>
      <div
        id="couch-view-character"
        role="tabpanel"
        aria-labelledby="couch-tab-character"
        className="couch-view"
        hidden={view !== "character"}
      >
        {character ? (
          <CouchCharacter
            sheet={mySheet}
            view={character}
            crew={sheets.filter((sheet) => sheet.id !== mySheet.id)}
            section={section ?? sectionOnEntry(null, { agendaFresh, newGear: newGear.fresh.size > 0, acted })}
            onSection={chooseSection}
            art={itemArt}
            newGear={newGear.fresh}
            agendaFresh={agendaFresh}
            onAgendaSeen={markAgendaSeen}
            onUse={startWithItem}
          />
        ) : null}
      </div>
      <CouchRollPrompt state={state} sheet={mySheet} />
      {/* The TV's breathing edge, on every tab: the phone stays free to
          read the story or the sheet while the GM works. */}
      {gmAtWork(state.dmStatus) ? <div className="couch-gm-edge" aria-hidden="true" /> : null}
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
// it: on Character, an unread agenda or something picked up.
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
  // What waits on the Character tab, for a screen reader; "" for nothing.
  characterMark: string;
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
            {isDead(sheet) ? (
              <span className="couch-tab-hp couch-tab-dead" aria-hidden="true">
                Dead
              </span>
            ) : (
              <span className="couch-tab-hp" aria-hidden="true">
                <CouchHp current={sheet.currentHp} max={max} />
                {Math.max(0, sheet.currentHp)}/{max}
              </span>
            )}
          </span>
          <span id={hintId} className="sr-only">
            {isDead(sheet) ? "Your character, dead" : `Your character, health ${Math.max(0, sheet.currentHp)} of ${max}`}
          </span>
          {characterMark ? <Mark label={characterMark} /> : null}
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
