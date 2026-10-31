// The couch phone's decisions (docs/couch-mode-spec.md 2.7), the pure half:
// what the line above the action box says (is it my turn, who the GM is
// waiting on, what it asked), how a GM passage splits around its dice, and
// where each private exchange stands in the story. No React, no fetch and no clock, so
// scripts/test-couch-phone.mjs imports it directly.
import { couchParagraphs, gmStatusWords } from "@/components/couch/couch-logic";
import type { DmStatus } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { Floor } from "@/lib/db/campaigns";
import { fightTurnWords, type CouchFight } from "@/lib/couch/fight-logic";

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
  // The fight holding the floor (fight-logic.ts couchFight), and this
  // player's characters, so the line names whose move it is and when theirs
  // comes rather than only that it is not theirs.
  fight?: CouchFight | null;
  myCharacterIds?: ReadonlySet<string>;
  // This player's character stands somewhere the story is not, while the
  // crew is split (src/lib/couch/whereabouts.ts): where they are, and where
  // the scene is and with whom.
  offScene?: { place: string; scenePlace: string; sceneNames: readonly string[] } | null;
}): CouchTurn {
  const line = (tone: CouchTurn["tone"], headline: string, prompt = "", canPass = false): CouchTurn => ({ tone, headline, prompt, canPass });
  const nameOf = (userId: string) => input.names[userId] || "another player";
  if (input.ended) return line("quiet", "The story has ended.");
  if (input.muted) return line("quiet", "The host has muted you at this table.");
  if (input.myRolls > 0) return line("yours", input.myRolls === 1 ? "The GM wants a roll from you" : "The GM wants rolls from you");
  // A question the GM put to this player is their turn, wherever the map
  // last said they stand: the two arrive as separate events, and a phone
  // must never hide a question behind "the story is elsewhere".
  const askedMe = input.floor.mode === "spotlight" && input.floor.userIds.includes(input.meUserId) && !input.floor.respondedUserIds.includes(input.meUserId);
  if (input.offScene && !askedMe) {
    const away = input.offScene;
    return line(
      "waiting",
      `The story is with ${listNames(away.sceneNames)} in ${away.scenePlace}`,
      `You're in ${away.place}. Send your next move any time: the GM plays it when the story cuts back to you.`,
    );
  }
  const gm = gmStatusWords(input.dmStatus);
  if (gm) return line("gm", `${gm}…`);
  if (input.halted) return line("waiting", "The GM hit a problem. The host can retry it from the TV, or send your next move.");
  const floor = input.floor;
  const fightFloor = floor.mode === "initiative" || (floor.mode === "hold" && floor.next.mode === "initiative");
  if (input.fight && fightFloor) {
    const words = fightTurnWords(input.fight, input.myCharacterIds ?? new Set());
    return line(words.mine ? "yours" : "waiting", words.headline, words.prompt);
  }
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

// One private exchange: what the player asked and what the GM told them
// back, folded into the story where it was asked rather than parked in a
// card under the newest passage. A card there covered the scene on every
// beat once a player had asked anything.
export type PrivateExchange<T extends ThreadWhisper> = {
  id: string;
  // The story entry it follows (null: before the first one).
  anchorId: string | null;
  whispers: T[];
  // GM words this player has not read yet: the exchange cannot fold.
  unread: boolean;
  // A question the GM has not answered yet.
  waiting: boolean;
  // The story has moved on past its last message.
  settled: boolean;
  // Whether it shows open unless the player folds it: while something in
  // it is new, waiting or still the latest thing said.
  open: boolean;
};

// Oldest first. Each whisper stands after the story entry it was sent
// behind, and a follow-up asked before the story moves on joins the same
// exchange. The GM answers on its next turn, after that turn's passage has
// moved the story on, so its first word after an unanswered question goes
// back to the question instead of standing alone further down.
export function privateExchanges<T extends ThreadWhisper>(
  whispers: readonly T[],
  story: ReadonlyArray<{ id: string; createdAt: string }>,
): PrivateExchange<T>[] {
  const at = (iso: string) => Date.parse(iso) || 0;
  const thread = [...whispers].sort((a, b) => at(a.createdAt) - at(b.createdAt));
  const groups: Array<{ anchorId: string | null; whispers: T[] }> = [];
  const anchorOf = (whisper: T) => {
    let anchor: string | null = null;
    for (const entry of story) {
      if (at(entry.createdAt) > at(whisper.createdAt)) break;
      anchor = entry.id;
    }
    return anchor;
  };
  for (const whisper of thread) {
    if (whisper.direction === "to_player") {
      const asking = groups.findLast((group) => group.whispers.at(-1)?.direction === "to_dm");
      if (asking) {
        asking.whispers.push(whisper);
        continue;
      }
    }
    const anchorId = anchorOf(whisper);
    const last = groups.at(-1);
    if (last && last.anchorId === anchorId) last.whispers.push(whisper);
    else groups.push({ anchorId, whispers: [whisper] });
  }
  const newestStory = story.reduce((newest, entry) => Math.max(newest, at(entry.createdAt)), 0);
  return groups.map((group) => {
    const unread = group.whispers.some((whisper) => whisper.direction === "to_player" && !whisper.read);
    const waiting = group.whispers.some((whisper) => whisper.direction === "to_dm" && !whisper.answered);
    const settled = newestStory > at(group.whispers.at(-1)!.createdAt);
    return { id: group.whispers[0].id, anchorId: group.anchorId, whispers: group.whispers, unread, waiting, settled, open: unread || waiting || !settled };
  });
}
