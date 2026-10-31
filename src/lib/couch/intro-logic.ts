// The night's opening on the TV, before anyone picks (docs/couch-mode-spec.md
// 2.6): the narrator reads the briefing, then introduces each crew member in
// turn, and only then do the phones open the cards. Pure: what each step
// says aloud, how long it takes to read without a voice, and when the
// introductions are over. The server renders the words (src/lib/couch/
// intro.ts); the TV paces the steps (CouchTvIntro.tsx).

import type { ForgedCrew } from "@/lib/couch/forge-logic";

export type IntroCrew = {
  name: string;
  crewRole: string;
  backstory: string;
  personality: string;
  signatureItem: string;
  gender: string;
};

// Step 0 is the briefing and step i the (i - 1)th crew member, so a crew of
// n has n + 1 steps; the introductions are over once the step reaches that.
export function introTotal(crewCount: number): number {
  return crewCount > 0 ? crewCount + 1 : 0;
}

export function introDone(step: number, total: number): boolean {
  return step >= total;
}

const sentence = (text: string): string => {
  const trimmed = text.trim();
  return !trimmed ? "" : /[.!?…"”]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

function pronouns(gender: string): { they: string; their: string; carry: string } {
  const key = gender.trim().toLowerCase();
  if (key === "female") return { they: "She", their: "Her", carry: "carries" };
  if (key === "male") return { they: "He", their: "His", carry: "carries" };
  return { they: "They", their: "Their", carry: "carry" };
}

// "Dry, competent; flaw: money worries" as its traits and its flaw, which
// the TV shows apart and the narrator reads as two sentences.
export function splitFlaw(personality: string): { traits: string; flaw: string } {
  const [traits = "", flaw = ""] = personality.split(/;\s*flaw\s*:\s*/i);
  const tidy = (text: string) => text.trim().replace(/[.\s]+$/, "");
  return { traits: tidy(traits), flaw: tidy(flaw) };
}

// Read aloud with the flaw named as theirs, rather than with a colon the
// voice trips on.
function personalityLine(personality: string, their: string): string {
  const { traits, flaw } = splitFlaw(personality);
  return [sentence(traits), flaw ? `${their} flaw: ${sentence(flaw)}` : ""].filter(Boolean).join(" ");
}

// "A tin of hard peppermints" is carried as "a tin of hard peppermints";
// a name of its own ("Grandfather's compass") keeps its capital.
function carriesLine(item: string, they: string, carry: string): string {
  const name = item.trim().replace(/[.\s]+$/, "");
  if (!name) return "";
  const spoken = /^(a|an|the|one|two|her|his|their|an old)\s/i.test(name) ? lowerFirst(name) : name;
  return `${they} ${carry} ${spoken}.`;
}

// What the narrator says over one crew member's portrait: who they are
// aboard, the public backstory, their temper and the thing they carry.
// Their ties to the rest of the crew are on the screen, not read: a line
// toward each of four shipmates is longer than the room wants to sit through.
// Never the agenda or the hidden role: the whole room hears this.
export function crewIntroduction(member: IntroCrew): string {
  const { they, their, carry } = pronouns(member.gender);
  const role = member.crewRole.trim().replace(/[.\s]+$/, "");
  return [
    role ? `${member.name.trim()}, ${lowerFirst(role)}.` : sentence(member.name),
    sentence(member.backstory),
    personalityLine(member.personality, their),
    carriesLine(member.signatureItem, they, carry),
  ]
    .filter(Boolean)
    .join(" ");
}

// The briefing as the night opens with it: the title, the briefing, and the
// turn to the crew the room is about to meet.
export function briefingIntroduction(title: string, briefing: string): string {
  return [sentence(title), briefing.trim(), briefing.trim() ? "This is your crew." : ""].filter(Boolean).join("\n\n");
}

// Every step's words, in order: the briefing, then each crew member.
export function introTexts(scenario: { title: string; briefing: string }, crew: IntroCrew[]): string[] {
  return crew.length ? [briefingIntroduction(scenario.title, scenario.briefing), ...crew.map(crewIntroduction)] : [];
}

// How long a step stays up when nothing is read aloud (narration off, muted,
// or a clip that failed): an unhurried reading pace, with a beat to look at
// the portrait first.
export function introReadMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(6000, Math.round(2500 + (words / 2.6) * 1000));
}

// A card's forge entry: the card's own place in the crew, the forge wrote
// them in that order (finishCouchForge), checked by name.
export function forgedMember(crew: readonly ForgedCrew[], card: { position: number; name: string }): ForgedCrew | null {
  const at = crew[card.position];
  return at && at.name.slice(0, 60) === card.name ? at : (crew.find((member) => member.name.slice(0, 60) === card.name) ?? null);
}
