// The pictures a couch night paints of whoever its crew fights (people,
// machines, creatures; docs/couch-mode-spec.md 2.11), the pure half: what
// each picture is asked for. Three per kind of foe: whole as it attacks,
// hurt once it is bloodied, down once it falls (fight-logic.ts
// fightArtStage). The hurt and down pictures are painted from the whole one
// as their reference, so the room sees the same foe take the damage rather
// than three different ones. scripts/test-couch-fight.mjs.
import { fightArtKey, type FightArtStage } from "@/lib/couch/fight-logic";
import { textKey } from "@/lib/language/text-logic";

// The most kinds of foe a night paints, and how often one is tried.
// A one-shot meets a handful; a pack of the same kind is one kind.
export const FIGHT_ART_NIGHT_MAX = 12;
export const FIGHT_ART_TRIES = 2;

// How much of the story the painter reads about the foe: the fight's
// own line and the passages that brought it in.
export const FIGHT_LOOK_CHARS = 900;

// What the story has said the foe looks like: the GM's one line on the
// fight, then the newest passages, cut to what the painter reads.
export function creatureLook(summary: string, passages: readonly string[]): string {
  const story = passages.map((passage) => passage.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  return [summary.replace(/\s+/g, " ").trim(), story].filter(Boolean).join(" From the story: ").slice(0, FIGHT_LOOK_CHARS).trim();
}

// Who the crew fights is whoever the story says: a person, a machine, a
// creature. A foe the night already knows (a cast member, an NPC, a crew
// member's sheet) is matched by name or alias, and its fixed look and face
// win over a guess from the passages, so a mechanic who turns on the crew
// is painted as that mechanic and not as a beast.
export type KnownPerson = { names: readonly string[]; look: string; portrait: string };
export type KnownFoe = { look: string; portrait: string };

export function knownFoe(name: string, people: readonly KnownPerson[]): KnownFoe | null {
  const key = fightArtKey(name);
  if (!key) return null;
  const matches = people.filter((person) =>
    person.names.some((alias) => {
      const other = textKey(alias);
      // "Edda" is "Edda Sorn"; "Sorn" alone is not enough to be sure.
      return other === key || other.split(" ")[0] === key;
    }),
  );
  const look = matches.map((person) => person.look.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  const portrait = matches.map((person) => person.portrait).find(Boolean) ?? "";
  return look || portrait ? { look, portrait } : null;
}

// The image model otherwise turns any foe into a monster, and a creature
// into the films' famous one; the shipped art rules hold for a night's
// pictures too (docs/art/creature-art-guidance.md).
const TRUE_TO_KIND =
  "Draw it as what the story says it is: a person stays a person with a human face and body, a machine stays a machine, a creature stays a creature. Never turn a person into a monster.";
const ORIGINAL = "If it is a creature, an original design, never one from a film, game or book: none of the famous film aliens, no beholder or mind flayer.";
const ALONE = "Only this one figure, no one else in frame, no text or lettering.";

// The style lock first: image models weigh the first words most. `known` is
// the fixed look of a foe the night already knows; `face` says the painter
// has its portrait as a reference.
export function fightArtPrompt(
  stage: FightArtStage,
  input: { name: string; look: string; styleLock: string; known?: string; face?: boolean },
): string {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  const known = input.known?.replace(/\s+/g, " ").trim() ?? "";
  const parts =
    stage === "whole"
      ? [
          known
            ? `Fight portrait of ${name}, who the crew is fighting. ${name} looks like this: ${known}. What the story says of the fight: ${input.look}`
            : `Fight portrait of ${name}, who the crew is fighting, as the story describes them: ${input.look}`,
          input.face ? `Keep the face, build and clothes of ${name} in the reference picture.` : "",
          "The whole figure in frame, three-quarter view, lunging toward the viewer, lit by harsh practical light against deep shadow. Menacing and clearly readable as one figure.",
          TRUE_TO_KIND,
          ORIGINAL,
        ]
      : stage === "hurt"
        ? [
            `The same figure as the reference picture, ${name}, badly hurt in the fight: wounded, torn or damaged as fits what they are, recoiling but still dangerous.`,
            "Keep their face or anatomy, clothes, colours and light exactly as in the reference; only the damage is new. Implied injury, no gore.",
          ]
        : [
            `The same figure as the reference picture, ${name}, defeated: collapsed and still on the deck, the fight over.`,
            "Keep their face or anatomy, clothes and colours as in the reference. Implied injury, no gore.",
          ];
  return [input.styleLock, ...parts, ALONE].filter(Boolean).join(". ").replace(/\.\./g, ".");
}
