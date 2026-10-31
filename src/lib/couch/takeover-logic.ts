import { GENDERS } from "@/lib/gender";
import { textKey } from "@/lib/language/text-logic";
import { CAREER_BUILD, careerFor, clipPhrase, jsonIn, type Forge, type ForgedCrew } from "@/lib/couch/forge-logic";

// Playing on after a death (docs/couch-mode-spec.md 2.12): a crew member
// whose character died takes over someone already in the story, as the
// cinematic sci-fi horror games do, and keeps playing. Nobody sits out a
// night with their friends, and a death costs the character, never the
// player. This module is the pure half: who may be taken over, what the
// story model is asked to make of them, how its answer is read, and the
// crew member built without the model when it cannot answer. The writes
// are src/lib/couch/takeover.ts; scripts/test-couch-takeover.mjs drives
// this directly.

// Someone a player may take over: a person the crew met (an npcs row) or one
// the scenario's cast holds who has not turned up yet. Only the public part
// (choiceOf) reaches the phone; what they want and hide stays here.
export type TakeoverPerson = {
  // "npc:<id>" or "cast:<index>": what the phone sends back.
  key: string;
  npcId: string | null;
  name: string;
  role: string;
  look: string;
  gender: string;
  voice: string;
  // What they want and their secret, from the forge's cast (or the npc
  // row's trait when the GM made them up during play).
  wants: string;
  secret: string;
  portraitUrl: string | null;
  // Already in the story: the crew has met them.
  met: boolean;
  where: string;
};

// The other choice, always offered: a survivor the story has not named
// yet, written to fit. What a table falls back on when every named person
// is dead, hostile or taken.
export const SOMEONE_NEW = "new";

// What the dead player's phone lists.
export type TakeoverChoice = {
  key: string;
  name: string;
  role: string;
  look: string;
  portraitUrl: string | null;
  met: boolean;
  where: string;
};

export function choiceOf(person: TakeoverPerson): TakeoverChoice {
  const { key, name, role, look, portraitUrl, met, where } = person;
  return { key, name, role, look, portraitUrl, met, where };
}

// Enough to choose from on one phone screen without scrolling past the
// story.
export const CHOICES_MAX = 6;

type CastEntry = Forge["scenario"]["cast"][number];
type NpcEntry = {
  id: string;
  name: string;
  aliases: string[];
  attitude: string;
  role: string;
  trait: string;
  location: string;
  portraitUrl: string;
  gender: string;
  archived: boolean;
};

// Who may be taken over. Out: a hostile NPC, anyone fighting the crew or
// killed in a fight, an NPC who has left the story (archived), and any name
// already on a sheet (the crew, the dead, an NPC someone took over) or being
// taken over right now. The met come first, by the order the GM's roster
// keeps; then the cast still to turn up, in the scenario's order. A cast
// member the GM brought on stage is one person: the row, with the cast's
// wants and secret.
export function takeoverCandidates(input: { cast: readonly CastEntry[]; npcs: readonly NpcEntry[]; unavailable: readonly string[] }): TakeoverPerson[] {
  const blocked = new Set(input.unavailable.map(textKey).filter(Boolean));
  const castFor = (names: string[]) => input.cast.find((person) => names.some((name) => textKey(name) === textKey(person.name)));
  const seen = new Set<string>();
  const people: TakeoverPerson[] = [];
  for (const npc of input.npcs) {
    const names = [npc.name, ...npc.aliases];
    names.forEach((name) => seen.add(textKey(name)));
    if (npc.archived || npc.attitude === "hostile" || names.some((name) => blocked.has(textKey(name)))) {
      continue;
    }
    const cast = castFor(names);
    people.push({
      key: `npc:${npc.id}`,
      npcId: npc.id,
      name: npc.name,
      role: npc.role || cast?.role || "",
      look: cast?.look || npc.trait,
      gender: npc.gender,
      voice: cast?.voice ?? "",
      wants: cast?.agenda ?? "",
      secret: cast?.secret ?? "",
      portraitUrl: npc.portraitUrl || null,
      met: true,
      where: npc.location,
    });
  }
  input.cast.forEach((cast, index) => {
    const key = textKey(cast.name);
    if (!key || seen.has(key) || blocked.has(key)) {
      return;
    }
    people.push({
      key: `cast:${index}`,
      npcId: null,
      name: cast.name,
      role: cast.role,
      look: cast.look,
      gender: "",
      voice: cast.voice,
      wants: cast.agenda,
      secret: cast.secret,
      portraitUrl: null,
      met: false,
      where: "",
    });
  });
  return people.slice(0, CHOICES_MAX);
}

// ---- the agenda ----

// The acts before the newcomer joined, as the agenda card and the GM read
// them: the schema wants a line for every act up to the one in force.
export const NOT_YET = "Not yet with the crew.";

// One agenda per act left, from the act in force: written ones first, the
// last repeated to fill, laid behind a line for each act already gone.
export function takeoverActs(written: readonly string[], act: number): string[] {
  const now = Math.max(0, Math.min(2, act));
  const left = 3 - now;
  const lines = written.map((line) => line.trim()).filter(Boolean).slice(0, left);
  while (lines.length && lines.length < left) {
    lines.push(lines[lines.length - 1]);
  }
  return [...Array<string>(now).fill(NOT_YET), ...lines];
}

// ---- the model ----

const flat = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// The model's reply, every field coerced to its shape (a missing string is
// "", a missing list is []), so one slip costs a field, not the takeover.
function takeoverReply(value: Record<string, unknown>) {
  return {
    available: value.available !== false,
    why: flat(value.why, 200),
    name: flat(value.name, 60),
    gender: flat(value.gender, 20),
    career: flat(value.career, 60),
    crewRole: flat(value.crewRole, 120),
    look: flat(value.look, 500),
    personality: flat(value.personality, 300),
    backstory: flat(value.backstory, 1200),
    relationships: listOf(value.relationships)
      .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : {}))
      .map((item) => ({ to: flat(item.to, 60), line: flat(item.line, 200) }))
      .filter((tie) => tie.to && tie.line),
    signatureItem: typeof value.signatureItem === "string" ? clipPhrase(value.signatureItem, 80) : "",
    voice: flat(value.voice, 120),
    agenda: listOf(value.agenda).map((item) => flat(item, 400)).filter(Boolean),
  };
}

const REPLY_SHAPE =
  '{"available":boolean,"why":string,"name":string,"gender":"Female"|"Male"|"Nonbinary","career":string,"crewRole":string,"look":string,"personality":string,"backstory":string,"relationships":[{"to":string,"line":string}],"signatureItem":string,"voice":string,"agenda":[string]}';

export function takeoverReplyTokens(): number {
  return 1600;
}

export function takeoverSystemPrompt(): string {
  return [
    "You run a cinematic sci-fi horror one-shot played on a couch: one TV, the players on their phones. A player's character has died. So that nobody sits out the night, they keep playing as someone else in the story, as the cinematic horror games do: a person the crew has met, or one about to turn up. Write that person as a player character joining the surviving crew.",
    "Rules:",
    "- Keep who they already are: name, look, voice and what the story has shown of them stay true. Their wants and their secret become their agenda, now pointed at the crew's situation: one concrete sentence per act left, something a player can act on at the table, colliding with at least one other crew member's interests. Never a hidden role.",
    "- career is one of Marine, Pilot, Medic, Roughneck, Company Agent, Scientist, Officer, Kid: the nearest to who they are. crewRole: a public one-liner under 100 characters. look: a fixed, concrete picture (face, age, skin, hair, build, clothes, one prop), no names. backstory: public, two or three sentences. relationships: one short line toward each surviving crew member, by name. signatureItem: one personal object in a few words. voice: age, accent and texture.",
    '- If the story shows this person dead, gone for good, or set on killing the crew, answer {"available": false, "why": one short sentence a player reads} and nothing else.',
    "- When asked for someone new, invent a survivor who fits where the crew is now (hiding in a sealed compartment, a stowaway, a lost shift worker), with a name nobody in the story has.",
    `Reply with STRICT JSON only, no code fences and no other text, shaped exactly: ${REPLY_SHAPE}`,
  ].join("\n");
}

export type TakeoverAsk = {
  forge: Forge;
  act: number;
  person: TakeoverPerson | null;
  fallen: { name: string; crewRole: string };
  crew: Array<{ name: string; crewRole: string }>;
  // The last of the story, oldest first: where the crew is and who still
  // lives.
  story: string;
};

export function takeoverUserPrompt(ask: TakeoverAsk): string {
  const { scenario } = ask.forge;
  const act = Math.max(0, Math.min(2, ask.act));
  const actsLeft = scenario.acts
    .slice(act)
    .map((entry, offset) => `Act ${act + offset + 1}${entry.title ? ` "${entry.title}"` : ""}: ${entry.goal}`)
    .join("\n");
  const person = ask.person
    ? [
        `Take over: ${ask.person.name}${ask.person.role ? ` (${ask.person.role})` : ""}${ask.person.met ? ", already met by the crew" : ", not yet met: they turn up now"}.`,
        ask.person.look ? `Look: ${ask.person.look}` : "",
        ask.person.voice ? `Voice: ${ask.person.voice}` : "",
        ask.person.wants ? `Wants: ${ask.person.wants}` : "",
        ask.person.secret ? `Secret: ${ask.person.secret}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "Take over: someone new, a survivor the story has not named yet.";
  return [
    `Scenario "${scenario.title}". ${scenario.setting}`,
    `The truth (secret): ${scenario.truth}`,
    `Acts left, from the one in force:\n${actsLeft}`,
    `Died: ${ask.fallen.name}${ask.fallen.crewRole ? ` (${ask.fallen.crewRole})` : ""}.`,
    `The surviving crew: ${ask.crew.length ? ask.crew.map((member) => `${member.name}${member.crewRole ? ` (${member.crewRole})` : ""}`).join("; ") : "nobody: the whole crew is dead, so this person carries the story on"}.`,
    person,
    `Write ${3 - act} agenda ${3 - act === 1 ? "line" : "lines"}, one per act left.`,
    ask.story ? `The story so far, latest last:\n${ask.story}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type TakeoverRead =
  | { ok: true; member: ForgedCrew }
  | { ok: false; unavailable: string }
  | { ok: false; error: string };

// The model's answer read into a crew member, or a refusal to hand back:
// unavailable (the story says the person is dead or out to kill the crew),
// or an error (a reply that could not be read). A named person keeps their
// own name whatever the reply says; someone new needs a name nobody holds.
export function readTakeover(raw: string, input: { person: TakeoverPerson | null; act: number; taken: readonly string[] }): TakeoverRead {
  const json = jsonIn(raw);
  if (!json) {
    return { ok: false, error: "The reply was not a JSON object." };
  }
  if (typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, error: "The reply was not shaped as asked." };
  }
  const reply = takeoverReply(json as Record<string, unknown>);
  if (!reply.available) {
    return { ok: false, unavailable: reply.why || "The story says they cannot join the crew." };
  }
  const name = input.person?.name ?? reply.name;
  if (!name) {
    return { ok: false, error: "The newcomer came without a name." };
  }
  if (!input.person && input.taken.some((taken) => textKey(taken) === textKey(name))) {
    return { ok: false, error: `${name} is already in the story.` };
  }
  const acts = takeoverActs(reply.agenda.length ? reply.agenda : [input.person?.wants ?? ""], input.act);
  if (acts.length < 3 || acts.some((line) => !line)) {
    return { ok: false, error: "The newcomer came without an agenda." };
  }
  const career = careerFor(reply.career || reply.crewRole || input.person?.role || "");
  return {
    ok: true,
    member: {
      name,
      gender: genderOf(reply.gender || input.person?.gender || ""),
      career,
      crewRole: reply.crewRole || input.person?.role || career,
      look: reply.look || input.person?.look || `A ${CAREER_BUILD[career].painted} in a worn work jumpsuit`,
      personality: reply.personality,
      backstory: reply.backstory,
      relationships: reply.relationships,
      signatureItem: reply.signatureItem,
      voice: reply.voice || input.person?.voice || "",
      agenda: acts,
      hiddenRole: "",
    },
  };
}

function genderOf(text: string) {
  return GENDERS.find((gender) => textKey(gender) === textKey(text)) ?? "";
}

// ---- without the model ----

// Survivors' names for someone new when the model cannot write one: plain,
// working-crew names, the first nobody at the table holds.
const SURVIVORS = [
  { name: "Ines Varga", gender: "Female", look: "A wiry woman in her thirties, close-cropped black hair, oil-stained hands, a torn grey shift jumpsuit and a dead headlamp" },
  { name: "Tomas Reyl", gender: "Male", look: "A heavy-set man in his fifties, grey stubble, a bandaged forearm, a quilted thermal vest over a faded company jumpsuit" },
  { name: "Juno Hale", gender: "Female", look: "A young woman barely twenty, freckled, frizzy red hair tied back, an oversized cargo jacket and a cracked handheld radio" },
  { name: "Dev Strand", gender: "Male", look: "A lanky man in his twenties, brown skin, shaved head, a patched orange hazard suit and a coil of cable over one shoulder" },
  { name: "Mags Okoro", gender: "Female", look: "A broad-shouldered woman in her forties, dark skin, braids under a dented hard hat, a heavy tool belt" },
] as const;

const NEW_AGENDA = "Get off this place alive, and make the crew take you with them.";

// The crew member made from what the forge and the GM's roster already say,
// for when the model is down, slow or unreadable: a player waiting on their
// phone always gets someone to play. Someone new is the first survivor
// whose name is free.
export function fallbackTakeover(person: TakeoverPerson | null, act: number, taken: readonly string[]): ForgedCrew {
  if (person) {
    const career = careerFor(person.role);
    return {
      name: person.name,
      gender: genderOf(person.gender),
      career,
      crewRole: (person.role || career).slice(0, 120),
      look: person.look || `A ${CAREER_BUILD[career].painted} in a worn work jumpsuit`,
      personality: "",
      backstory: person.role ? `${person.name}, ${person.role}, throws in with the crew.` : `${person.name} throws in with the crew.`,
      relationships: [],
      signatureItem: "",
      voice: person.voice,
      agenda: takeoverActs([person.wants || NEW_AGENDA], act),
      hiddenRole: "",
    };
  }
  const blocked = new Set(taken.map(textKey));
  const survivor = SURVIVORS.find((entry) => !blocked.has(textKey(entry.name))) ?? SURVIVORS[0];
  return {
    name: survivor.name,
    gender: genderOf(survivor.gender),
    career: "Roughneck",
    crewRole: "A shift worker the crew found hiding",
    look: survivor.look,
    personality: "",
    backstory: `${survivor.name} sat out the worst of it behind a sealed hatch, and is not doing it alone again.`,
    relationships: [],
    signatureItem: "",
    voice: "",
    agenda: takeoverActs([NEW_AGENDA], act),
    hiddenRole: "",
  };
}

// The line everyone reads (and the GM, in the story's history): who is
// gone and who their player plays now.
export function takeoverNote(input: { fallen: string; player: string; name: string; role: string }): string {
  const who = `${input.name}${input.role ? `, ${input.role.replace(/[.\s]+$/, "")}` : ""}`;
  return `${input.fallen} is gone. ${input.player || "Their player"} plays on as ${who}.`;
}

// The story's last passages for the model: the GM's words and the table's
// notes, roll markers out, newest kept when it runs long.
export const STORY_MAX = 4000;

export function storyExcerpt(messages: ReadonlyArray<{ authorType: string; content: string }>): string {
  const lines = messages
    .filter((message) => message.authorType === "dm" || message.authorType === "system")
    .map((message) => message.content.replace(/\[roll:[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    length += lines[index].length + 1;
    if (length > STORY_MAX) break;
    kept.unshift(lines[index]);
  }
  return kept.join("\n");
}
