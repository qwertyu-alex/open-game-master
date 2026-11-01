import { z } from "zod";
import { GENDERS, type Gender } from "@/lib/gender";
import type { HeroProposal } from "@/lib/dm/pregen-draft-logic";
import { textKey, words } from "@/lib/language/text-logic";
import { normalizeGameSettings, type GameSettings } from "@/lib/schemas/game-settings";
import type { CreateSheetInput, SheetAgenda } from "@/lib/schemas/sheet";
import { OFF_LIMITS_MAX } from "@/lib/couch/limits";
import { readBeats, type ForgedBeat } from "@/lib/couch/tension-logic";

// The scenario forge (docs/couch-mode-spec.md 2.1): a written couch-night
// one-shot (src/lib/couch/scenarios), the scenario the GM keeps secret and
// the crew the players claim, read into tonight's night. This module is the
// pure half: how a story's JSON is read and mended for the head count, how a
// crew member becomes a 5e sheet's choices, and the campaign the night runs
// on. The writes are src/lib/couch/forge.ts; scripts/test-couch-forge.mjs
// drives this directly.

// ---- careers ----

// The crew's jobs, as the scenario template names them. The phone and the TV
// show the career (through crewRole), never the class underneath.
export const CAREERS = ["Marine", "Pilot", "Medic", "Roughneck", "Company Agent", "Scientist", "Officer", "Kid"] as const;
export type Career = (typeof CAREERS)[number];

// Each career over a 5e class with no spells at level 1, so the quick-build
// engine finishes it without a spell list and the night never meets a
// fireball (docs/couch-mode-spec.md 2.1, step 1). The background gives the
// career its skills (Medicine for the medic, which no martial class offers);
// the role is the quick-build quiz's answer, always a weapons one; the pregen
// is the nearest of src/lib/starter/pregens.ts, reskinned when a build fails.
// `painted` is how a portrait names them.
export const CAREER_BUILD: Record<Career, { classId: string; background: string; role: "tank" | "dps" | "utility"; pregen: "kara" | "brakk" | "vex"; painted: string }> = {
  Marine: { classId: "fighter", background: "soldier", role: "dps", pregen: "kara", painted: "space marine" },
  Roughneck: { classId: "barbarian", background: "folk_hero", role: "tank", pregen: "brakk", painted: "ship's engineer" },
  "Company Agent": { classId: "rogue", background: "charlatan", role: "utility", pregen: "vex", painted: "corporate agent" },
  Kid: { classId: "rogue", background: "urchin", role: "utility", pregen: "vex", painted: "teenager" },
  Scientist: { classId: "rogue", background: "sage", role: "utility", pregen: "vex", painted: "scientist" },
  Pilot: { classId: "ranger", background: "sailor", role: "utility", pregen: "vex", painted: "pilot" },
  Officer: { classId: "ranger", background: "noble", role: "dps", pregen: "kara", painted: "ship's officer" },
  Medic: { classId: "fighter", background: "hermit", role: "utility", pregen: "kara", painted: "ship's medic" },
};

export const COUCH_CLASS_IDS = [...new Set(Object.values(CAREER_BUILD).map((build) => build.classId))];

// The career as the model wrote it, read as one of the eight: the name
// itself, or the first of the eight whose every word it holds ("Colonial
// Marine", "Company agent on loan"). The prompt asks for one of the eight
// exactly, so anything else is a slip, and it reads as a Roughneck, the
// crew's plain hand, rather than refusing the night.
export function careerFor(text: string): Career {
  const key = textKey(text);
  const exact = CAREERS.find((career) => textKey(career) === key);
  if (exact) {
    return exact;
  }
  const said = new Set(words(text).map(textKey));
  return CAREERS.find((career) => words(career).every((word) => said.has(textKey(word)))) ?? "Roughneck";
}

// ---- the reply ----

const flat = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : typeof value === "number" ? String(value) : "";
const str = (max: number) => z.unknown().optional().transform((value) => flat(value, max));
// A short name the model ran past its length: cut at the last clause that
// fits, else the last whole word, never mid-word ("worn on a cord; its
// cracked edge can hide a" was a carried thing on a phone).
export function clipPhrase(text: string, max: number): string {
  const whole = text.replace(/\s+/g, " ").trim();
  if (whole.length <= max) return whole;
  const head = whole.slice(0, max + 1);
  const clause = Math.max(head.lastIndexOf(";"), head.lastIndexOf(","), head.lastIndexOf(" ("));
  if (clause >= max / 3) return head.slice(0, clause).trim();
  const word = head.lastIndexOf(" ");
  return (word > 0 ? head.slice(0, word) : whole.slice(0, max)).replace(/[\s,;:—–-]+$/, "");
}
const phrase = (max: number) => z.unknown().optional().transform((value) => (typeof value === "string" ? clipPhrase(value, max) : ""));
const list = <T extends z.ZodTypeAny>(item: T) =>
  z.unknown().optional().transform((value) => (Array.isArray(value) ? value : [])).pipe(z.array(item));
const strings = (max: number) => list(z.unknown()).transform((items) => items.map((item) => flat(item, max)).filter(Boolean));
const record = <T extends z.ZodRawShape>(shape: T) =>
  z.unknown().optional().transform((value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {})).pipe(z.object(shape));

// What the model is asked for, read leniently: every field is coerced to its
// shape (a missing string is "", a missing list is []; .optional() because
// zod 4 refuses an absent key before any transform runs), so one slip costs
// a field rather than the whole night. What the night cannot do without is
// checked after, in readForge, with a reason a retry can be given.
export const forgeReplySchema = record({
  scenario: record({
    title: str(80),
    // How long the night runs, when a scenario is written shorter than the
    // usual two and a half hours (a test night): the act clock scales to it.
    minutes: z.unknown().optional().transform((value) => (typeof value === "number" && value >= 20 && value <= 240 ? Math.round(value) : undefined)),
    logline: str(300),
    briefing: str(1500),
    setting: str(400),
    truth: str(1500),
    threat: str(600),
    acts: list(
      record({
        title: str(60),
        goal: str(300),
        setPieces: strings(200),
        escalation: str(300),
        clock: str(200),
        twist: str(300),
        // The act's deck of scares (src/lib/couch/tension-logic.ts): the GM
        // plays the next one when the tension clock calls for it.
        beats: z.unknown().optional().transform(readBeats),
      }),
    ),
    cast: list(
      record({
        name: str(60),
        role: str(80),
        look: str(300),
        voice: str(120),
        agenda: str(300),
        secret: str(300),
      }),
    ),
    // What the crew can fight, act by act (couchOutline lists them for the
    // GM, beside the couch enemy menu, src/lib/couch/foes.ts).
    foes: list(record({ name: str(60), what: str(200), act: z.unknown().optional().transform((value) => Number(value)) })),
    locations: list(record({ name: str(60), look: str(240) })),
  }),
  styleLock: str(300),
  // Who holds the night's one hidden role, at the top so a crew can never
  // carry two: null, or the crew member's name and what they really are.
  hiddenRole: z
    .unknown()
    .optional()
    .transform((value) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}))
    .transform((value) => ({ crewMember: flat(value.crewMember ?? value.name, 60), role: flat(value.role, 300) })),
  crew: list(
    record({
      name: str(60),
      gender: str(20),
      career: str(60),
      crewRole: str(120),
      look: str(500),
      personality: str(300),
      backstory: str(1200),
      relationships: list(record({ to: str(60), line: str(200) })),
      signatureItem: phrase(80),
      voice: str(120),
      agenda: strings(400),
    }),
  ),
});

export type ForgedCrew = {
  name: string;
  gender: Gender;
  career: Career;
  crewRole: string;
  look: string;
  personality: string;
  backstory: string;
  relationships: Array<{ to: string; line: string }>;
  signatureItem: string;
  voice: string;
  // One per act, 1 to 3, in order.
  agenda: string[];
  // "" for all but at most one.
  hiddenRole: string;
};

// twist and beats are optional: a night forged before acts had them has none.
export type ForgedAct = { title: string; goal: string; setPieces: string[]; escalation: string; clock: string; twist?: string; beats?: ForgedBeat[] };

// Something the crew can fight, and the act (1 to 3) it comes in.
export type ForgedFoe = { name: string; what: string; act: number };

export type Forge = {
  scenario: {
    title: string;
    // Absent: the usual night (src/lib/couch/pacing-logic.ts NIGHT_MINUTES).
    minutes?: number;
    logline: string;
    briefing: string;
    setting: string;
    truth: string;
    threat: string;
    acts: ForgedAct[];
    cast: Array<{ name: string; role: string; look: string; voice: string; agenda: string; secret: string }>;
    // Absent on a night forged before foes were asked for.
    foes?: ForgedFoe[];
    locations: Array<{ name: string; look: string }>;
  };
  styleLock: string;
  crew: ForgedCrew[];
};

// The look every picture of the night shares when the model names none.
export const DEFAULT_STYLE_LOCK =
  "late-1970s science fiction film still, 35mm film grain, practical lighting, cassette-futurist interiors, deep shadows, anamorphic lens flares";

export { OFF_LIMITS_MAX, PLAYERS_MAX } from "@/lib/couch/limits";

// The first JSON object in a reply: a model that wraps it in a fence or a
// sentence still answered.
export function jsonIn(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const sentenceOf = (text: string) => (text.match(/^.*?[.!?](\s|$)/)?.[0] ?? text).trim();

// The model's answer read and mended, or refused with a reason in plain
// words (which the retry hands back to the model, and the TV shows when
// the second try fails too). Mended: a crew past the head count keeps its
// first members; a second hidden role is dropped; ties to someone not in
// the crew are dropped; a career in the model's own words is read as the
// nearest of the eight; a missing look, role line or style gets a plain
// default. Refused: no title, briefing or truth; fewer than three acts;
// fewer crew than players; a crew member with no name or no agenda.
// The hidden role is named at the top of the reply, so there is never a
// second one to drop.
export function readForge(raw: string, players: number): { ok: true; forge: Forge } | { ok: false; error: string } {
  const json = jsonIn(raw);
  if (!json) {
    return { ok: false, error: "The reply was not a JSON object." };
  }
  const parsed = forgeReplySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "The reply was not shaped like the scenario asked for." };
  }
  const { scenario, styleLock, crew, hiddenRole } = parsed.data;
  if (!scenario.title || !scenario.briefing || !scenario.truth) {
    return { ok: false, error: "The scenario came without a title, a briefing or the truth." };
  }
  const acts = scenario.acts.filter((act) => act.goal || act.title);
  if (acts.length < 3) {
    return { ok: false, error: `The scenario had ${acts.length} acts, not three.` };
  }
  const usable = crew.filter((member) => member.name && member.agenda.length);
  if (usable.length < players) {
    return { ok: false, error: `The crew had ${usable.length} usable members (a name and an agenda each), not ${players}.` };
  }
  const kept = usable.slice(0, players);
  const names = kept.map((member) => member.name);
  // The hidden role goes to the crew member it names, when they have a seat
  // tonight; a role for someone cut from the crew goes with them.
  const holder = hiddenRole.role ? kept.find((member) => textKey(member.name) === textKey(hiddenRole.crewMember)) : undefined;
  const forgedCrew: ForgedCrew[] = kept.map((member) => {
    const career = careerFor(member.career || member.crewRole);
    return {
      name: member.name,
      gender: GENDERS.find((gender) => textKey(gender) === textKey(member.gender)) ?? "",
      career,
      crewRole: member.crewRole || career,
      look: member.look || `A ${CAREER_BUILD[career].painted} in a worn work jumpsuit`,
      personality: member.personality,
      backstory: member.backstory,
      // A tie to someone at the table, by any part of their name.
      relationships: member.relationships.filter(
        (tie) => tie.line && names.some((name) => name !== member.name && tie.to && textKey(name).includes(textKey(tie.to).split(" ")[0] ?? "")),
      ),
      signatureItem: member.signatureItem,
      voice: member.voice,
      agenda: member.agenda.slice(0, 3),
      hiddenRole: member === holder ? hiddenRole.role : "",
    };
  });
  return {
    ok: true,
    forge: {
      scenario: {
        title: scenario.title,
        ...(scenario.minutes ? { minutes: scenario.minutes } : {}),
        logline: scenario.logline || sentenceOf(scenario.briefing),
        briefing: scenario.briefing,
        setting: scenario.setting,
        truth: scenario.truth,
        threat: scenario.threat,
        // A deck only where the act has one, so a night without reads as before.
        acts: acts.slice(0, 3).map(({ beats, ...act }) => (beats.length ? { ...act, beats } : act)),
        cast: scenario.cast.filter((person) => person.name).slice(0, 6),
        // An act the model left out or wrote as a word comes in act 2, the
        // middle of the night.
        foes: scenario.foes
          .filter((foe) => foe.name)
          .map((foe) => ({ ...foe, act: Number.isInteger(foe.act) && foe.act >= 1 && foe.act <= 3 ? foe.act : 2 }))
          .slice(0, 8),
        locations: scenario.locations.filter((place) => place.name).slice(0, 6),
      },
      styleLock: styleLock || DEFAULT_STYLE_LOCK,
      crew: forgedCrew,
    },
  };
}

// ---- the crew as sheets ----

// The quick-build engine's proposal for one crew member: a human of the
// career's class and background (src/lib/characters/pregen-drafts.ts
// buildDraft). The engine builds the numbers; the forge's words go on after.
export function crewProposal(member: ForgedCrew): HeroProposal {
  const build = CAREER_BUILD[member.career];
  return {
    name: member.name,
    concept: member.crewRole,
    className: build.classId,
    race: "human",
    background: build.background,
    backstory: member.backstory,
    role: build.role,
    gender: member.gender,
  };
}

// "Ties: Dallas, owes him a month's pay; Ripley, the only one she trusts."
function tiesLine(member: ForgedCrew): string {
  return member.relationships.length ? `Ties: ${member.relationships.map((tie) => `${tie.to}, ${tie.line.replace(/[.\s]+$/, "")}`).join("; ")}.` : "";
}

export function crewAgenda(member: ForgedCrew): NonNullable<SheetAgenda> {
  return { acts: member.agenda.slice(0, 3), act: 0, hiddenRole: member.hiddenRole, storyPoints: 0 };
}

// What the forge writes over whatever sheet carries a crew member, built or
// reskinned: who they are in the story's words, their look (which every
// portrait reads, src/lib/portrait-prompt.ts), the public backstory with
// their ties to the rest of the crew (the GM reads it every turn), and the
// secret agenda. The notes are the owner's alone: how to play them.
export function crewSheetFields(member: ForgedCrew): Pick<CreateSheetInput, "name" | "gender" | "appearance" | "backstory" | "notes" | "agenda" | "crewRole"> {
  const ties = tiesLine(member);
  return {
    name: member.name.slice(0, 60),
    gender: member.gender,
    appearance: member.look.slice(0, 500),
    backstory: [member.backstory, ties].filter(Boolean).join("\n\n").slice(0, 2000),
    notes: [
      `Career: ${member.career}. ${member.crewRole}`,
      member.personality ? `Personality: ${member.personality}` : "",
      member.signatureItem ? `Signature item: ${member.signatureItem}` : "",
      "Your agenda is secret: pursue it, and let nobody read your phone.",
    ]
      .filter(Boolean)
      .join("\n"),
    agenda: crewAgenda(member),
    crewRole: member.crewRole.slice(0, 120),
  };
}

// The signature item rides first in the pack, where the phone's character
// card finds it; a sheet that already holds one by that name is left alone.
export function withSignatureItem(equipment: CreateSheetInput["equipment"], item: string): CreateSheetInput["equipment"] {
  const name = item.trim().slice(0, 80);
  if (!name || equipment.some((entry) => textKey(entry.name) === textKey(name))) {
    return equipment;
  }
  return [{ name, qty: 1 }, ...equipment].slice(0, 60);
}

// One portrait per crew member in the night's own look: the style lock
// first (image models weigh the first words most), then who they are, then
// their fixed look. Framed for the round token (docs/art/token-readability.md):
// head and shoulders filling the frame on a plain dark ground.
export function crewPortraitPrompt(member: { gender: string; career: string; look: string }, styleLock: string): string {
  return [
    styleLock || DEFAULT_STYLE_LOCK,
    "Character portrait, head and shoulders filling the frame, centered, looking at the viewer",
    [member.gender, CAREER_BUILD[member.career as Career]?.painted ?? member.career].filter(Boolean).join(" "),
    member.look,
    "Plain dark background, no text",
  ]
    .filter(Boolean)
    .join(". ");
}

// ---- the GM's spine ----

// The secret outline (setDmOutline, as src/lib/starter/one-shot.ts writes
// its own), so the story-setup pass stands aside and the GM plays the
// forge's scenario. Kept to the scenario: the crew's agendas and the hidden
// role are read from the claimed sheets every turn (src/lib/couch/
// prompt-logic.ts), so a card nobody took never reaches the story, and the
// outline the lead's seat can read holds nobody's secret mission.
export const OUTLINE_MAX = 8000;

export function couchOutline(forge: Forge): string {
  const { scenario } = forge;
  const acts = scenario.acts.map((act, index) =>
    [
      `Act ${index + 1}${act.title ? ` "${act.title}"` : ""}: ${act.goal}`,
      act.setPieces.length ? `Set pieces: ${act.setPieces.join("; ")}.` : "",
      act.escalation ? `Escalation: ${act.escalation}` : "",
      act.clock ? `Clock: ${act.clock}` : "",
      act.twist ? `Twist (spring it mid-act): ${act.twist}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  const cast = scenario.cast.map(
    (person) => `- ${person.name}${person.role ? ` (${person.role})` : ""}: ${[person.look, person.voice ? `voice: ${person.voice}` : "", person.agenda ? `wants: ${person.agenda}` : "", person.secret ? `secret: ${person.secret}` : ""].filter(Boolean).join("; ")}`,
  );
  const foes = (scenario.foes ?? []).map((foe) => `- act ${foe.act}: ${foe.name}: ${foe.what}`);
  const places = scenario.locations.map((place) => `- ${place.name}: ${place.look}`);
  const parts = [
    `COUCH ONE-SHOT "${scenario.title}": three acts, about ${scenario.minutes ? `${scenario.minutes} minutes` : "two and a half hours"}; land the ending in act 3. Level 1 throughout.`,
    scenario.setting ? `Setting: ${scenario.setting}` : "",
    `The crew heard this briefing on the TV before the first scene; open act 1 right after it without repeating it: ${scenario.briefing}`,
    `The truth (never tell it; let the crew dig it out): ${scenario.truth}`,
    scenario.threat ? `The threat: ${scenario.threat}` : "",
    ...acts,
    cast.length ? `Cast:\n${cast.join("\n")}` : "",
    foes.length ? `Foes (bring each in its act, with start_encounter and the couch enemy menu's stat blocks):\n${foes.join("\n")}` : "",
    places.length ? `Locations:\n${places.join("\n")}` : "",
  ].filter(Boolean);
  const text = parts.join("\n\n");
  return text.length > OUTLINE_MAX ? `${text.slice(0, OUTLINE_MAX - 3).trimEnd()}...` : text;
}

// ---- the campaign ----

// The world line the GM reads beside the couch rules (src/lib/couch/
// prompt-logic.ts COUCH_RULES): a custom setting rather than a new genre, so
// the normal campaign creator offers nothing new and no genre table grows
// an entry for one night's look.
export const COUCH_GENRE_TEXT =
  "Sci-fi horror in a used, blue-collar future: a working crew far from help, a Company that owns everything and always has a second agenda, cramped corridors, failing machines, and something aboard that should not be.";

// "spiders, harm to children; gore" as the table's lines, one per thing, in
// the words typed: the GM's safety block lists them, and the narration guard
// reads each with the table language's stemmer and stop list
// (src/lib/dm/safety-lines-logic.ts).
export function offLimitsLines(text: string): string[] {
  return [
    ...new Set(
      text
        .slice(0, OFF_LIMITS_MAX)
        .split(/[,;\n]/)
        .map((part) => part.trim().slice(0, 60))
        .filter((part) => part.length > 1),
    ),
  ].slice(0, 12);
}

// The night's settings, all of them implied by couch mode (one choice, not a
// pile of toggles, AGENTS.md "one control per idea"): an AI-run one-shot,
// level-locked, with the systems a narrative evening on a couch has no use
// for turned off, the server rolling every die, a two-minute wait for the
// table, narration and character voices on, and the off-limits line as the
// table's lines. The world simulation is off: its background sparks and NPC
// ticks are model calls a three-act story never reads, on the same backend
// the turns wait on.
export function couchGameSettings(offLimits: string): GameSettings {
  return normalizeGameSettings({
    dmMode: "ai",
    couchMode: true,
    genre: "custom",
    customGenreText: COUCH_GENRE_TEXT,
    campaignLength: "short",
    aiStorySetup: true,
    dicePolicy: "digital_only",
    ttsEnabled: true,
    ttsAutoCast: true,
    multiCharacter: "off",
    safety: { xCard: true, lines: offLimitsLines(offLimits), veils: [], boundaries: "standard" },
    companions: "off",
    relationships: "off",
    romance: "off",
    mapsEnabled: false,
    boardDrawing: false,
    enemyIntent: false,
    waitForTable: true,
    waitForTableSeconds: 300,
    worldSimulation: false,
    midGameJoinOpen: false,
    ambienceEnabled: true,
    ambienceAuto: true,
    voice: { enabled: false, turnEnforcement: "off", transcribe: false },
  });
}
