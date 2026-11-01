import { z } from "zod";
import { jsonIn } from "@/lib/couch/forge-logic";
import { textKey } from "@/lib/language/text-logic";
import { NOT_YET } from "@/lib/couch/takeover-logic";

// The night's closing (docs/couch-mode-spec.md 2.2, "Finale reveal"): once
// the ending lands, the TV runs the reveal and every phone shows how its
// player did. Two halves: the facts the server knows for certain (who lived,
// every agenda, story points, the hidden role, the dice, the clock) and the
// prose one model call writes over the night's transcript (the headline,
// the recap, a verdict on each agenda, a highlight and an award each, and
// the GM's review with a grade). The facts never wait on the model: a reply
// that fails or never comes still closes the night, with plainer words.
// Pure, for scripts/test-couch-finale.mjs; the call and the writes are
// src/lib/couch/finale.ts.

export const FINALE_OUTCOMES = ["triumph", "escaped", "pyrrhic", "lost"] as const;
export type FinaleOutcome = (typeof FINALE_OUTCOMES)[number];

export const AGENDA_VERDICTS = ["done", "partly", "missed"] as const;
export type AgendaVerdict = (typeof AGENDA_VERDICTS)[number];

export const FINALE_GRADES = ["S", "A", "B", "C", "D", "F"] as const;
export type FinaleGrade = (typeof FINALE_GRADES)[number];

// What the TV shows beside each outcome, and the phone under its headline.
export const OUTCOME_WORDS: Record<FinaleOutcome, string> = {
  triumph: "They won",
  escaped: "They got out",
  pyrrhic: "They won at a cost",
  lost: "They were lost",
};

export const VERDICT_WORDS: Record<AgendaVerdict, string> = {
  done: "Pulled it off",
  partly: "Partly",
  missed: "Missed it",
};

// ---- the facts ----

export type FinaleStats = {
  minutes: number;
  // The act the night ended in, 0 to 2.
  act: number;
  gmReplies: number;
  moves: number;
  rolls: number;
  nat20s: number;
  nat1s: number;
  fights: number;
  deaths: number;
};

export type FinaleCrewFacts = {
  characterId: string;
  userId: string;
  name: string;
  crewRole: string;
  portraitUrl: string | null;
  dead: boolean;
  // Joined after a death (src/lib/couch/takeover.ts): played from a later act.
  tookOver: boolean;
  // The agendas of the acts they played, from act 0.
  agendas: Array<{ act: number; text: string }>;
  storyPoints: number;
  hiddenRole: string;
  moves: number;
  rolls: number;
  nat20s: number;
  nat1s: number;
};

export type FinaleFacts = {
  title: string;
  // What was really going on, from the forge's secret truth.
  truth: string;
  // The GM's own line when it called end_night, or the host's ending.
  ending: string;
  endedBy: "gm" | "host";
  stats: FinaleStats;
  crew: FinaleCrewFacts[];
  // The night's scene pictures, oldest first: the transcript numbers them
  // from 1 ("GM [picture 3]") so the model can pick one per beat.
  pictures: string[];
};

// What a sheet, its rolls and its moves say, read without a model.
export type CrewInput = {
  id: string;
  userId: string;
  name: string;
  crewRole?: string;
  portraitUrl?: string | null;
  isCompanion?: boolean;
  dead: boolean;
  agenda: { acts: string[]; act: number; hiddenRole: string; storyPoints: number } | null;
};

export type RollInput = { characterId: string | null; crit?: "nat20" | "nat1" | null };
export type MessageInput = { authorType: "player" | "dm" | "system"; characterId: string | null; createdAt: string };

export function finaleFacts(input: {
  title: string;
  truth: string;
  ending: string;
  endedBy: "gm" | "host";
  act: number;
  endedAt: string;
  crew: readonly CrewInput[];
  rolls: readonly RollInput[];
  messages: readonly MessageInput[];
  fights: number;
  pictures?: readonly string[];
}): FinaleFacts {
  const people = input.crew.filter((sheet) => !sheet.isCompanion && sheet.agenda);
  const played = (sheet: CrewInput) =>
    (sheet.agenda?.acts ?? [])
      .slice(0, Math.max(0, Math.min(2, sheet.agenda?.act ?? 0)) + 1)
      .map((text, act) => ({ act, text: text.trim() }))
      .filter((entry) => entry.text && entry.text !== NOT_YET);
  const rollsOf = (id: string | null) => input.rolls.filter((roll) => id === null || roll.characterId === id);
  const count = (rolls: readonly RollInput[], crit: "nat20" | "nat1") => rolls.filter((roll) => roll.crit === crit).length;
  // The clock runs from the first passage the GM read the room to the end.
  const firstGm = input.messages.find((message) => message.authorType === "dm");
  const from = Date.parse(firstGm?.createdAt ?? "");
  const to = Date.parse(input.endedAt);
  const crewIds = new Set(people.map((sheet) => sheet.id));
  const crewRolls = input.rolls.filter((roll) => roll.characterId && crewIds.has(roll.characterId));
  return {
    title: input.title,
    truth: input.truth,
    ending: input.ending.trim(),
    pictures: [...(input.pictures ?? [])],
    endedBy: input.endedBy,
    stats: {
      minutes: Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, Math.round((to - from) / 60000)) : 0,
      act: Math.max(0, Math.min(2, input.act)),
      gmReplies: input.messages.filter((message) => message.authorType === "dm").length,
      moves: input.messages.filter((message) => message.authorType === "player").length,
      rolls: crewRolls.length,
      nat20s: count(crewRolls, "nat20"),
      nat1s: count(crewRolls, "nat1"),
      fights: input.fights,
      deaths: people.filter((sheet) => sheet.dead).length,
    },
    crew: people.map((sheet) => {
      const agendas = played(sheet);
      const own = rollsOf(sheet.id);
      return {
        characterId: sheet.id,
        userId: sheet.userId,
        name: sheet.name,
        crewRole: sheet.crewRole?.trim() ?? "",
        portraitUrl: sheet.portraitUrl ?? null,
        dead: sheet.dead,
        tookOver: (sheet.agenda?.acts ?? []).some((text) => text.trim() === NOT_YET),
        agendas,
        storyPoints: sheet.agenda?.storyPoints ?? 0,
        hiddenRole: sheet.agenda?.hiddenRole?.trim() ?? "",
        moves: input.messages.filter((message) => message.authorType === "player" && message.characterId === sheet.id).length,
        rolls: own.length,
        nat20s: count(own, "nat20"),
        nat1s: count(own, "nat1"),
      };
    }),
  };
}

// ---- the transcript ----

// How much of the night the model reads, in characters: a long night is
// cut down evenly (each passage to a shorter head) rather than losing its
// start, which is where the agendas were first chased.
export const TRANSCRIPT_MAX = 60_000;

// picture: the number of the scene picture this passage carried, from 1.
export type TranscriptLine = { who: string; text: string; picture?: number };

export function finaleTranscript(lines: readonly TranscriptLine[], max = TRANSCRIPT_MAX): string {
  const clean = lines
    .map((line) => ({ who: line.picture ? `${line.who} [picture ${line.picture}]` : line.who, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text);
  // The longest each line may be so the whole fits, found by halving.
  let cap = 2000;
  const size = (limit: number) => clean.reduce((total, line) => total + line.who.length + 3 + Math.min(limit, line.text.length), 0);
  while (cap > 80 && size(cap) > max) cap = Math.floor(cap * 0.75);
  const cut = (text: string) => (text.length <= cap ? text : `${text.slice(0, cap).replace(/\s+\S*$/, "")}…`);
  const out = clean.map((line) => `${line.who}: ${cut(line.text)}`);
  // Still too long at the shortest cap: the oldest lines go, never the end.
  let total = out.reduce((sum, line) => sum + line.length + 1, 0);
  while (out.length > 1 && total > max) total -= out.shift()!.length + 1;
  return out.join("\n");
}

// ---- what the model is asked ----

const FINALE_SHAPE = `{"headline": string, "outcome": "triumph"|"escaped"|"pyrrhic"|"lost", "recap": [{"text": string, "picture": int}], "truth": string, "crew": [{"name": string, "fate": string, "agendas": [{"act": int, "verdict": "done"|"partly"|"missed", "line": string}], "highlight": string, "moment": int, "award": string}], "review": {"grade": "S"|"A"|"B"|"C"|"D"|"F", "title": string, "commentary": string, "bestMove": string, "missed": string}}`;

export function finaleSystemPrompt(): string {
  return [
    "You are the Game Master of a cinematic sci-fi horror one-shot that a room of friends just finished on their couch. Write the closing the TV shows them: what happened, who pulled off their secret agenda, and your honest review of how they played.",
    `Reply with ONLY a strict JSON object, no code fences, shaped exactly: ${FINALE_SHAPE}`,
    "headline: the ending in one line of at most 70 characters, like a film's last title card (\"Two made the shuttle. The Company got its sample.\").",
    "outcome: triumph (they won clean), escaped (they got out, the threat not beaten), pyrrhic (they won or got out at a real cost), lost (dead, taken or stranded).",
    "recap: 3 to 5 beats of the night in order, one sentence each, naming who did what. Only what happened in the transcript; never invent a scene. picture: the number N of the GM passage marked [picture N] that shows that beat best, each picture at most once, or 0 when none fits.",
    "Everything you write is also read aloud by the narrator over the TV: plain sentences that sound right spoken, no lists, symbols or parentheses.",
    "truth: what was really going on, one or two sentences from the secret outline, written for the players to learn it now.",
    "crew: one entry per crew member listed, by their exact name. fate: one line on how their night ended. agendas: one entry per agenda listed for them, with its act number as given; verdict done if they clearly achieved it, partly if they chased it or got some of it, missed if they never did; line: one short sentence of what they did about it, in plain words. highlight: their best or most memorable moment, one sentence from the transcript. moment: the [picture N] number that shows that moment, or 0. award: a playful 2 to 5 word title for how they played (\"Most likely to open the airlock\", \"The one who read the manual\").",
    "review: grade the crew's play, not their luck: S for a night to remember, A sharp and bold, B solid, C muddled through, D stumbled, F threw it away. Be honest; most nights are B or C. title: the review in at most 40 characters. commentary: two to four sentences in your own GM's voice to the room, warm, specific and a little teasing; name players' characters and real moments; say what worked and what did not. bestMove: the crew's best decision, one sentence. missed: one thing they never found or could have done, one sentence, which may spoil the secret outline.",
    "Never mention dice mechanics, game rules, tools or the AI; speak of the story.",
  ].join("\n");
}

export function finaleUserPrompt(facts: FinaleFacts, outline: string, transcript: string): string {
  const crew = facts.crew.map((member) => {
    const lines = [
      `- ${member.name}${member.crewRole ? ` (${member.crewRole})` : ""}: ${member.dead ? "DEAD" : "alive"} at the end${member.tookOver ? "; joined after a crewmate died" : ""}. Story points ${member.storyPoints}. Moves ${member.moves}, rolls ${member.rolls}, natural 20s ${member.nat20s}, natural 1s ${member.nat1s}.`,
      ...member.agendas.map((agenda) => `  act ${agenda.act + 1} agenda: ${agenda.text}`),
    ];
    if (member.hiddenRole) lines.push(`  hidden role: ${member.hiddenRole}`);
    return lines.join("\n");
  });
  const stats = facts.stats;
  return [
    `THE NIGHT: "${facts.title}". Played ${stats.minutes} minutes, ended in act ${stats.act + 1} of 3, ${stats.fights} fight${stats.fights === 1 ? "" : "s"}, ${stats.deaths} crew dead.`,
    facts.ending ? `${facts.endedBy === "gm" ? "How the GM said it ended" : "The host ended the night here"}: ${facts.ending}` : facts.endedBy === "host" ? "The host ended the night here, perhaps before the story's ending." : "",
    `SECRET OUTLINE:\n${outline}`,
    `CREW:\n${crew.join("\n")}`,
    `TRANSCRIPT (GM passages and the crew's moves, oldest first):\n${transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---- the reply ----

const flat = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const str = (max: number) => z.unknown().optional().transform((value) => flat(value, max));
const list = <T extends z.ZodTypeAny>(item: T) =>
  z.unknown().optional().transform((value) => (Array.isArray(value) ? value : [])).pipe(z.array(item));
const record = <T extends z.ZodRawShape>(shape: T) =>
  z.unknown().optional().transform((value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {})).pipe(z.object(shape));
const oneOf = <T extends readonly string[]>(options: T) =>
  z.unknown().optional().transform((value) => {
    const said = typeof value === "string" ? value.trim().toLowerCase() : "";
    return options.find((option) => option.toLowerCase() === said) as T[number] | undefined;
  });

const pictureNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
};

const finaleReplySchema = record({
  headline: str(90),
  outcome: oneOf(FINALE_OUTCOMES),
  // A beat as {text, picture}, or a bare sentence from a model that forgot
  // the picture.
  recap: list(z.unknown()).transform((items) =>
    items
      .map((item) => {
        const beat = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : { text: item };
        return { text: flat(beat.text ?? beat.beat, 260), picture: pictureNumber(beat.picture) };
      })
      .filter((beat) => beat.text)
      .slice(0, 5),
  ),
  truth: str(500),
  crew: list(
    record({
      name: str(60),
      fate: str(200),
      agendas: list(record({ act: z.unknown().optional().transform((value) => Number(value)), verdict: oneOf(AGENDA_VERDICTS), line: str(220) })),
      highlight: str(260),
      moment: z.unknown().optional().transform(pictureNumber),
      award: str(48),
    }),
  ),
  review: record({
    grade: oneOf(FINALE_GRADES),
    title: str(60),
    commentary: str(900),
    bestMove: str(260),
    missed: str(260),
  }),
});

export type FinaleProse = z.infer<typeof finaleReplySchema>;

// The model's reply, or null when nothing in it can be used.
export function readFinaleReply(raw: string): FinaleProse | null {
  const json = jsonIn(raw);
  if (!json) return null;
  const parsed = finaleReplySchema.safeParse(json);
  if (!parsed.success) return null;
  const prose = parsed.data;
  return prose.headline || prose.recap.length || prose.review.commentary ? prose : null;
}

// ---- the closing, facts and prose together ----

export type FinaleCrew = Omit<FinaleCrewFacts, "agendas"> & {
  fate: string;
  agendas: Array<{ act: number; text: string; verdict: AgendaVerdict | null; line: string }>;
  highlight: string;
  // The scene picture of that highlight, when the model named one.
  moment?: string | null;
  award: string;
};

// The night's own pictures on the closing: the last scene behind the end
// card, one per recap beat, and a few across the night behind the review.
// Optional: a closing written before pictures were has them filled in from
// the night's pictures when it is next read (withFinalePictures).
export type FinalePictures = { end: string | null; recap: Array<string | null>; review: string[] };

export type FinaleReview = { grade: FinaleGrade; title: string; commentary: string; bestMove: string; missed: string };

export type CouchFinale = {
  title: string;
  headline: string;
  outcome: FinaleOutcome;
  recap: string[];
  truth: string;
  endedBy: "gm" | "host";
  stats: FinaleStats;
  crew: FinaleCrew[];
  // Null when the model wrote none: the TV skips the review.
  review: FinaleReview | null;
  // Whether the model's words are in it, or only the server's.
  written: boolean;
  pictures?: FinalePictures;
};

// The picture at an evenly spread place in the night: beat `at` of `count`
// sits in the middle of its share of the night's pictures.
function spread(pictures: readonly string[], at: number, count: number): string | null {
  if (!pictures.length || count < 1) return null;
  return pictures[Math.min(pictures.length - 1, Math.floor(((at + 0.5) * pictures.length) / count))] ?? null;
}

// The recap's pictures: the model's pick where it made a usable one (each
// picture once), else the beat's evenly spread share of the night, which
// reads in order as the beats do. The end card has the night's last scene.
export function finalePictures(pictures: readonly string[], recapCount: number, chosen: readonly number[] = []): FinalePictures {
  const used = new Set<string>();
  const pick = (number: number | undefined) => {
    const url = number ? pictures[number - 1] : undefined;
    if (!url || used.has(url)) return null;
    used.add(url);
    return url;
  };
  const recap = Array.from({ length: recapCount }, (_, at) => pick(chosen[at]));
  for (let at = 0; at < recapCount; at += 1) {
    if (recap[at]) continue;
    const url = spread(pictures, at, recapCount);
    recap[at] = url;
    if (url) used.add(url);
  }
  const reviewCount = Math.min(6, pictures.length);
  const review = Array.from({ length: reviewCount }, (_, at) => spread(pictures, at, reviewCount)).filter((url): url is string => Boolean(url));
  return { end: pictures.at(-1) ?? null, recap, review: [...new Set(review)] };
}

// A closing stored before it had pictures, given the night's.
export function withFinalePictures(finale: CouchFinale, pictures: readonly string[]): CouchFinale {
  return finale.pictures ? finale : { ...finale, pictures: finalePictures(pictures, finale.recap.length) };
}

// The outcome when the model named none: by who is left standing.
export function outcomeByDeaths(crew: readonly Pick<FinaleCrewFacts, "dead">[]): FinaleOutcome {
  const dead = crew.filter((member) => member.dead).length;
  if (crew.length && dead === crew.length) return "lost";
  return dead ? "pyrrhic" : "escaped";
}

const firstSentences = (text: string, count: number) => (text.match(/[^.!?]+[.!?]+(\s|$)/g)?.slice(0, count).join("").trim() || text).slice(0, 500);

export function mergeFinale(facts: FinaleFacts, prose: FinaleProse | null): CouchFinale {
  const byName = new Map((prose?.crew ?? []).map((entry) => [textKey(entry.name), entry]));
  const review = prose?.review;
  return {
    title: facts.title,
    headline: prose?.headline || facts.ending.slice(0, 90) || "The night is over.",
    outcome: prose?.outcome ?? outcomeByDeaths(facts.crew),
    recap: prose?.recap.length ? prose.recap.map((beat) => beat.text) : facts.ending ? [facts.ending] : [],
    truth: prose?.truth || firstSentences(facts.truth, 2),
    endedBy: facts.endedBy,
    stats: facts.stats,
    crew: facts.crew.map((member) => {
      const written = byName.get(textKey(member.name));
      return {
        ...member,
        fate: written?.fate || (member.dead ? "Did not make it." : "Made it to the end."),
        agendas: member.agendas.map((agenda) => {
          // By act; a reply that numbered them from 0 or left the act out
          // still lines up by order.
          const said = written?.agendas.find((entry) => entry.act === agenda.act + 1) ?? written?.agendas[member.agendas.indexOf(agenda)];
          return { ...agenda, verdict: said?.verdict ?? null, line: said?.line ?? "" };
        }),
        highlight: written?.highlight ?? "",
        moment: (written?.moment && facts.pictures[written.moment - 1]) || null,
        award: written?.award ?? "",
      };
    }),
    review: review?.grade && review.commentary ? { grade: review.grade, title: review.title, commentary: review.commentary, bestMove: review.bestMove, missed: review.missed } : null,
    written: Boolean(prose),
    pictures: finalePictures(facts.pictures, prose?.recap.length ? prose.recap.length : facts.ending ? 1 : 0, prose?.recap.map((beat) => beat.picture) ?? []),
  };
}

// ---- the stored row ----

// "pending": the GM called end_night and its closing passage is still being
// written; "writing": the night is over and the closing is being written;
// "ready": the closing is on every screen.
export type FinaleStatus = "pending" | "writing" | "ready";

// What every screen reads: nothing while the GM's closing passage is still
// being written, then the closing being written, then the closing itself.
// voice: the key of the closing's narrator clips (src/lib/couch/finale-voice.ts),
// "" when the night has no narrator.
export type CouchFinaleView = { status: "writing" } | { status: "ready"; finale: CouchFinale; voice: string };

// ---- the TV's sequence ----

// The steps the TV walks through, and how long each holds before it moves
// on by itself: the end card, the recap, one step per crew member, what was
// really going on, the review, and the board, which stays.
export type FinaleStep =
  | { kind: "end" }
  | { kind: "recap"; index: number }
  | { kind: "crew"; index: number }
  | { kind: "truth" }
  | { kind: "review" }
  | { kind: "board" };

export function finaleSteps(finale: Pick<CouchFinale, "recap" | "crew" | "truth" | "review">): FinaleStep[] {
  return [
    { kind: "end" },
    ...finale.recap.map((_, index) => ({ kind: "recap" as const, index })),
    ...finale.crew.map((_, index) => ({ kind: "crew" as const, index })),
    ...(finale.truth ? [{ kind: "truth" as const }] : []),
    ...(finale.review ? [{ kind: "review" as const }] : []),
    { kind: "board" },
  ];
}

// Reading time for the room: a base, plus words at a slow reading pace
// (the TV is read from across the room, by people talking over it).
export function finaleStepMs(step: FinaleStep, finale: CouchFinale): number {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const read = (text: string, base: number) => base + words(text) * 330;
  switch (step.kind) {
    case "end":
      return 7000;
    case "recap":
      return Math.max(6500, read(finale.recap[step.index] ?? "", 3000));
    case "crew": {
      const member = finale.crew[step.index];
      if (!member) return 6000;
      const text = [member.fate, member.highlight, ...member.agendas.map((agenda) => `${agenda.text} ${agenda.line}`), member.hiddenRole].join(" ");
      return Math.min(32000, read(text, 6000) + member.agendas.length * 1200);
    }
    case "truth":
      return read(finale.truth, 4000);
    case "review": {
      const review = finale.review;
      return review ? Math.min(40000, read(`${review.commentary} ${review.bestMove} ${review.missed}`, 7000)) : 0;
    }
    case "board":
      return 0;
  }
}

// How long each agenda line of a crew step waits before its verdict lands,
// so the room reads the mission before it learns whether it was done.
export const VERDICT_BEAT_MS = 1600;

// When the last of a crew step has appeared on screen: the agendas and
// their verdicts, the points, the hidden role and the highlight. A voice
// that finishes sooner still leaves the step up until then.
export function crewRevealMs(member: Pick<FinaleCrew, "agendas" | "hiddenRole" | "highlight">): number {
  const roleAt = 1400 + member.agendas.length * (VERDICT_BEAT_MS + 600);
  return roleAt + (member.hiddenRole ? 1400 : 0) + (member.highlight ? 1400 : 0) + 1200;
}

// ---- the narrator ----

const sentence = (text: string) => {
  const trimmed = text.trim();
  return !trimmed || /[.!?…"'”’]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};
const spoken = (...parts: string[]) => parts.map(sentence).filter(Boolean).join(" ");
const gradeArticle = (grade: FinaleGrade) => (grade === "A" || grade === "F" || grade === "S" ? "an" : "a");

// What the narrator reads over each step of the TV's closing, in the GM's
// voice: the screen's own words, said aloud. "" for the board, which is
// only looked at.
export function finaleSpeech(step: FinaleStep, finale: CouchFinale): string {
  switch (step.kind) {
    case "end":
      return spoken("The end", finale.headline);
    case "recap":
      return spoken(step.index === 0 ? "Here is what happened" : "", finale.recap[step.index] ?? "");
    case "crew": {
      const member = finale.crew[step.index];
      if (!member) return "";
      return spoken(
        member.name,
        member.fate,
        ...member.agendas.map((agenda) => agenda.line),
        member.hiddenRole ? `And the secret ${member.name} kept all night: ${member.hiddenRole}` : "",
        member.award ? `Tonight's award: ${member.award}` : "",
      );
    }
    case "truth":
      return finale.truth ? spoken("What was really going on", finale.truth) : "";
    case "review": {
      const review = finale.review;
      if (!review) return "";
      return spoken(
        review.title,
        `I'd give you ${gradeArticle(review.grade)} ${review.grade}`,
        review.commentary,
        review.bestMove ? `Your best call: ${review.bestMove}` : "",
        review.missed ? `What you missed: ${review.missed}` : "",
      );
    }
    case "board":
      return "";
  }
}

// Every step's words, in the order the TV plays them: what the server
// renders ahead, keyed to the closing so a rewrite is a new set of clips.
export function finaleSpeechTexts(finale: CouchFinale): string[] {
  return finaleSteps(finale).map((step) => finaleSpeech(step, finale));
}

export function minutesWords(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
