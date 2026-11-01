import { actName } from "@/lib/couch/prompt-logic";

// The act break (docs/couch-mode-spec.md 2.2, Act changes): when the GM
// turns the act, the story so far. ALIEN's cinematic scenarios close each
// act on its story points before cutting to the next; without them a night
// lost its thread after a pizza break, the TV went straight from a corridor
// to "Act II", and by act III the GM had forgotten what act I had settled.
// The GM writes the points with advance_act; the TV shows them before the
// new act's title, and the GM reads them every turn after. Then the crew,
// one by one: who earned story points this act by chasing their agenda,
// never what the agenda was, and a reminder that everyone's phone now holds
// a new one. The narrator reads the whole card aloud. Pure, for
// scripts/test-couch-agenda.mjs.

export const RECAP_POINTS_MAX = 4;
export const RECAP_POINT_MAX = 140;

// One crew member at the act break: the story points their agenda earned
// in the act that ended, and their total. The count is public (the TV shows
// the total anyway); what earned it stays theirs.
export type ActBreakCrew = { characterId: string; name: string; portraitUrl: string | null; earned: number; total: number };

// What the TV is sent at an act break: the act that ended, its story
// points, the crew's roll call, and the act that begins. Never a secret:
// the GM writes the points for the room, and the roll call names no agenda.
export type CouchActBreak = {
  id: string;
  ended: string;
  points: string[];
  crew: ActBreakCrew[];
  next: string;
  at: number;
};

type RollCallSheet = {
  id: string;
  name: string;
  isCompanion?: boolean;
  portrait?: { url?: string | null } | null;
  agenda?: { storyPoints: number } | null;
  deathSaves?: { dead?: boolean } | null;
};

// The crew at the break, in sheet order: the living who carry an agenda,
// each with the points the act's awards gave them (earned, by sheet id).
export function actRollCall(sheets: readonly RollCallSheet[], earned: Readonly<Record<string, number>>): ActBreakCrew[] {
  return sheets
    .filter((sheet) => !sheet.isCompanion && sheet.agenda && !sheet.deathSaves?.dead)
    .map((sheet) => ({
      characterId: sheet.id,
      name: sheet.name,
      portraitUrl: sheet.portrait?.url ?? null,
      earned: Math.max(0, Math.floor(earned[sheet.id] ?? 0)),
      total: sheet.agenda!.storyPoints,
    }));
}

// The act's awards as stored: story points by sheet id.
export function readActPoints(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const points: Record<string, number> = {};
  for (const [id, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) points[id] = Math.floor(count);
  }
  return points;
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (count: number) => COUNT_WORDS[count] ?? String(count);
const ACT_WORDS: Record<string, string> = { "Act I": "Act One", "Act II": "Act Two", "Act III": "Act Three" };
const spokenAct = (name: string) => ACT_WORDS[name] ?? name;

// What a crew member's line on the card says.
export function earnedWords(crew: ActBreakCrew): string {
  return crew.earned ? `+${crew.earned} story ${crew.earned === 1 ? "point" : "points"}` : "No story points";
}

export const NEW_AGENDA_LINE = "New agendas are on your phones. Keep them to yourselves.";

// What the narrator reads over the card, in the card's order: the act that
// ended, the story so far, each crew member's points, the new agendas.
export function actBreakSpeech(actBreak: Pick<CouchActBreak, "ended" | "next" | "points" | "crew">): string {
  const lines = [`End of ${spokenAct(actBreak.ended)}.`];
  if (actBreak.points.length) {
    lines.push("The story so far.", ...actBreak.points.map((point) => (/[.!?…]$/.test(point) ? point : `${point}.`)));
  }
  if (actBreak.crew.length) {
    if (actBreak.crew.some((crew) => crew.earned)) {
      lines.push("Story points for agendas pursued.");
      for (const crew of actBreak.crew) {
        lines.push(`${crew.name}, ${crew.earned ? countWord(crew.earned) : "none this act"}.`);
      }
    } else {
      lines.push("No story points this act.");
    }
    lines.push(`Everyone now holds a new agenda for ${spokenAct(actBreak.next)}. Check your phone, and keep it to yourself.`);
  }
  return lines.join(" ");
}

// The GM's recap, as a list or as one string of lines or "; " clauses (the
// host's Next act form has a single text field). Bullets and numbering
// dropped, each point one line, repeats and blanks gone, four at most.
export function readActRecap(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|;\s+|\s+•\s+/) : [];
  const points: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const text = entry
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const point = text.length > RECAP_POINT_MAX ? `${text.slice(0, RECAP_POINT_MAX - 1).trimEnd()}…` : text;
    if (points.some((seen) => seen.toLowerCase() === point.toLowerCase())) continue;
    points.push(point);
    if (points.length === RECAP_POINTS_MAX) break;
  }
  return points;
}

// The recaps as stored: one list per act that has ended, by act index.
export function readActRecaps(value: unknown): string[][] {
  return Array.isArray(value) ? value.map((entry) => readActRecap(entry)) : [];
}

// The GM's line every turn after an act break: what the earlier acts
// settled, so a long night's opening stays in reach after its messages have
// left the prompt. "" in act I.
export function storySoFarLine(recaps: readonly string[][], act: number): string {
  const parts = recaps
    .slice(0, Math.max(0, act))
    .map((points, index) => (points.length ? `${actName(index)}: ${points.join("; ")}.` : ""))
    .filter(Boolean);
  return parts.length ? `THE STORY SO FAR (the room saw these at each act break; build on them): ${parts.join(" ")}` : "";
}

// How long the TV holds the story so far: the heading, then each point
// long enough to read from the couch, and the act's title card only after.
export const ACT_BREAK_LEAD_MS = 2600;
export const ACT_BREAK_POINT_MS = 3800;
export const ACT_BREAK_TAIL_MS = 2000;

// Each crew member's line has its own beat, and the new agendas one more.
export const ACT_BREAK_CREW_MS = 2200;

export function actBreakMs(points: number, crew = 0): number {
  const roll = crew > 0 ? (crew + 1) * ACT_BREAK_CREW_MS + ACT_BREAK_POINT_MS : 0;
  return ACT_BREAK_LEAD_MS + Math.max(0, points) * ACT_BREAK_POINT_MS + roll + ACT_BREAK_TAIL_MS;
}
