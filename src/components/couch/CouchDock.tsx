"use client";

import { ArrowUp, Loader2, Lock } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { composerGate } from "@/app/campaigns/[campaignId]/composerGate";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { composerLimit, textLength } from "@/lib/text-limits";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { couchTurn, privateCapped, PRIVATE_MAX_CHARS, type CouchTurn } from "@/components/couch/phone-logic";
import { couchHaltedTurn } from "@/components/couch/couch-logic";

export type CouchMode = "do" | "say" | "private";

// The phone's action box (docs/couch-mode-spec.md 2.7), held to the foot of
// the Story view and drawn like a chat app's: at rest one rounded line and
// a send button, so the story keeps the screen; while writing a card with
// Do, Say and Private under the text. Above it, one line says whose move it
// is and what the GM asked. Do and Say go through the table's routes and
// gate (composerGate.ts); Private is the whisper route, a message only the
// GM reads, which never waits on the floor. The box stays open to write in
// while the floor is someone else's, so a move can be ready for its turn;
// only sending waits. No table talk (it happens out loud), no directions to
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
  });
}

export function CouchDock({
  state,
  sheet,
  turn,
  mode,
  onMode,
  inputRef,
  refreshWhispers,
  hidden,
}: {
  state: CampaignState;
  sheet: CharacterSheet;
  turn: CouchTurn;
  mode: CouchMode;
  onMode: (mode: CouchMode) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  refreshWhispers: () => Promise<void>;
  hidden: boolean;
}) {
  const { campaign, me } = state;
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [passing, setPassing] = useState(false);
  const [error, setError] = useState("");
  const noteId = useId();
  useTurnBuzz(turn.tone);
  const expanded = focused || input.length > 0;
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
  const isPrivate = mode === "private";
  const capped = isPrivate && privateCapped(state.whispers);
  // Why this send has to wait, when it does; writing never does.
  const held = ended
    ? "The story has ended."
    : isPrivate
      ? capped
        ? "Wait for the GM to answer your last messages."
        : ""
      : muted
        ? "The host has muted you at this table. Private still reaches the GM."
        : gate.inputBlocked
          ? "Not your move yet: this sends when it is. Private reaches the GM now."
          : "";
  const placeholder = ended
    ? "The story has ended."
    : isPrivate
      ? "Only the GM reads this"
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

  async function pass() {
    setPassing(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign!.id}/pass`, { method: "POST" });
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
      {value === "private" ? <Lock className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </button>
  );

  return (
    <div className="couch-dock" hidden={hidden}>
      <div className="couch-col couch-dock-inner">
        <TurnLine turn={turn} passing={passing} onPass={() => void pass()} />
        <form
          className="couch-composer"
          data-expanded={expanded ? "" : undefined}
          data-private={isPrivate ? "" : undefined}
          onSubmit={submit}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          {isPrivate && !expanded ? <Lock className="couch-composer-lock size-4" aria-hidden="true" /> : null}
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
            disabled={ended}
            placeholder={placeholder}
            aria-label={
              isPrivate ? "Private message to the GM" : mode === "do" ? `What ${sheet.name} does` : `What ${sheet.name} says`
            }
            aria-describedby={noteId}
            aria-invalid={tooLong || undefined}
            enterKeyHint="send"
            className="couch-composer-input"
          />
          {expanded ? (
            <div className="couch-composer-modes" role="group" aria-label="What to send">
              {modeButton("do", "Do")}
              {modeButton("say", "Say")}
              {modeButton("private", "Private")}
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
        <p id={noteId} className={tooLong || (held && input.trim()) ? "couch-composer-note" : "sr-only"} aria-live="polite">
          {tooLong
            ? `${length - maxChars} characters over the limit.`
            : held || `${isPrivate ? "Only the GM reads this. " : ""}Up to ${maxChars} characters.`}
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

// Whose move it is, in one line, and the GM's question in full when it
// asked one. Pass sits beside it while the table waits on this player.
function TurnLine({ turn, passing, onPass }: { turn: CouchTurn; passing: boolean; onPass: () => void }) {
  if (!turn.headline) return null;
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
            onClick={onPass}
            disabled={passing}
            title="Nothing to add this time: the GM stops waiting on you."
          >
            Pass
          </button>
        ) : null}
      </div>
      {turn.prompt ? <p className="couch-turn-prompt">{turn.prompt}</p> : null}
    </div>
  );
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
