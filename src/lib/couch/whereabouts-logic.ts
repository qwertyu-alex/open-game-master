import { textKey } from "@/lib/language/text-logic";

// Where each crew member is, once the crew can split up
// (docs/couch-navigation.md "Splitting up"). Each crew member stands in one
// place; a group is everyone in the same place, so nobody declares a split
// or a reunion: walking into the room another group stands in is the
// reunion. One group is in the scene, the one the story follows, and its
// place is upstream's current location, so everything that reads "where the
// party is" reads the scene. The GM cuts between groups (cut_to). Pure, for
// scripts/test-couch-split.mjs.

// At most three groups: with five players alone in five rooms, each would
// wait four GM turns for theirs.
export const MAX_GROUPS = 3;

export type CrewMember = { id: string; name: string; userId: string; portraitUrl: string | null };
export type CrewGroup = {
  // The place's name key (textKey), as the map keys rooms.
  placeId: string;
  placeName: string;
  members: CrewMember[];
  inScene: boolean;
};

// Each crew member's place as a name, from their whereabouts row; a member
// with no row yet stands where the scene is (a late arrival joins the story
// where it is).
export function crewGroups(
  crew: readonly CrewMember[],
  placeOf: ReadonlyMap<string, string>,
  scenePlace: string,
): CrewGroup[] {
  const sceneKey = textKey(scenePlace);
  const groups = new Map<string, CrewGroup>();
  for (const member of crew) {
    const name = placeOf.get(member.id) || scenePlace;
    const key = textKey(name);
    if (!key) continue;
    const group = groups.get(key) ?? { placeId: key, placeName: name, members: [], inScene: key === sceneKey };
    group.members.push(member);
    groups.set(key, group);
  }
  // The scene first, then the rest in the crew's own order.
  return [...groups.values()].sort((a, b) => Number(b.inScene) - Number(a.inScene));
}

export function sceneGroup(groups: readonly CrewGroup[]): CrewGroup | null {
  return groups.find((group) => group.inScene) ?? null;
}

export function isSplit(groups: readonly CrewGroup[]): boolean {
  return groups.length > 1;
}

// The group a crew member is in, by sheet id.
export function groupOf(groups: readonly CrewGroup[], sheetId: string): CrewGroup | null {
  return groups.find((group) => group.members.some((member) => member.id === sheetId)) ?? null;
}

export type MovePlan =
  | { ok: true; movers: string[]; split: boolean; joined: string[] }
  | { ok: false; error: string; refused?: "rules"; retry?: true };

// Who a move_party moves, or why it cannot. No names: the group in the
// scene (the whole crew while it is together). Names: those of the scene's
// group, splitting it; someone off scene only into the scene's own place,
// which is them arriving in it (and in any fight there). Never more than
// MAX_GROUPS afterwards.
export function planMove(input: {
  crew: readonly CrewMember[];
  groups: readonly CrewGroup[];
  destination: string;
  // The characterIds sent, or null when none were.
  named: readonly string[] | null;
}): MovePlan {
  const scene = sceneGroup(input.groups);
  const destKey = textKey(input.destination);
  if (!scene) return { ok: true, movers: input.crew.map((member) => member.id), split: false, joined: [] };
  let movers: string[];
  const joined: string[] = [];
  if (!input.named || !input.named.length) {
    movers = scene.members.map((member) => member.id);
  } else {
    movers = [];
    const unknown: string[] = [];
    for (const ref of input.named) {
      const member = input.crew.find((entry) => entry.id === ref || textKey(entry.name) === textKey(ref));
      if (!member) {
        unknown.push(ref);
        continue;
      }
      if (movers.includes(member.id)) continue;
      const group = groupOf(input.groups, member.id);
      if (group && !group.inScene) {
        if (destKey !== scene.placeId) {
          return {
            ok: false,
            error: `${member.name} is in ${group.placeName}, out of the scene. cut_to their group first, or move them only into ${scene.placeName} to join the scene.`,
            retry: true,
          };
        }
        joined.push(member.id);
      }
      movers.push(member.id);
    }
    if (unknown.length) {
      return { ok: false, error: `Not crew: ${unknown.join(", ")}. Use characterIds from CREW WHEREABOUTS, or none to move everyone in the scene.`, retry: true };
    }
  }
  const after = new Set<string>();
  for (const group of input.groups) {
    for (const member of group.members) after.add(movers.includes(member.id) ? destKey : group.placeId);
  }
  if (after.size > MAX_GROUPS) {
    return {
      ok: false,
      error: `That would split the crew into ${after.size} groups; at most ${MAX_GROUPS}. Move them with a group that is already apart, or keep them together.`,
      refused: "rules",
    };
  }
  return { ok: true, movers, split: after.size > input.groups.length, joined };
}

export type CutPlan = { ok: true; group: CrewGroup } | { ok: false; error: string; refused?: "rules"; retry?: true };

// Which group a cut_to names: by any of its members, or by its place.
export function planCut(input: {
  groups: readonly CrewGroup[];
  characterIds: readonly string[];
  place: string;
  fightOn: boolean;
}): CutPlan {
  if (!isSplit(input.groups)) {
    return { ok: false, error: "The crew is together: there is no other group to cut to.", refused: "rules" };
  }
  const placeKey = textKey(input.place);
  const named = input.characterIds.map((ref) =>
    input.groups.find((group) => group.members.some((member) => member.id === ref || textKey(member.name) === textKey(ref))),
  );
  const byPlace = placeKey ? input.groups.find((group) => group.placeId === placeKey) : undefined;
  const picked = [...named, byPlace].filter((group): group is CrewGroup => Boolean(group));
  if (!picked.length) {
    return { ok: false, error: `No group there. The groups: ${input.groups.map(groupLine).join("; ")}.`, retry: true };
  }
  if (picked.some((group) => group.placeId !== picked[0].placeId)) {
    return { ok: false, error: "Those characters are in different places: cut to one group at a time.", retry: true };
  }
  const group = picked[0];
  // Already the scene (a question to them cut to it): nothing to undo.
  if (group.inScene) return { ok: true, group };
  if (input.fightOn) {
    return { ok: false, error: "A fight holds the scene until it is over: the others can only run into it (move_party into the scene's place).", refused: "rules" };
  }
  return { ok: true, group };
}

function groupLine(group: CrewGroup): string {
  return `${group.placeName}: ${group.members.map((member) => `${member.name} (${member.id})`).join(", ")}`;
}

// What a group off scene has been doing while the story was elsewhere: how
// many GM passages since it was last in the scene, and the moves its
// players sent since then.
export type OffScene = { placeId: string; turnsAway: number; moves: Array<{ name: string; content: string }> };

const MOVE_CHARS = 300;
const MOVES_SHOWN = 4;
// A group left this long off scene is named as owed a cut.
const TURNS_BEFORE_CUT = 2;

export function heldMovesLine(moves: OffScene["moves"]): string {
  const shown = moves.slice(-MOVES_SHOWN).map((move) => `${move.name}: "${move.content.replace(/\s+/g, " ").trim().slice(0, MOVE_CHARS)}"`);
  return shown.join(" ");
}

export function whereaboutsPrompt(groups: readonly CrewGroup[], away: readonly OffScene[]): string {
  if (!isSplit(groups)) {
    return [
      "SPLITTING UP: the crew can split, and the players decide it. When players say they go to different places (one to the airlock, another to the cockpit), do not ask them to stay together: call move_party naming who goes (characterIds); the rest stay where they are, and the scene follows those who went. Then cut_to the others when it is their turn.",
      `At most ${MAX_GROUPS} groups. Only a glance through a doorway the crew is standing at is an action rather than a split.`,
    ].join("\n");
  }
  const lines = [`CREW WHEREABOUTS (every phone and the TV show it): the crew is split into ${groups.length} groups (at most ${MAX_GROUPS}).`];
  for (const group of groups) {
    const who = group.members.map((member) => `${member.name} (${member.id})`).join(", ");
    if (group.inScene) {
      lines.push(`- IN THE SCENE: ${group.placeName}: ${who}.`);
      continue;
    }
    const off = away.find((entry) => entry.placeId === group.placeId);
    const turns = off?.turnsAway ?? 0;
    const owed = turns >= TURNS_BEFORE_CUT || Boolean(off?.moves.length);
    lines.push(
      [
        `- Off scene: ${group.placeName}: ${who}.`,
        turns ? `Off scene for ${turns} of your turns.` : "",
        off?.moves.length ? `Waiting to be played: ${heldMovesLine(off.moves)}` : "",
        owed ? "Cut to them soon." : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  lines.push(
    "Narrate only the group in the scene and answer only their moves. The room hears every scene, but the characters know only what happened where they were.",
    "To switch the scene, call cut_to with a group's characterIds (or its place), then open the narration with the cut (\"Meanwhile, in the cargo hold...\"). Pick the moment that serves the story: a cliffhanger, a quiet beat, a group that has waited. Never leave a group off scene for long, and cut to a group soon after it sends a move.",
    "Asking someone off scene a question (request_player_input) cuts the scene to their group, so put that question in a reply that narrates their scene; to ask the scene's group, name only them.",
    "move_party with no characterIds moves only the group in the scene; naming some of them splits it again. Off-scene characters can move only into the scene's place: they arrive in the scene, and join any fight there.",
  );
  return lines.join("\n");
}

// ---- the turn follows the scene ----

type SpotlightLike = { mode: "spotlight"; userIds: string[]; prompt: string; respondedUserIds: string[] };
type FloorLike = { mode: "open" } | SpotlightLike | { mode: "initiative" } | { mode: "hold"; next: FloorLike };

// The floor once the scene has cut to another group: a question still
// waiting on someone now off scene is withdrawn (their phone would hold the
// whole scene's boxes shut on "Waiting on Rafe"), and one left with nobody
// opens the floor. Null when nothing changes. Generic over the floor type so
// the caller keeps its own (src/lib/db/campaigns.ts Floor).
export function floorAfterCut<F extends FloorLike>(floor: F, inScene: ReadonlySet<string>): F | null {
  const trim = (spotlight: SpotlightLike): SpotlightLike | { mode: "open" } | null => {
    const userIds = spotlight.userIds.filter((id) => inScene.has(id));
    if (userIds.length === spotlight.userIds.length) return null;
    return userIds.length ? { ...spotlight, userIds, respondedUserIds: spotlight.respondedUserIds.filter((id) => inScene.has(id)) } : { mode: "open" };
  };
  if (floor.mode === "spotlight") return trim(floor as SpotlightLike) as F | null;
  if (floor.mode === "hold" && (floor as { next: FloorLike }).next.mode === "spotlight") {
    const next = trim((floor as { next: SpotlightLike }).next);
    return next ? ({ ...floor, next } as F) : null;
  }
  return null;
}

// Who a question goes to once the crew is split, by user: the asked who
// stand in the scene; or, when none of them do, the group of the first one
// asked, which the scene then cuts to (`cut`), so the room's screen is
// where the turn is.
export function spotlightGroup(
  groups: readonly CrewGroup[],
  userIds: readonly string[],
): { userIds: string[]; cut: CrewGroup | null } {
  const groupOfUser = (userId: string) => groups.find((group) => group.members.some((member) => member.userId === userId)) ?? null;
  const inScene = userIds.filter((id) => groupOfUser(id)?.inScene);
  if (inScene.length) return { userIds: inScene, cut: null };
  const first = userIds.map(groupOfUser).find((group): group is CrewGroup => Boolean(group)) ?? null;
  if (!first) return { userIds: [...userIds], cut: null };
  return { userIds: userIds.filter((id) => groupOfUser(id) === first), cut: first };
}

// ---- the story's group marks ----

// Which group a message written while the crew was split belongs to: a
// player's move the poster's, a GM passage the scene's.
export type CouchSceneTag = {
  messageId: string;
  placeName: string;
  // The group's crew at the time, so a phone knows whether it was its own.
  sheetIds: string[];
  // A GM passage, or a move from the group the scene was with.
  inScene: boolean;
};
