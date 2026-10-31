// Crew against crew on a couch night (docs/couch-mode-spec.md 2.11), the
// pure half. A fight has two sides (src/lib/dm/combat-sides-logic.ts): the
// crew's and the foes'. A crew member who turns on the others fights on the
// foes' side as themselves, still played from their own phone; the engine
// already runs a character on the other side (a companion who turns, a
// pact), so the couch only decides who crosses over and by what name.
// scripts/test-couch-fight.mjs.
import type { CombatSide } from "@/lib/dm/combat-sides-logic";
import { textKey } from "@/lib/language/text-logic";

export type CrewName = { id: string; name: string };

// The names a fight's roster may give a crew member by: the whole name, and
// the first name when no other crew member shares it ("Veya" for Veya Dunn).
// Name key to sheet id.
export function crewNameKeys(crew: readonly CrewName[]): Map<string, string> {
  const keys = new Map<string, string>();
  const firsts = new Map<string, string[]>();
  for (const member of crew) {
    const full = textKey(member.name);
    if (!full) continue;
    keys.set(full, member.id);
    const first = full.split(" ")[0];
    if (first && first !== full) firsts.set(first, [...(firsts.get(first) ?? []), member.id]);
  }
  for (const [first, ids] of firsts) {
    if (ids.length === 1 && !keys.has(first)) keys.set(first, ids[0]);
  }
  return keys;
}

// The side a crew member who attacks a crewmate moves to: the other one from
// the crewmate's. Null when they already fight on opposite sides, which is
// an ordinary attack.
export function crossingSide(attacker: CombatSide, target: CombatSide): CombatSide | null {
  if (attacker !== target) return null;
  return target === "party" ? "foe" : "party";
}
