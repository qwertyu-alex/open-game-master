// Couch mode's screens (docs/couch-mode-spec.md 2.6, 2.7), the pure half:
// which screen a seat gets, what a GM passage reads like once the voice's
// stage directions and the dice markers are out of it, how a passage is cut
// into subtitles for the TV, and which address a phone in the room can reach.
// No React, no fetch and no clock, so scripts/test-couch-logic.mjs imports it
// directly; the components in this folder hold the state and the timers.
import { stripToolText, withoutRollMarkers } from "@/lib/dm/tool-text";
import { isOocAnswer } from "@/lib/dm/ooc-question";
import { sceneComposition } from "@/lib/dm/scene-shot-logic";
import { recapParagraphs } from "@/lib/recap";
import type { CampaignMessage } from "@/lib/db/messages";
import { haltedTurnPrefix } from "@/lib/campaign-types";
import type { DmStatus } from "@/app/campaigns/[campaignId]/useCampaignStream";

// ---- which screen ----

export type CouchSeatView = "normal" | "tv" | "phone-lobby" | "phone-play";

// The lead's account is the TV in couch mode (game-settings.ts couchMode):
// it plays no character and its screen is the room's. Everyone else holds a
// phone. The lead keeps the ordinary host screens behind ?host=1, for the
// settings and anything else the night needs fixing; a campaign that is not
// in couch mode is never touched.
export function couchSeatView(input: {
  couchMode: boolean;
  isLead: boolean;
  hostParam: boolean;
  status: "lobby" | "active" | "ended";
}): CouchSeatView {
  if (!input.couchMode) {
    return "normal";
  }
  if (input.isLead) {
    return input.hostParam ? "normal" : "tv";
  }
  return input.status === "lobby" ? "phone-lobby" : "phone-play";
}

// ---- what the GM wrote, as the couch reads it ----

// ElevenLabs delivery tags the GM may write into narration ("[whispers]",
// "[breathing heavily]"): they shape the voice and are never shown. Lower
// case in any script, so a tag written in the table's language goes too.
// The whitespace after a tag goes with it, so "[whispers] Get down" leaves
// no gap behind the quote mark.
const AUDIO_TAG = /\[\p{Ll}[\p{Ll} ,'-]{1,30}\][ \t]*/gu;
const SPACE_RUN = /[ \t]{2,}/g;
const SPACE_BEFORE_MARK = /[ \t]+([.,!?;:…])/g;
const LINE_EDGE_SPACE = /^[ \t]+|[ \t]+$/gm;

export function stripAudioTags(text: string): string {
  return text
    .replace(AUDIO_TAG, "")
    .replace(SPACE_RUN, " ")
    .replace(SPACE_BEFORE_MARK, "$1")
    .replace(LINE_EDGE_SPACE, "");
}

// A GM passage for the couch: no leaked tool text, no dice markers (the
// couch shows no inline roll cards; the TV shows the roll itself), no voice
// tags. Markdown emphasis stays for the phone, which renders it.
export function couchPassage(content: string): string {
  return stripAudioTags(withoutRollMarkers(stripToolText(content))).trim();
}

// The same passage as paragraphs: the phone sets each in its own block.
export function couchParagraphs(content: string): string[] {
  return couchPassage(content)
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ---- the story, as the phone shows it ----

export type StoryEntry = {
  id: string;
  kind: "gm" | "player";
  content: string;
  characterId: string | null;
  userId: string | null;
  imageUrl: string | null;
  // The picture is an insert (scene-shot-logic.ts): a square close-up of a
  // thing found, not the place.
  imageInsert: boolean;
};

// The newest GM passage stays open, with what the players said after it
// (the beat they are answering now); everything before it folds under
// "Earlier", the last `earlierLimit` entries of it. Table talk and system
// lines stay off the couch: talk happens out loud, and the host fixes a
// stuck turn from the host screen.
export function storyBeats(
  messages: ReadonlyArray<Pick<CampaignMessage, "id" | "authorType" | "content" | "characterId" | "userId" | "generatedImage">>,
  earlierLimit = 8,
): { earlier: StoryEntry[]; latest: StoryEntry | null; after: StoryEntry[] } {
  const entries: StoryEntry[] = [];
  for (const message of messages) {
    if (message.authorType === "system" || isOocAnswer(message.content)) {
      continue;
    }
    entries.push({
      id: message.id,
      kind: message.authorType === "dm" ? "gm" : "player",
      content: message.content,
      characterId: message.characterId,
      userId: message.userId,
      imageUrl: message.generatedImage?.url ?? null,
      imageInsert: message.generatedImage?.shot?.kind === "insert",
    });
  }
  let at = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].kind === "gm") {
      at = index;
      break;
    }
  }
  if (at < 0) {
    return { earlier: [], latest: null, after: entries };
  }
  return {
    earlier: entries.slice(Math.max(0, at - earlierLimit), at),
    latest: entries[at],
    after: entries.slice(at + 1),
  };
}

// The newest GM passage, for the TV's subtitles.
export function latestNarration(
  messages: ReadonlyArray<Pick<CampaignMessage, "id" | "authorType" | "content">>,
): { id: string; content: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.authorType === "dm" && !isOocAnswer(message.content) && couchPassage(message.content)) {
      return { id: message.id, content: message.content };
    }
  }
  return null;
}

// The TV's pictures: the place, which stays until the next picture of a
// place lands, and a thing found there beside it while that is the newest
// picture (scene-shot-logic.ts sceneComposition). With no place painted
// yet, the caller's cover stands in for it.
export function tvPictures(messages: ReadonlyArray<Pick<CampaignMessage, "generatedImage">>): { scene: string | null; insert: string | null } {
  const { stage, insert } = sceneComposition(messages);
  return { scene: stage?.url ?? null, insert: insert?.url ?? null };
}

// ---- subtitles ----

// A page fits about three lines of the TV's subtitle type at 16:9.
export const SUBTITLE_PAGE_CHARS = 170;

const SENTENCE_END = /(?<=[.!?…]["”’)]?)\s+/u;
const SPACES = /\s+/u;

// A passage as subtitle pages: whole sentences gathered up to `maxChars`, a
// paragraph always starting a fresh page, and a sentence longer than a page
// broken between words. Plain text: emphasis markers and dice markers gone.
export function subtitlePages(content: string, maxChars = SUBTITLE_PAGE_CHARS): string[] {
  const pages: string[] = [];
  for (const paragraph of recapParagraphs(couchPassage(content))) {
    let page = "";
    const flush = () => {
      if (page) {
        pages.push(page);
        page = "";
      }
    };
    for (const sentence of paragraph.split(SENTENCE_END).filter(Boolean)) {
      if (sentence.length > maxChars) {
        flush();
        for (const word of sentence.split(SPACES).filter(Boolean)) {
          if (page && page.length + 1 + word.length > maxChars) {
            flush();
          }
          page = page ? `${page} ${word}` : word;
        }
        continue;
      }
      if (page && page.length + 1 + sentence.length > maxChars) {
        flush();
      }
      page = page ? `${page} ${sentence}` : sentence;
    }
    flush();
  }
  return pages;
}

// Keep a little of what was said in sight, including across GM turns. Stop
// at the passage being voiced: newer messages may already be in the stream.
export function previousSubtitlePages(
  messages: ReadonlyArray<Pick<CampaignMessage, "id" | "authorType" | "content">>,
  passageId: string,
  page: number,
): Array<{ id: string; content: string }> {
  const at = messages.findIndex((message) => message.id === passageId);
  if (at < 0 || messages[at].authorType !== "dm") return [];
  const earlier: Array<{ id: string; content: string }> = [];
  for (let index = at; index >= 0 && earlier.length < 2; index -= 1) {
    const message = messages[index];
    if (message.authorType !== "dm" || isOocAnswer(message.content)) continue;
    const pages = subtitlePages(message.content);
    const end = index === at ? Math.min(Math.max(0, Math.floor(page)), pages.length - 1) : pages.length;
    for (let cursor = end - 1; cursor >= 0 && earlier.length < 2; cursor -= 1) {
      earlier.unshift({ id: `${message.id}:${cursor}`, content: pages[cursor] });
    }
  }
  return earlier;
}

// How long a page stays up. Read aloud it follows the narrator's pace
// (about fourteen characters a second); read silently, a little quicker,
// with a beat to find the line. The last page never turns.
export const VOICE_CHARS_PER_SECOND = 14;
export const READ_CHARS_PER_SECOND = 17;

export function subtitlePageMs(page: string, voiced: boolean): number {
  const ms = voiced
    ? (page.length / VOICE_CHARS_PER_SECOND) * 1000
    : (page.length / READ_CHARS_PER_SECOND) * 1000 + 1200;
  return Math.round(Math.min(16000, Math.max(voiced ? 2500 : 3500, ms)));
}

// ---- secrets on a phone ----

const FILLER = "aenorstilmdc";

// What a hidden agenda shows while nobody is holding it: the shape of the
// text, letter for letter, with none of its letters. Blurred on top of that,
// so a neighbour sees a smudge and the page holds nothing to read off it.
export function maskSecret(text: string): string {
  let index = 0;
  return text.replace(/\S/gu, () => FILLER[index++ % FILLER.length]);
}

const ROMAN = ["I", "II", "III", "IV", "V"];

export function actNumeral(act: number): string {
  return ROMAN[act] ?? String(act + 1);
}

// ---- health ----

export function healthView(current: number, max: number): { pct: number; tone: "ok" | "hurt" | "down" } {
  const safeMax = Math.max(1, max);
  const pct = Math.max(0, Math.min(100, Math.round((Math.max(0, current) / safeMax) * 100)));
  return { pct, tone: current <= 0 ? "down" : pct <= 34 ? "hurt" : "ok" };
}

// ---- joining from the room ----

const PRIVATE_HOST = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

// A phone may use mobile data or a Wi-Fi network that isolates guests, so
// prefer the server's public address even when the TV opened a local one.
// Without a public address, keep the room's network as the fallback.
export function pickJoinOrigin(input: { pageOrigin: string; lanUrls: readonly string[]; publicUrl: string }): string {
  const clean = (origin: string) => origin.trim().replace(/\/+$/, "");
  const publicUrl = clean(input.publicUrl);
  if (publicUrl) {
    return publicUrl;
  }
  const page = clean(input.pageOrigin);
  if (PRIVATE_HOST.test(hostOf(page))) {
    return page;
  }
  const lan = input.lanUrls.map(clean).filter(Boolean);
  return lan.find((origin) => PRIVATE_HOST.test(hostOf(origin))) ?? lan[0] ?? page;
}

// The address and the path a phone's camera opens.
export function joinLink(origin: string, inviteCode: string): string {
  const code = inviteCode.trim();
  return origin && code ? `${origin}/join/${code}` : "";
}

// ---- the crew the forge wrote (GET /api/campaigns/[id]/couch) ----

export type CouchCrewCard = {
  id: string;
  name: string;
  crewRole: string;
  backstory: string;
  portraitUrl: string | null;
  claimedBy: { userId: string; name: string } | null;
};

export type CouchRoster = {
  status: "forging" | "ready" | "failed";
  error: string;
  scenario: { title: string; logline: string; briefing: string } | null;
  crew: CouchCrewCard[];
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// The route's answer read defensively: it is being built alongside these
// screens, and a field it leaves out reads as empty rather than breaking
// the lobby on the night.
export function normalizeRoster(raw: unknown): CouchRoster {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status = body.status === "ready" || body.status === "failed" ? body.status : "forging";
  const scenarioRaw = body.scenario && typeof body.scenario === "object" ? (body.scenario as Record<string, unknown>) : null;
  const crew = Array.isArray(body.crew) ? body.crew : [];
  return {
    status,
    error: text(body.error),
    scenario: scenarioRaw
      ? { title: text(scenarioRaw.title), logline: text(scenarioRaw.logline), briefing: text(scenarioRaw.briefing) }
      : null,
    crew: crew.flatMap((entry): CouchCrewCard[] => {
      const card = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      const id = text(card.id);
      if (!id) {
        return [];
      }
      const claimed = card.claimedBy && typeof card.claimedBy === "object" ? (card.claimedBy as Record<string, unknown>) : null;
      return [
        {
          id,
          name: text(card.name),
          crewRole: text(card.crewRole),
          backstory: text(card.backstory),
          portraitUrl: text(card.portraitUrl) || null,
          claimedBy: claimed && text(claimed.userId) ? { userId: text(claimed.userId), name: text(claimed.name) } : null,
        },
      ];
    }),
  };
}

// Whether every crew card has a player, which is when the TV's Begin opens
// (the server's gate decides; this only says why the button waits).
export function unclaimedCount(roster: Pick<CouchRoster, "crew"> | null): number {
  return roster ? roster.crew.filter((card) => !card.claimedBy).length : 0;
}

// ---- the GM at work ----

export function gmStatusWords(status: DmStatus): string {
  switch (status) {
    case "thinking":
    case "narrating":
      return "The GM is writing";
    case "rolling":
      return "Dice are rolling";
    case "awaiting_rolls":
      return "Waiting on a roll";
    case "writing_chapter":
    case "plotting_arc":
      return "The GM is taking notes";
    default:
      return "";
  }
}

// A GM turn that crashed, while its notice (src/lib/dm/turn-halt.ts) is
// still the GM's newest word. The couch screens show no system lines, so
// without this a halted turn looks like a GM that simply never answers. A
// passage after the notice means the story moved on, and a claimed retry
// takes the notice's dmTurnId; either way there is nothing to show.
export function couchHaltedTurn(
  messages: ReadonlyArray<Pick<CampaignMessage, "id" | "authorType" | "content" | "dmTurnId">>,
): { id: string; turnId: string; reason: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.authorType === "dm") return null;
    const prefix = message.authorType === "system" ? haltedTurnPrefix(message.content) : "";
    if (!prefix) continue;
    if (!message.dmTurnId) return null;
    const stated = message.content.slice(prefix.length).trim();
    return { id: message.id, turnId: message.dmTurnId, reason: stated.charAt(0).toUpperCase() + stated.slice(1) };
  }
  return null;
}
