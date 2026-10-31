"use client";

import { ArrowUp, Loader2, Lock } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { composerGate } from "@/app/campaigns/[campaignId]/composerGate";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { composerLimit, textLength } from "@/lib/text-limits";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { couchFight, crewHealthOf } from "@/lib/couch/fight-logic";
import { couchTurn, privateCapped, PRIVATE_MAX_CHARS, PRIVATE_PENDING_CAP, type CouchTurn } from "@/components/couch/phone-logic";
import { couchHaltedTurn, gmAtWork } from "@/components/couch/couch-logic";
import { mapSplit, myGroup } from "@/lib/couch/navigation-logic";

export type CouchMode = "do" | "say" | "private";

// The phone's action box (docs/couch-mode-spec.md 2.7), held to the foot of
// the Story view and drawn like a chat app's: at rest one rounded line with
// only the send in it, so the story keeps the screen; while writing a card
// with Do, Say and Ask GM as three toggles under the text. Whose move it is
// stands in the story above it (CouchTurnLine). Do and Say go through the
// table's routes and gate (composerGate.ts). Ask GM is the whisper route, a
// message only the GM reads, which never waits on the floor; "Ask a
// follow-up" under a private answer opens it too. Asking turns the box
// dashed and says only the GM sees it, so a secret is never sent to the table
// by a player who forgot which mode they were in. The box stays open to write in
// while the floor is someone else's, so a move can be ready for its turn;
// only sending waits. While the GM itself is answering, Do and Say rest and
// the box shimmers, so nobody wonders whether to type; a draft already in it
// is kept, and Ask GM still opens. No table talk (it happens out loud), no directions to
// the GM, no X-card and no dictation. The roll the GM asks for is its own
// sheet over the screen (CouchRollPrompt).
const STALL = " (OOC still open)";

// Whose move it is, for the dock's line and the Story tab's mark.
export function useCouchTurn(state: CampaignState): CouchTurn {
  const { campaign, me } = state;
  const floor = campaign?.floor ?? { mode: "open" as const };
  const meId = me?.id ?? "";
  const names: Record<string, string> = {};
  for (const candidate of state.sheets) {
    if (!candidate.isCompanion && !names[candidate.userId]) names[candidate.userId] = candidate.name;
  }
  const wait = floor.mode === "open" && state.dmStatus === "idle" ? state.tableWait : null;
  const mine = new Set(state.sheets.filter((candidate) => candidate.userId === meId).map((candidate) => candidate.id));
  return couchTurn({
    ended: campaign?.status === "ended",
    muted: Boolean(state.members.find((member) => member.userId === meId)?.muted),
    myRolls: state.pendingRolls.filter((pending) => pending.userId === meId).length,
    dmStatus: state.dmStatus,
    floor,
    meUserId: meId,
    names,
    waitingOn: wait?.waitingOn ?? [],
    halted: state.dmStatus === "idle" && couchHaltedTurn(state.messages) !== null,
    fight: couchFight(state.encounter, crewHealthOf(state.sheets)),
    myCharacterIds: mine,
    offScene: offSceneOf(state.couchNavigation, mine),
  });
}

// Where this player stands, when the crew is split and the story is
// elsewhere (src/lib/couch/navigation-logic.ts groups).
function offSceneOf(map: CampaignState["couchNavigation"], mine: ReadonlySet<string>) {
  const group = mapSplit(map) ? myGroup(map, mine) : null;
  const scene = map?.groups.find((entry) => entry.inScene);
  if (!group || group.inScene || !scene) return null;
  return { place: group.room.name, scenePlace: scene.room.name, sceneNames: scene.crew.map((member) => member.name) };
}

export function CouchDock({
  state,
  sheet,
  turn,
  mode,
  onMode,
  inputRef,
  refreshWhispers,
  answerAway,
  onAnswerJump,
  hidden,
  draft,
}: {
  state: CampaignState;
  sheet: CharacterSheet;
  turn: CouchTurn;
  mode: CouchMode;
  onMode: (mode: CouchMode) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  refreshWhispers: () => Promise<void>;
  // An unread whisper is out of sight in the story: the box points to it.
  answerAway: boolean;
  onAnswerJump: () => void;
  hidden: boolean;
  // A move started elsewhere (an item's Use on the Gear section): put in
  // the box once per id, after whatever is already written.
  draft?: { id: number; text: string } | null;
}) {
  const { campaign, me } = state;
  const [input, setInput] = useState("");
  const [draftTaken, setDraftTaken] = useState(0);
  if (draft && draft.id !== draftTaken) {
    setDraftTaken(draft.id);
    setInput((current) => (current.trim() ? `${current.trimEnd()} ${draft.text}` : draft.text));
  }
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const noteId = useId();
  useTurnBuzz(turn.tone);
  useKeyboardInset();
  const isPrivate = mode === "private";
  // Off scene, a move is held for the cut to this player's group: it never
  // waits on the GM or the floor (the actions route holds it).
  const away = mapSplit(state.couchNavigation) ? myGroup(state.couchNavigation, new Set([sheet.id])) : null;
  const offScene = Boolean(away && !away.inScene);
  const gmAnswering = gmAtWork(state.dmStatus) && !isPrivate && !offScene;
  const expanded = isPrivate || (!gmAnswering && (focused || input.length > 0));
  // A box disabled under the finger may never hear its blur.
  if (gmAnswering && focused) setFocused(false);
  // The box grows with what is written in it, up to its cap, and shrinks
  // back once it is sent.
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    // scrollHeight leaves out the border, which the box's height counts.
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }, [input, expanded, inputRef]);

  if (!campaign || !me) {
    return null;
  }
  const floor = campaign.floor ?? { mode: "open" as const };
  const gate = composerGate({
    floor,
    sheets: state.sheets,
    meUserId: me.id,
    kind: mode === "say" ? "say" : "do",
    myName: sheet.name,
    leadPrivate: false,
    // The phone reads nothing aloud; the TV does, and nobody's box waits on it.
    openingNarrationPlaying: false,
    enemyTurns: state.encounter?.enemyTurns === true,
  });
  const muted = Boolean(state.members.find((member) => member.userId === me.id)?.muted);
  const ended = campaign.status === "ended";
  const askCapped = privateCapped(state.whispers);
  const capped = isPrivate && askCapped;
  // Why this send has to wait, when it does; writing never does.
  const held = ended
    ? "The story has ended."
    : gmAnswering
      ? "The GM is answering. Ask GM still reaches it."
      : isPrivate
      ? capped
        ? "Wait for the GM to answer your last messages."
        : ""
      : muted
        ? "The host has muted you at this table. Ask GM still reaches the GM."
        : gate.inputBlocked && !offScene
          ? "Not your move yet: this sends when it is. Ask GM reaches the GM now."
          : "";
  const placeholder = ended
    ? "The story has ended."
    : gmAnswering
      ? "You can write again when the GM answers"
      : isPrivate
      ? capped
        ? "Wait for the GM's answer"
        : "Ask the GM…"
      : offScene && away
        ? `Your next move in ${away.room.name}…`
        : gate.placeholder.replace(STALL, "").replace(/\.\.\.$/, "…");
  const maxChars = isPrivate ? PRIVATE_MAX_CHARS : composerLimit(mode === "say" ? "say" : "do", false);
  const length = textLength(input);
  const tooLong = length > maxChars;
  const canSend = Boolean(input.trim()) && !held && !tooLong && !sending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!canSend) {
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = isPrivate
        ? await fetch(`/api/campaigns/${campaign!.id}/whispers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: content }),
          })
        : await fetch(`/api/campaigns/${campaign!.id}/actions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, kind: mode, characterId: sheet.id }),
          });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not send that.");
        return;
      }
      setInput("");
      if (isPrivate) {
        // Back to acting: the next thing typed is most likely for the room.
        onMode("do");
        await refreshWhispers();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  // A mode button keeps the text box focused (and the keyboard up) when it
  // is pressed; otherwise the box would close under the finger first.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();
  const modeButton = (value: CouchMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
      onClick={() => onMode(value)}
    >
      {label}
    </button>
  );
  const askLabel = askCapped ? `${PRIVATE_PENDING_CAP} waiting` : "Ask GM";
  const askName = askCapped
    ? `Ask the GM: ${PRIVATE_PENDING_CAP} questions are waiting for the GM's answer`
    : "Ask the GM privately";

  return (
    <div className="couch-dock" hidden={hidden}>
      <div className="couch-col couch-dock-inner">
        {answerAway ? (
          <button type="button" className="couch-answer-jump" onClick={onAnswerJump}>
            <Lock className="size-4" aria-hidden="true" />
            The GM wrote to you privately
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <form
          className="couch-composer"
          data-expanded={expanded ? "" : undefined}
          data-private={isPrivate ? "" : undefined}
          data-gm-answering={gmAnswering ? "" : undefined}
          onSubmit={submit}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit(event);
              }
            }}
            rows={1}
            disabled={ended || gmAnswering}
            placeholder={placeholder}
            aria-label={
              isPrivate ? "Question for the GM, only the GM sees it" : mode === "do" ? `What ${sheet.name} does` : `What ${sheet.name} says`
            }
            aria-describedby={noteId}
            aria-invalid={tooLong || undefined}
            enterKeyHint="send"
            className="couch-composer-input"
          />
          {expanded ? (
            <div className="couch-composer-modes" role="group" aria-label="Who it is for">
              {modeButton("do", "Do")}
              {modeButton("say", "Say")}
              <button
                type="button"
                className="couch-composer-ask"
                aria-pressed={isPrivate}
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={() => onMode(isPrivate ? "do" : "private")}
                aria-label={askName}
              >
                <Lock className="size-3.5" aria-hidden="true" />
                {askLabel}
              </button>
            </div>
          ) : null}
          <button
            type="submit"
            className="couch-composer-send"
            disabled={!canSend}
            onPointerDown={keepFocus}
            aria-label={isPrivate ? "Send to the GM privately" : "Send"}
          >
            {sending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-5" aria-hidden="true" />}
          </button>
        </form>
        <p
          id={noteId}
          className={tooLong || (held && input.trim()) || isPrivate ? "couch-composer-note" : "sr-only"}
          data-private={isPrivate && !tooLong ? "" : undefined}
          aria-live="polite"
        >
          {tooLong
            ? `${length - maxChars} characters over the limit.`
            : held || (isPrivate ? "Only the GM sees this. The GM answers on its next turn." : `Up to ${maxChars} characters.`)}
        </p>
        {error ? (
          <p role="alert" className="couch-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Whose move it is, and the GM's question in full when it asked one. It
// stands at the foot of the story, after the newest passage, rather than on
// the action box: pinned there it took a third of a phone under the
// keyboard. Pass sits beside it while the table waits on this player.
export function CouchTurnLine({ campaignId, turn }: { campaignId: string; turn: CouchTurn }) {
  const [passing, setPassing] = useState(false);
  const [error, setError] = useState("");
  if (!turn.headline) return null;

  async function pass() {
    setPassing(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/pass`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "The pass did not go through.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPassing(false);
    }
  }

  return (
    <div className="couch-turn" data-tone={turn.tone} role="status">
      <div className="couch-turn-row">
        <p className="couch-turn-head">
          {turn.tone === "gm" ? <span className="couch-pulse" aria-hidden="true" /> : null}
          {turn.headline}
        </p>
        {turn.canPass ? (
          <button
            type="button"
            className="couch-btn couch-turn-pass"
            onClick={() => void pass()}
            disabled={passing}
            title="Nothing to add this time: the GM stops waiting on you."
          >
            Pass
          </button>
        ) : null}
      </div>
      {turn.prompt ? <p className="couch-turn-prompt">{turn.prompt}</p> : null}
      {error ? (
        <p role="alert" className="couch-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// iOS Safari keeps the layout viewport full height under the keyboard, so a
// box pinned to its foot sits partly behind the keyboard's accessory bar.
// How far the keyboard covers the page goes into --couch-kb, which lifts the
// dock (couch-phone.css). Elsewhere the viewport shrinks and it stays 0.
// Safari slides the keyboard in, pans to the caret and may resize the layout
// viewport after the last visualViewport event, so a lift read once goes
// stale and threw the box off the top of the screen. Every change is read
// again on each frame until the keyboard has settled.
function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let last = -1;
    const update = () => {
      // Under 80px is Safari's own toolbars settling, not a keyboard.
      const gap = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      const covered = gap > 80 ? gap : 0;
      if (covered === last) return;
      last = covered;
      root.style.setProperty("--couch-kb", `${covered}px`);
      if (covered > 0) root.dataset.couchKeyboard = "";
      else delete root.dataset.couchKeyboard;
    };
    let frame = 0;
    let until = 0;
    const tick = () => {
      update();
      frame = performance.now() < until ? window.requestAnimationFrame(tick) : 0;
    };
    const settle = () => {
      until = performance.now() + 700;
      if (!frame) tick();
    };
    update();
    viewport.addEventListener("resize", settle);
    viewport.addEventListener("scroll", settle);
    window.addEventListener("resize", settle);
    window.addEventListener("focusin", settle);
    window.addEventListener("focusout", settle);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", settle);
      viewport.removeEventListener("scroll", settle);
      window.removeEventListener("resize", settle);
      window.removeEventListener("focusin", settle);
      window.removeEventListener("focusout", settle);
      root.style.removeProperty("--couch-kb");
      delete root.dataset.couchKeyboard;
    };
  }, []);
}

// The phone buzzes when the move comes to this player (Android; iOS Safari
// has no vibration), as it does for a whisper: it may be face down on the
// couch while the TV talks.
function useTurnBuzz(tone: CouchTurn["tone"]) {
  const last = useRef(tone);
  useEffect(() => {
    if (tone === "yours" && last.current !== "yours") {
      try {
        navigator.vibrate?.(90);
      } catch {
        // No vibration here; the line above the box says it.
      }
    }
    last.current = tone;
  }, [tone]);
}
