// Stand-in players for testing a couch night, the pure half: what the
// stand-ins owe the night (the seats the GM waits on, their rolls, their
// truce answers) and the prompt an AI player answers. Read from a view
// shaped like a player's snapshot (GET /api/campaigns/[id]), so the TV's
// Play a turn (src/lib/couch/autoplay.ts) and the terminal's
// scripts/couch-autoplay.mjs read it alike. No imports, so
// scripts/test-couch-autoplay.mjs loads it directly.

type Message = { seq: number; authorType: string; userId?: string | null; characterId?: string | null; content: string };
type Floor = { mode: string; userIds?: string[]; respondedUserIds?: string[]; prompt?: string };
type Agenda = { acts: string[]; act?: number; hiddenRole?: string } | null | undefined;
export type AutoplaySheet = {
  id: string;
  userId: string;
  name: string;
  class?: string;
  crewRole?: string;
  currentHp?: number;
  maxHp?: number;
  conditions?: string[];
  equipment?: Array<{ name: string; qty?: number }>;
  appearance?: string;
  notes?: string;
  backstory?: string;
  agenda?: Agenda;
  isCompanion?: boolean;
};
export type AutoplayView = {
  campaign: { status: string; floor?: Floor } | null;
  dmStatus: string;
  messages: Message[];
  sheets: AutoplaySheet[];
  tableWait?: { waitingOn: Array<{ userId: string }> } | null;
  pendingRolls?: Array<{ id: string; userId: string; expression?: string; reason?: string }>;
  couchTruce?: { id: string; status: string; members: Array<{ characterId: string; name: string; answer: string }> } | null;
  couchObjective?: { text: string; clock?: string } | null;
  couchFinale?: unknown;
  tableBreak?: unknown;
  safetyPause?: unknown;
};
export type AutoplayMove = { kind: "do" | "say" | "pass"; content: string };

// Rolls are thrown, truces answered and moves written only while the night
// is in play: not in the lobby, after the finale, on a table break or a
// safety pause.
export function nightPaused(view: AutoplayView): string {
  if (view.campaign?.status !== "active") return view.campaign?.status === "ended" ? "the night has ended" : "the night has not started";
  if (view.couchFinale) return "the finale is showing";
  if (view.tableBreak) return "the table is on a break";
  if (view.safetyPause) return "the table is paused for safety";
  return "";
}

// The newest GM passage's seq, or 0 before the GM has spoken.
export function lastGmSeq(messages: readonly Message[]): number {
  let seq = 0;
  for (const message of messages ?? []) if (message.authorType === "dm" && message.seq > seq) seq = message.seq;
  return seq;
}

// Which of the stand-ins the GM waits on now, read as the TV's "Waiting on"
// line is (src/components/couch/couch-logic.ts tvTurnSeats), less any that
// has already answered the newest GM passage: posted after it, or handled
// it elsewhere (a pass posts nothing, so the caller remembers it).
export function dueBots(view: AutoplayView, botUserIds: readonly string[], handled: Record<string, number> = {}): string[] {
  if (nightPaused(view) || view.dmStatus !== "idle") return [];
  const gmSeq = lastGmSeq(view.messages);
  if (!gmSeq) return [];
  const floor = view.campaign?.floor ?? { mode: "open" };
  let asked: string[];
  if (floor.mode === "spotlight") {
    const answered = new Set(floor.respondedUserIds ?? []);
    asked = (floor.userIds ?? []).filter((id) => !answered.has(id));
  } else if (floor.mode === "initiative") {
    asked = floor.userIds ?? [];
  } else if (floor.mode === "open") {
    asked = view.tableWait ? view.tableWait.waitingOn.map((seat) => seat.userId) : [...botUserIds];
  } else {
    asked = [];
  }
  const postedSince = new Set(
    view.messages.filter((m) => m.authorType === "player" && m.seq > gmSeq && m.userId).map((m) => m.userId as string),
  );
  return asked.filter((id) => botUserIds.includes(id) && !postedSince.has(id) && (handled[id] ?? 0) < gmSeq);
}

export function botRolls(view: AutoplayView, botUserIds: readonly string[]) {
  if (nightPaused(view)) return [];
  return (view.pendingRolls ?? []).filter((roll) => botUserIds.includes(roll.userId));
}

// The open truce's questions to the stand-ins' characters, still unanswered.
export function botTruceAnswers(view: AutoplayView, botSheetIds: readonly string[]) {
  const truce = view.couchTruce;
  if (nightPaused(view) || !truce || truce.status !== "open") return [];
  return truce.members
    .filter((member) => member.answer === "waiting" && botSheetIds.includes(member.characterId))
    .map((member) => ({ truce, member }));
}

// A stand-in takes a truce more often than not, so a test fight is also
// seen ending by one.
export const TRUCE_ACCEPT_CHANCE = 0.6;

// GM prose as a player hears it: roll markers and voice cues dropped.
export function gmText(content: string): string {
  return String(content ?? "")
    .replace(/\[roll:[^\]]*\]/g, "")
    .replace(/\[(?:[a-z][a-z ,'-]{0,30})\]\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The last few lines of the night, named.
export function transcript(view: AutoplayView, limit = 16): string {
  const names = new Map(view.sheets.map((sheet) => [sheet.id, sheet.name]));
  return view.messages
    .filter((m) => m.authorType !== "system")
    .slice(-limit)
    .map((m) => (m.authorType === "dm" ? `GM: ${gmText(m.content)}` : `${names.get(m.characterId ?? "") ?? "A player"}: ${m.content}`))
    .join("\n\n");
}

// The act's agenda (and who they really are, for the one with a hidden role).
function agendaLine(agenda: Agenda): string {
  if (!agenda?.acts?.length) return "";
  const act = Math.max(0, Math.min(agenda.acts.length - 1, agenda.act ?? 0));
  return `${agenda.acts[act]}${agenda.hiddenRole ? ` Who you really are: ${agenda.hiddenRole}` : ""}`;
}

export function playerPrompt({ view, sheet, note = "" }: { view: AutoplayView; sheet: AutoplaySheet; note?: string }): string {
  const floor = view.campaign?.floor ?? { mode: "open" };
  const crew = view.sheets
    .filter((other) => !other.isCompanion && other.id !== sheet.id)
    .map((other) => `${other.name} (${other.crewRole || other.class})`)
    .join(", ");
  const gear = (sheet.equipment ?? []).map((item) => ((item.qty ?? 1) > 1 ? `${item.name} x${item.qty}` : item.name)).join(", ");
  const agenda = agendaLine(sheet.agenda);
  return [
    `You are a player at a couch game night: friends in one room, an AI GM running a sci-fi horror one-shot on the TV, each player typing on their phone. You play ${sheet.name}.`,
    "",
    "Your character:",
    `- ${sheet.name}, ${sheet.crewRole || sheet.class}. HP ${sheet.currentHp}/${sheet.maxHp}.${sheet.conditions?.length ? ` Conditions: ${sheet.conditions.join(", ")}.` : ""}`,
    sheet.appearance ? `- Looks: ${sheet.appearance}` : "",
    sheet.notes ? `- ${sheet.notes.replace(/\n/g, "\n- ")}` : "",
    sheet.backstory ? `- Backstory: ${sheet.backstory}` : "",
    gear ? `- Carrying: ${gear}` : "",
    agenda ? `- Your SECRET agenda (the others do not know it; pursue it when you can, never announce it): ${agenda}` : "",
    crew ? `The rest of the crew: ${crew}.` : "",
    view.couchObjective ? `The crew's objective: ${view.couchObjective.text}${view.couchObjective.clock ? ` (${view.couchObjective.clock})` : ""}.` : "",
    floor.mode === "spotlight" && floor.prompt ? `The GM asks you directly: ${floor.prompt}` : "",
    "",
    "The story so far (newest last):",
    transcript(view),
    "",
    note ? `Direction from the person running this test (follow it): ${note}\n` : "",
    "Write your next move the way a real player types on a phone: one or two short sentences, in character, decisive, reacting to what just happened. Act, don't narrate outcomes; the GM decides those. Sometimes speak instead of act.",
    "Answer with exactly one line, starting with DO: for an action or SAY: for words spoken aloud in character. Nothing else.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// The model's answer as a move. Anything without a DO:/SAY: lead is taken
// as an action, quotes and stray labels trimmed.
export function parseMove(text: string): AutoplayMove | null {
  const line =
    String(text ?? "")
      .split("\n")
      .map((part) => part.trim())
      .find((part) => part) ?? "";
  const match = /^\**\s*(DO|SAY)\s*:\s*\**\s*(.*)$/i.exec(line);
  const kind = match?.[1]?.toLowerCase() === "say" ? "say" : "do";
  const content = (match ? match[2] : line).replace(/^["“]|["”]$/g, "").trim();
  return content ? { kind, content: content.slice(0, 600) } : null;
}

// A line typed at the terminal for a character: "say ..." or a leading
// quote speaks, "pass" passes, anything else is an action.
export function typedMove(text: string): AutoplayMove | null {
  const line = String(text ?? "").trim();
  if (!line) return null;
  if (/^(\/)?pass$/i.test(line)) return { kind: "pass", content: "" };
  const say = /^(?:say:?\s+|["“])(.*?)["”]?$/i.exec(line);
  if (say) return say[1].trim() ? { kind: "say", content: say[1].trim() } : null;
  return { kind: "do", content: line.replace(/^do:?\s+/i, "") };
}

// "Teddy: open it" → the sheet whose name starts with "Teddy" and the rest.
export function addressed<T extends { name: string }>(line: string, sheets: readonly T[]): { sheet: T; text: string } | null {
  const match = /^([^:!]{1,40}):\s*(.+)$/.exec(String(line ?? "").trim());
  if (!match) return null;
  const wanted = match[1].trim().toLowerCase();
  const found = sheets.filter((sheet) => {
    const name = sheet.name.toLowerCase();
    return name === wanted || name.split(/\s+/).includes(wanted) || name.startsWith(wanted);
  });
  return found.length === 1 ? { sheet: found[0], text: match[2] } : null;
}
