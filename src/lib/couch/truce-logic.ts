// A truce in a couch fight (docs/couch-mode-spec.md 2.11), the pure half.
// A crew member offers it on their turn and the GM calls offer_truce; every
// other crew member still standing in the fight answers on their own phone,
// Accept or Fight on, whoever's turn it is. One "fight on" ends it there;
// when all accept, the crew who turned stand with the others again and a
// fight with no foe left standing is over. Without it the GM asked the room
// "do you accept the truce?", and nobody but the crew member whose turn it
// was could answer: the offer kept the floor until its player typed "Skip".
//
// Pure, for scripts/test-couch-fight.mjs.

export type CouchTruceAnswer = "waiting" | "accept" | "refuse";

export type CouchTruceMember = {
  characterId: string;
  name: string;
  answer: CouchTruceAnswer;
};

export type CouchTruce = {
  id: string;
  encounterId: string;
  offeredBy: { characterId: string; name: string };
  // What they offer, in their words or the GM's: "lower the sword and we
  // walk back together". May be empty.
  terms: string;
  members: CouchTruceMember[];
  status: "open" | "accepted" | "refused";
  createdAt: string;
};

export function truceStatus(members: readonly CouchTruceMember[]): CouchTruce["status"] {
  if (members.some((member) => member.answer === "refuse")) return "refused";
  return members.every((member) => member.answer === "accept") ? "accepted" : "open";
}

// One crew member's answer. Returns the truce as it now stands; an answer
// from someone it does not ask, a second answer, or one after it is settled
// changes nothing.
export function answerTruce(truce: CouchTruce, characterId: string, accept: boolean): CouchTruce {
  if (truce.status !== "open") return truce;
  const index = truce.members.findIndex((member) => member.characterId === characterId && member.answer === "waiting");
  if (index < 0) return truce;
  const members = truce.members.map((member, at) => (at === index ? { ...member, answer: accept ? ("accept" as const) : ("refuse" as const) } : member));
  return { ...truce, members, status: truceStatus(members) };
}

const clean = (terms: string) => terms.trim().slice(0, 200).replace(/[.!?]+$/, "");

function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

// Read once, when it is offered.
export function couchTruceCall(truce: CouchTruce): string {
  const terms = clean(truce.terms);
  const who = truce.members.length === 1 ? `${truce.members[0].name}, answer` : "Everyone in the fight, answer";
  return `${truce.offeredBy.name} offers a truce${terms ? `: ${terms}` : ""}. ${who} on your phone: accept, or fight on.`;
}

// The line the table keeps, and the narrator reads, once it is settled.
export function couchTruceResult(truce: CouchTruce, { fightOver }: { fightOver: boolean }): string {
  if (truce.status === "refused") {
    const refusers = truce.members.filter((member) => member.answer === "refuse").map((member) => member.name);
    return `${names(refusers)} ${refusers.length === 1 ? "refuses" : "refuse"} the truce. The fight goes on.`;
  }
  return fightOver ? "The truce holds. Everyone stands down: the fight is over." : "The truce holds between the crew. The rest still fight.";
}

export const couchTruceVoiceId = (id: string, part: "call" | "result") => `couch-truce-${id}-${part}`;

// The phone's card: whether this player is asked, and what they answered.
export function truceAsks(truce: CouchTruce | null, myCharacterIds: ReadonlySet<string>): CouchTruceMember | null {
  if (!truce) return null;
  return truce.members.find((member) => myCharacterIds.has(member.characterId)) ?? null;
}
