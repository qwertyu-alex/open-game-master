import type { RollResult } from "@/lib/dice";
import type { RollKind } from "@/lib/db/rolls";
import { dcForDifficulty } from "@/lib/srd/dc";
import { strictnessShift, type Strictness } from "@/lib/dm/safety-logic";

// Long shots on a couch night (docs/couch-mode-spec.md): a natural 20 passes
// a very_hard or nearly_impossible check. Level-1 crew bonuses top out near
// +5, so without it DC 25 is a 5% shot for a specialist and DC 30 is no shot
// at all, and the GM's "insane ask that could just work" could never work.
// Ordinary checks still go by the total alone, as SRD 5.1 has it. Pure, for
// scripts/test-couch-logic.mjs.

const CHECK_KINDS: ReadonlySet<RollKind> = new Set(["skill_check", "ability_check", "saving_throw"]);

type CheckSettings = { couchMode?: boolean; gm?: { strictness?: Strictness } };

// Whether a roll against a DC succeeds at this table, or undefined when it
// has no DC (the store then leaves success empty).
export function checkSuccess(
  settings: CheckSettings,
  kind: RollKind,
  dc: number | null | undefined,
  result: Pick<RollResult, "total" | "crit">,
): boolean | undefined {
  if (dc === undefined || dc === null) {
    return undefined;
  }
  if (result.total >= dc) {
    return true;
  }
  // The long-shot line follows the table's strictness, as the tiers do, so a
  // lenient table's very_hard (DC 23) is still a long shot.
  const longShot = dc >= dcForDifficulty("very_hard", strictnessShift(settings.gm?.strictness ?? "standard"));
  return Boolean(settings.couchMode) && CHECK_KINDS.has(kind) && longShot && result.crit === "nat20";
}
