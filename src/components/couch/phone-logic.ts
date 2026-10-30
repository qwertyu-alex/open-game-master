// The couch phone's decisions (docs/couch-mode-spec.md 2.7), the pure half:
// what the line above the action box says (is it my turn, who the GM is
// waiting on, what it asked), how a GM passage splits around its dice, and
// which private messages stay in sight. No React, no fetch and no clock, so
// scripts/test-couch-phone.mjs imports it directly.
import { couchParagraphs, gmStatusWords } from "@/components/couch/couch-logic";
import type { DmStatus } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { Floor } from "@/lib/db/campaigns";

// ---- whose turn ----

export type CouchTurn = {
  // "yours" asks this player for something, "gm" is the GM at work,
  // "waiting" is someone else's move, and "quiet" has nothing to say (the
  // line is not drawn) or says why the box is shut.
  tone: "yours" | "waiting" | "gm" | "quiet";
  headline: string;
  // The GM's question, when the floor carries one: on a couch the prompt is
  // the thing a player looks down at their phone to read.
  prompt: string;
  // Pass is the table wait's "go on without me" (api/.../pass), so it is
  // offered only where that route answers: the open floor's wait.
  canPass: boolean;
};

export function listNames(names: readonly string[]): string {
  const clean = names.filter(Boolean);
  return clean.length <= 1 ? clean.join("") : `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`;
}

export function couchTurn(input: {
  ended: boolean;
  muted: boolean;
  // Rolls the GM asked this player for that are still waiting.
  myRolls: number;
  dmStatus: DmStatus;
  floor: Floor;
  meUserId: string;
  // Player id to character name, for the spotlight and the fight.
  names: Readonly<Record<string, string>>;
  // The open floor's wait (tableWait.waitingOn), while the GM is idle.
  waitingOn: ReadonlyArray<{ userId: string; name: string }>;
  // The GM's last turn crashed and nothing has answered since
  // (couchHaltedTurn): the phone says so rather than showing an idle table.
  halted?: boolean;
}): CouchTurn {
  const line = (tone: CouchTurn["tone"], headline: string, prompt = "", canPass = false): CouchTurn => ({ tone, headline, prompt, canPass });
  const nameOf = (userId: string) => input.names[userId] || "another player";
  if (input.ended) return line("quiet", "The story has ended.");
  if (input.muted) return line("quiet", "The host has muted you at this table.");
  if (input.myRolls > 0) return line("yours", input.myRolls === 1 ? "The GM wants a roll from you" : "The GM wants rolls from you");
  const gm = gmStatusWords(input.dmStatus);
  if (gm) return line("gm", `${gm}…`);
  if (input.halted) return line("waiting", "The GM hit a problem. The host can retry it from the TV, or send your next move.");
  const floor = input.floor;
  if (floor.mode === "spotlight") {
    const prompt = floor.prompt.trim();
    const pending = floor.userIds.filter((id) => !floor.respondedUserIds.includes(id));
    if (pending.includes(input.meUserId)) return line("yours", "Your turn", prompt);
    if (pending.length) return line("waiting", `Waiting on ${listNames(pending.map(nameOf))}`, prompt);
    return line("gm", "The GM is about to answer…");
  }
  if (floor.mode === "initiative") {
    return floor.userIds.includes(input.meUserId)
      ? line("yours", "Your turn in the fight")
      : line("waiting", `${floor.currentName || "Another hero"}'s turn in the fight`);
  }
  if (floor.mode === "hold") return line("waiting", "Hold on: the GM will open the floor in a moment");
  const mine = input.waitingOn.some((seat) => seat.userId === input.meUserId);
  const others = input.waitingOn.filter((seat) => seat.userId !== input.meUserId).map((seat) => seat.name);
  if (mine) {
    return line("yours", others.length ? `The GM is waiting on you and ${listNames(others)}` : "The GM is waiting on you", "", true);
  }
  if (others.length) return line("waiting", `The GM is waiting on ${listNames(others)}`);
  return line("quiet", "");
}

// ---- a passage and its dice ----

export type PassagePart = { kind: "text"; paragraphs: string[] } | { kind: "roll"; id: string };

// The server's own markers only ("[roll:<uuid>]"): a marker the model wrote
// by hand names no stored roll and goes with the rest of the tool text.
const SERVER_ROLL = /\[roll:([0-9a-f-]{36})\]/gi;

// A GM passage as the phone sets it: its paragraphs, with each roll the
// server recorded standing where the GM rolled it, so a player who looked
// away reads the check and its result in the place it changed the story.
export function passageParts(content: string): PassagePart[] {
  const parts: PassagePart[] = [];
  const seen = new Set<string>();
  const pushText = (segment: string) => {
    const paragraphs = couchParagraphs(segment);
    if (paragraphs.length) parts.push({ kind: "text", paragraphs });
  };
  let last = 0;
  for (const match of content.matchAll(SERVER_ROLL)) {
    pushText(content.slice(last, match.index));
    last = (match.index ?? 0) + match[0].length;
    const id = match[1].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      parts.push({ kind: "roll", id });
    }
  }
  pushText(content.slice(last));
  return parts;
}

// What a roll was for, in words (src/lib/couch/roll-feedback-logic.ts), so
// the story's chips, the roll screen and the TV name a check the same way.
export { rollWhat } from "@/lib/couch/roll-feedback-logic";

// ---- the private line ----

// Unanswered messages to the GM a player may have waiting at once, as the
// table's whisper panel allows.
export const PRIVATE_PENDING_CAP = 2;
export const PRIVATE_MAX_CHARS = 500;

type ThreadWhisper = { id: string; direction: "to_player" | "to_dm"; read: boolean; answered: boolean; createdAt: string };

export function privateCapped(whispers: readonly ThreadWhisper[]): boolean {
  return whispers.filter((whisper) => whisper.direction === "to_dm" && !whisper.answered).length >= PRIVATE_PENDING_CAP;
}

// Oldest first, the last `recent` in sight and every unread word from the GM
// with them however old: a secret folded away unread is a secret missed.
export function privateThread<T extends ThreadWhisper>(
  whispers: readonly T[],
  showAll: boolean,
  recent = 2,
): { shown: T[]; hidden: number } {
  const thread = [...whispers].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (showAll) return { shown: thread, hidden: 0 };
  const keep = new Set(thread.slice(-recent).map((whisper) => whisper.id));
  for (const whisper of thread) {
    if (whisper.direction === "to_player" && !whisper.read) keep.add(whisper.id);
  }
  const shown = thread.filter((whisper) => keep.has(whisper.id));
  return { shown, hidden: thread.length - shown.length };
}
