// A fight on a couch night (docs/couch-mode-spec.md 2.11), the pure half:
// what the TV's fight screen and the phone's fight line show, read from the
// player-safe encounter the stream already carries (encounter-view.ts
// PublicEncounter: health in words, never hit points). No React, no fetch
// and no clock, so scripts/test-couch-fight.mjs imports it directly.
import type { PublicEncounter } from "@/lib/db/encounter-view";
import type { EncounterSummary } from "@/lib/dm/encounter-summary";
import { healthState, type HealthState } from "@/lib/bestiary/health";
import type { CombatSide } from "@/lib/dm/combat-sides-logic";
import { ENEMY_TURN_NAME } from "@/lib/dm/turn-owner";
import { textKey } from "@/lib/language/text-logic";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import type { CharacterSheet } from "@/lib/schemas/sheet";

// ---- the creature's pictures ----

// Which of a creature's three pictures fits how it is doing: whole while
// it is unhurt or scratched, hurt once it is bloodied, down once it is dead
// or knocked out. One that ran is shown whole and marked as fled.
export type FightArtStage = "whole" | "hurt" | "down";

export function fightArtStage(enemy: { health: HealthState; status: string; knockedOut?: boolean }): FightArtStage {
  if (enemy.status === "dead" || enemy.knockedOut || enemy.health === "dead") return "down";
  if (enemy.status === "fled") return "whole";
  return enemy.health === "bloodied" || enemy.health === "near death" ? "hurt" : "whole";
}

// One set of pictures per kind of creature a night meets: the run of
// numbers the engine gives a pack ("Hunter 2") is the same beast, and the
// same name in a later fight is the same beast again.
export function fightArtKey(name: string): string {
  return textKey(name.replace(/\s+#?\d+$/u, ""));
}

// ---- the fight, as the TV shows it ----

export type FightTone = "unhurt" | "hurt" | "bloodied" | "dying" | "down" | "fled";

export type FightEnemy = {
  id: string;
  name: string;
  artKey: string;
  stage: FightArtStage;
  tone: FightTone;
  // How it is doing in plain words, big enough to read from the couch.
  words: string;
  // 0 to 4 lit pips: the health bar without a number behind it.
  pips: number;
  // Its turn is being played now.
  acting: boolean;
  conditions: string[];
  // A crew member fighting on this side (src/lib/couch/crew-fight.ts): their
  // character's id, and their portrait for the card until the night has
  // painted them for the fight.
  crewId?: string;
  portrait?: string;
};

// A crew member as the fight reads them: health is public on a couch night
// (the TV's crew strip shows it), so a crew member on the other side gets a
// card like any foe's.
export type CrewHealth = { id: string; name: string; currentHp: number; maxHp: number; dead?: boolean; portrait?: string };

export type FightSeat = {
  key: string;
  kind: "crew" | "enemy";
  side: CombatSide;
  // A character's id or an enemy's.
  id: string;
  name: string;
  current: boolean;
  out: boolean;
};

export type CouchFight = {
  round: number;
  // Initiative is still being thrown: nobody acts until it is in.
  rolling: boolean;
  order: FightSeat[];
  // Everyone on the foes' side: the creatures, and any crew member who has
  // turned on the others.
  enemies: FightEnemy[];
  // The crew's side as cards, for the phone of a crew member fighting them.
  crew: FightEnemy[];
  // The crew members fighting on the foes' side, by character id.
  turned: string[];
  // Whose move it is: a crew member's character id, name and side, or the
  // creatures' turn.
  turn: { kind: "crew"; characterId: string; name: string; side: CombatSide } | { kind: "enemy"; names: string[] } | null;
  // The crew member up after the one acting (or after the creatures).
  upNext: { characterId: string; name: string } | null;
};

const TONE: Record<HealthState, { tone: FightTone; words: string; pips: number }> = {
  healthy: { tone: "unhurt", words: "Unhurt", pips: 4 },
  wounded: { tone: "hurt", words: "Hurt", pips: 3 },
  bloodied: { tone: "bloodied", words: "Bloodied", pips: 2 },
  "near death": { tone: "dying", words: "Near death", pips: 1 },
  dead: { tone: "down", words: "Down", pips: 0 },
};

function enemyTone(enemy: PublicEncounter["enemies"][number]): { tone: FightTone; words: string; pips: number } {
  if (enemy.status === "fled") return { tone: "fled", words: "Fled", pips: 0 };
  if (enemy.status === "dead" || enemy.knockedOut) return { tone: "down", words: enemy.knockedOut ? "Out cold" : "Down", pips: 0 };
  return TONE[enemy.health] ?? TONE.healthy;
}

function crewTone(member: CrewHealth): { tone: FightTone; words: string; pips: number } {
  if (member.dead || member.currentHp <= 0) return { tone: "down", words: "Down", pips: 0 };
  return TONE[healthState(member.currentHp, member.maxHp)] ?? TONE.healthy;
}

// The fight as the room sees it, or null when no fight is on. A tactical
// scene with nobody to fight is no fight; nor is an encounter that has
// ended. A fight of crew against crew has no creature in it and is one.
// `crew` are the crew's characters, read from the sheets.
export function couchFight(encounter: PublicEncounter | null, crew: readonly CrewHealth[] = []): CouchFight | null {
  if (!encounter || encounter.status !== "active") return null;
  const sides = encounter.sides ?? {};
  const crewSide = (id: string): CombatSide => sides[id] ?? "party";
  const crewById = new Map(crew.map((member) => [member.id, member]));
  const turned = crew.filter((member) => crewSide(member.id) === "foe").map((member) => member.id);
  if (!encounter.enemies.length && !turned.length) return null;
  const enemyTurn = encounter.enemyTurns === true || (encounter.acting?.name === ENEMY_TURN_NAME && !encounter.acting.id);
  const actingEnemies = new Set(encounter.enemiesUp ?? []);
  const actingCrew = !enemyTurn && encounter.orderReady ? (encounter.acting?.id ?? "") : "";
  const crewCard = (member: CrewHealth): FightEnemy => {
    const { tone, words, pips } = crewTone(member);
    return {
      id: member.id,
      name: member.name,
      artKey: fightArtKey(member.name),
      stage: tone === "down" ? "down" : tone === "bloodied" || tone === "dying" ? "hurt" : "whole",
      tone,
      words,
      pips,
      acting: actingCrew === member.id,
      conditions: [],
      crewId: member.id,
      ...(member.portrait ? { portrait: member.portrait } : {}),
    };
  };
  const rows = encounter.enemies.map((enemy): FightEnemy => {
    const { tone, words, pips } = enemyTone(enemy);
    return {
      id: enemy.id,
      name: enemy.name,
      artKey: fightArtKey(enemy.name),
      stage: fightArtStage(enemy),
      tone,
      words,
      pips,
      acting: enemyTurn && actingEnemies.has(enemy.id),
      conditions: enemy.conditions,
    };
  });
  const rowSide = (id: string): CombatSide => sides[id] ?? "foe";
  const enemies = [...rows.filter((row) => rowSide(row.id) === "foe"), ...turned.flatMap((id) => (crewById.get(id) ? [crewCard(crewById.get(id)!)] : []))];
  const allies = [
    ...crew.filter((member) => crewSide(member.id) === "party").map(crewCard),
    ...rows.filter((row) => rowSide(row.id) === "party"),
  ];
  const byId = new Map(rows.map((enemy) => [enemy.id, enemy]));
  const pointer = encounter.orderReady ? encounter.turnIndex : -1;
  const order = encounter.order.map((entry, index): FightSeat => {
    const enemy = entry.kind === "enemy" ? byId.get(entry.id) : undefined;
    return {
      key: `${index}:${entry.id}`,
      kind: entry.kind === "pc" ? "crew" : "enemy",
      side: entry.kind === "pc" ? crewSide(entry.id) : rowSide(entry.id),
      id: entry.id,
      name: entry.name,
      current: enemyTurn ? actingEnemies.has(entry.id) : index === pointer && entry.kind === "pc",
      out: entry.kind === "pc" ? (crewById.get(entry.id) ? crewTone(crewById.get(entry.id)!).tone === "down" : false) : !enemy || enemy.tone === "down" || enemy.tone === "fled",
    };
  });
  const acting = encounter.acting;
  const turn: CouchFight["turn"] = !encounter.orderReady
    ? null
    : enemyTurn
      ? { kind: "enemy", names: rows.filter((enemy) => enemy.acting).map((enemy) => enemy.name) }
      : acting?.id
        ? { kind: "crew", characterId: acting.id, name: acting.name, side: crewSide(acting.id) }
        : null;
  return {
    round: encounter.round,
    rolling: !encounter.orderReady,
    order,
    enemies,
    crew: allies,
    turned,
    turn,
    upNext: upNextCrew(encounter, enemyTurn),
  };
}

// The crew member whose move follows the one being played: after the
// creatures, the one the engine already names; otherwise the next crew
// member round the order who is still standing.
function upNextCrew(encounter: PublicEncounter, enemyTurn: boolean): CouchFight["upNext"] {
  if (enemyTurn) {
    return encounter.upNext?.id ? { characterId: encounter.upNext.id, name: encounter.upNext.name } : null;
  }
  const order = encounter.order;
  if (!encounter.orderReady || order.length < 2) return null;
  const currentId = encounter.acting?.id ?? "";
  for (let step = 1; step < order.length; step += 1) {
    const entry = order[(encounter.turnIndex + step) % order.length];
    if (entry.kind === "pc" && entry.id !== currentId) return { characterId: entry.id, name: entry.name };
  }
  return null;
}

// The crew as couchFight reads them, from the table's sheets: companions and
// summons are no crew.
export function crewHealthOf(sheets: readonly CharacterSheet[]): CrewHealth[] {
  return sheets
    .filter((sheet) => !sheet.isCompanion && !sheet.summon)
    .map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      currentHp: sheet.currentHp,
      maxHp: effectiveMaxHp(sheet),
      dead: sheet.deathSaves?.dead === true,
      ...(sheet.portrait?.url ? { portrait: sheet.portrait.url } : {}),
    }));
}

// ---- the fight, as a phone shows it ----

// Who a phone's fight strip lists: the other side. For a crew member who
// has turned on the others that is the crew; for everyone else the foes.
export function fightOpponents(fight: CouchFight, myCharacterIds: ReadonlySet<string>): { against: boolean; rows: FightEnemy[] } {
  const against = fight.turned.some((id) => myCharacterIds.has(id));
  return { against, rows: against ? fight.crew : fight.enemies };
}

// The line over the action box while a fight holds the floor. Only the crew
// member whose move it is may act; everyone else is told whose it is and
// when theirs comes, so a phone never looks like it is waiting on nothing.
export function fightTurnWords(fight: CouchFight, myCharacterIds: ReadonlySet<string>): { mine: boolean; headline: string; prompt: string } {
  if (fight.rolling) {
    return { mine: false, headline: "A fight! Initiative is being thrown", prompt: "" };
  }
  const turn = fight.turn;
  if (turn?.kind === "crew" && myCharacterIds.has(turn.characterId)) {
    return turn.side === "foe"
      ? { mine: true, headline: "Your move: you're fighting the crew", prompt: "One action: strike, shoot, run, hide, or offer a truce. Say it." }
      : { mine: true, headline: "Your move in the fight", prompt: "One action: strike, shoot, run, hide, help someone, or offer a truce. Say it." };
  }
  const next = fight.upNext && myCharacterIds.has(fight.upNext.characterId) ? "You're up next." : "";
  if (turn?.kind === "enemy") {
    const who = turn.names.length === 1 ? turn.names[0] : "The creatures";
    return { mine: false, headline: `${who} ${turn.names.length === 1 ? "moves" : "move"}…`, prompt: next };
  }
  return { mine: false, headline: turn ? `${turn.name}'s move in the fight` : "The fight goes on", prompt: next };
}

// ---- after the fight ----

export type FightOver = {
  title: string;
  line: string;
  rounds: number;
  crew: Array<{ characterId: string; name: string; dealt: number; taken: number; crits: number }>;
};

const OUTCOME: Record<string, { title: string; line: string }> = {
  victory: { title: "The crew wins", line: "Nothing is left standing against them." },
  enemies_fled: { title: "It got away", line: "The enemy broke off and fled." },
  party_fled: { title: "The crew ran", line: "They got clear. For now." },
  party_defeated: { title: "The crew falls", line: "Nobody is left standing." },
  truce: { title: "A truce", line: "Everyone stands down." },
};

function names(list: readonly string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

const wins = (list: readonly string[]) => `${names(list)} ${list.length === 1 ? "wins" : "win"}`;
const down = (list: readonly string[]) => `${names(list)} ${list.length === 1 ? "is" : "are"} down.`;

// A fight where crew fought crew is won by people, not by "the crew":
// victory is the crew's side over the turned, a defeat the turned over the
// crew's side.
function crewOutcome(outcome: string, crewSide: readonly string[], turned: readonly string[]): { title: string; line: string } | null {
  if (!turned.length || !crewSide.length) return null;
  switch (outcome) {
    case "victory":
      return { title: wins(crewSide), line: down(turned) };
    case "party_defeated":
      return { title: wins(turned), line: down(crewSide) };
    case "enemies_fled":
      return { title: `${names(turned)} got away`, line: "They broke off and ran." };
    case "party_fled":
      return { title: `${names(crewSide)} ran`, line: `${names(turned)} let them go. For now.` };
    case "truce":
      return { title: "A truce", line: "The crew stops fighting itself." };
    default:
      return null;
  }
}

// The card the TV holds up when a fight ends (the engine's own tally,
// encounter-summary.ts): how it ended in words, how long it ran, and what
// each crew member dealt and took. The crew only: an enemy's numbers stay
// the GM's. `turned` are the crew who fought on the foes' side.
export function fightOver(summary: EncounterSummary, crewIds: ReadonlySet<string>, turned: readonly string[] = []): FightOver {
  const fought = summary.fighters.filter((line) => crewIds.has(line.characterId));
  const turnedNames = fought.filter((line) => turned.includes(line.characterId)).map((line) => line.name);
  const crewNames = fought.filter((line) => !turned.includes(line.characterId)).map((line) => line.name);
  const words = crewOutcome(summary.outcome, crewNames, turnedNames) ?? OUTCOME[summary.outcome] ?? { title: "The fight is over", line: "" };
  return {
    ...words,
    rounds: summary.rounds,
    crew: summary.fighters
      .filter((line) => crewIds.has(line.characterId))
      .map((line) => ({ characterId: line.characterId, name: line.name, dealt: line.dealt, taken: line.taken, crits: line.nat20s })),
  };
}
