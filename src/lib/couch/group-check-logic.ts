// The skills list alone, not the whole rules index: the TV imports this.
import skillsJson from "@/lib/srd/skills.json";

// A couch night's group check (docs/couch-mode-spec.md 2.10), the pure half.
// The GM calls it once; every crew member it names throws on their own
// phone at the same time; the TV fills one card as the dice land and the
// narrator reads two lines, the call and the verdict, however many play.
// The rule is group_check's own (src/lib/dm/check-tools.ts): the group makes
// it when at least half of those who try do.
//
// Pure, for scripts/test-couch-group-check.mjs.

export type CouchGroupMemberState = "waiting" | "pass" | "fail";

export type CouchGroupMember = {
  characterId: string;
  name: string;
  // The roll waiting on this crew member's phone; null for one who throws
  // nothing (the dead fail without a throw).
  pendingId: string | null;
  state: CouchGroupMemberState;
  total: number | null;
  rollId: string | null;
};

export type CouchGroupCheck = {
  id: string;
  turnId: string;
  toolCallId: string | null;
  // The skill or ability id the GM named, for the model's answer.
  check: string;
  // What everyone rolls, in words: "Stealth", "Strength check".
  what: string;
  dc: number;
  difficulty: string;
  reason: string;
  members: CouchGroupMember[];
  // The crew member whose throw settled it: the pass that made the half, or
  // the failure that put it out of reach. Null until then.
  decidedBy: string | null;
  status: "open" | "done";
  // Set once the resumed GM turn has been handed the result.
  answered: boolean;
  createdAt: string;
};

export type CouchGroupTally = {
  passes: number;
  fails: number;
  waiting: number;
  count: number;
  needed: number;
  // Null while the dice still left could go either way.
  passed: boolean | null;
};

const ABILITY_WORDS: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function groupCheckWhat(check: string): string {
  const ability = ABILITY_WORDS[check.toLowerCase()];
  if (ability) return `${ability} check`;
  return (skillsJson.skills as Array<{ id: string; name: string }>).find((skill) => skill.id === check)?.name ?? check.replaceAll("_", " ");
}

// At least half: one of one, one of two, two of three or four, three of five.
export function groupNeeded(count: number): number {
  return Math.ceil(count / 2);
}

export function groupTally(group: Pick<CouchGroupCheck, "members">): CouchGroupTally {
  const count = group.members.length;
  const passes = group.members.filter((member) => member.state === "pass").length;
  const fails = group.members.filter((member) => member.state === "fail").length;
  const needed = groupNeeded(count);
  const passed = passes >= needed ? true : fails > count - needed ? false : null;
  return { passes, fails, waiting: count - passes - fails, count, needed, passed };
}

// One crew member's throw is in. Returns the group as it now stands; a
// throw the group does not know, or one already in, changes nothing.
export function landGroupThrow(
  group: CouchGroupCheck,
  pendingId: string,
  roll: { id: string; total: number },
): CouchGroupCheck {
  const index = group.members.findIndex((member) => member.pendingId === pendingId && member.state === "waiting");
  if (index < 0) return group;
  const before = groupTally(group).passed;
  const members = group.members.map((member, at) => at === index
    ? { ...member, state: roll.total >= group.dc ? "pass" as const : "fail" as const, total: roll.total, rollId: roll.id }
    : member);
  const next = { ...group, members };
  const tally = groupTally(next);
  return {
    ...next,
    decidedBy: group.decidedBy ?? (before === null && tally.passed !== null ? members[index].characterId : null),
    status: tally.waiting ? "open" : "done",
  };
}

const why = (reason: string) => reason.trim().slice(0, 200).replace(/[.!?]+$/, "");

// Read once, when the dice are called: what, why, the target and how many
// must make it. Nobody is named: the phones do that.
export function couchGroupCall(group: CouchGroupCheck): string {
  const { count, needed } = groupTally(group);
  const reason = why(group.reason);
  const share = count === 1 ? "" : needed === count ? ` All ${count} of you must make it.` : ` ${needed} of ${count} of you must make it.`;
  return `Group check · ${group.what}. ${reason ? `${reason}. ` : ""}Everyone, take your phone and roll. Target ${group.dc}; meet or beat it.${share}`;
}

// Read once, when the last die lands.
export function couchGroupResult(group: CouchGroupCheck): string {
  const tally = groupTally(group);
  const decider = group.members.find((member) => member.characterId === group.decidedBy);
  const decided = decider && tally.count > 2 && tally.waiting === 0 ? ` ${decider.name}'s roll decided it.` : "";
  return `${tally.passes} of ${tally.count} made it. The group ${tally.passed ? "succeeds" : "fails"}.${decided}`;
}

export const couchGroupVoiceId = (id: string, part: "call" | "result") => `couch-group-${id}-${part}`;

// What the resumed GM turn reads for the group_check call: the shape the
// tool returns where the server throws for everyone.
export function couchGroupAnswer(group: CouchGroupCheck) {
  const tally = groupTally(group);
  const passed = tally.passed === true;
  return {
    ok: true,
    check: group.check,
    dc: group.dc,
    difficulty: group.difficulty,
    successes: tally.passes,
    total: tally.count,
    passed,
    results: group.members.map((member) => ({ name: member.name, total: member.total ?? 0, success: member.state === "pass" })),
    rolledBy: "each crew member, from their phone",
    note: `${passed
      ? `The group succeeds: ${tally.passes} of ${tally.count} made it, at least half. Narrate the shared success.`
      : `The group fails: only ${tally.passes} of ${tally.count} made it, short of half. Narrate the shared setback.`} The server already read the dice and the verdict aloud; do not repeat them.`,
  };
}
