// A carried thing shown on the TV, the pure half (src/lib/couch/item-show.ts
// publishes it). The phone has every item's picture in its Gear section;
// the room sees one when it matters: the weapon on the card of the roll it
// swings, and the thing a crew member uses, beside the scene for the turn
// that used it. Only what the GM did in the open: an attack or a use_item
// of a public turn, never a whisper's gift.
// scripts/test-couch-item-show.mjs.
import { itemTitle } from "@/lib/couch/item-art-logic";

// The picture of an item, as a roll card or the insert column shows it.
export type CouchItemPicture = { name: string; art: string };

// One item used in the open, for the insert column (`couch_item`).
export type CouchItemShow = CouchItemPicture & {
  id: string;
  turnId: string;
  characterId: string;
  characterName: string;
  // Who it was used on, when that was someone else.
  targetName?: string;
  // How many are left after this use, when the item is counted.
  remaining?: number;
};

// The item a weapon roll names, as the roll's own words carry it: "Rapier
// vs Bellweld Bladder", "Rapier (half on a miss) vs …". Null for any other
// roll, and for a roll whose words name no weapon.
export function rollItemTerm(kind: string, detail: string): string | null {
  if (kind !== "attack" && kind !== "damage") return null;
  const before = detail.split(/\s+vs\s+/i)[0] ?? "";
  const term = before
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+damage$/i, "")
    .trim();
  return term || null;
}

// Who swung a roll's weapon: the crew member who rolled it. An enemy's
// claw against a crew member is stored on the one it hit, and is not
// theirs to show.
export function rollWielderId(roll: { characterId: string | null; attacker: { kind: string; id: string } | null }): string | null {
  if (roll.attacker) return roll.attacker.kind === "sheet" ? roll.attacker.id : null;
  return roll.characterId;
}

type SheetRef = { id: string; name: string };

// A use_item that went through, read from the call and its answer: who used
// what, on whom, and how many are left. Null when it was refused or names
// nobody the table has.
export function itemUseFromTool(
  rawArguments: string,
  outcome: Record<string, unknown>,
  sheets: readonly SheetRef[],
): { sheet: SheetRef; item: string; target?: SheetRef; remaining?: number } | null {
  if (!outcome || typeof outcome !== "object" || outcome.error) return null;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArguments) as Record<string, unknown>;
  } catch {
    return null;
  }
  const sheet = findSheet(sheets, args.characterId);
  const named = typeof outcome.used === "string" ? outcome.used : typeof args.item === "string" ? args.item : "";
  const item = named.trim();
  if (!sheet || !item) return null;
  const target = findSheet(sheets, args.targetCharacterId);
  const remaining = typeof outcome.remaining === "number" && Number.isFinite(outcome.remaining) ? outcome.remaining : undefined;
  return {
    sheet,
    item,
    ...(target && target.id !== sheet.id ? { target } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
  };
}

// The model names a character by id or by name.
function findSheet(sheets: readonly SheetRef[], ref: unknown): SheetRef | undefined {
  if (typeof ref !== "string" || !ref.trim()) return undefined;
  const wanted = ref.trim().toLowerCase();
  return sheets.find((sheet) => sheet.id === ref) ?? sheets.find((sheet) => sheet.name.trim().toLowerCase() === wanted);
}

// The line under the item on the TV: "Renn uses Stim injector on Vasquez ·
// 1 left". The count says "last one" when nothing is left, which is the
// news the room should hear.
export function itemShowCaption(show: Pick<CouchItemShow, "name" | "characterName" | "targetName" | "remaining">): { title: string; line: string } {
  const title = itemTitle(show.name).title;
  const who = show.targetName ? `${show.characterName} uses it on ${show.targetName}` : `${show.characterName} uses it`;
  const count = show.remaining === undefined ? "" : show.remaining <= 0 ? " · the last one" : ` · ${show.remaining} left`;
  return { title, line: `${who}${count}` };
}

// The item the insert column shows now, if any: the newest one used, for as
// long as the turn that used it is the newest one narrated. The next turn's
// narration retires it, and a close-up the same turn painted of the thing
// (a scene insert) is shown in its place, since that is the better picture.
export function tvItemShow(
  items: readonly (CouchItemShow & { seq: number })[],
  messages: ReadonlyArray<{
    seq: number;
    authorType: string;
    dmTurnId?: string;
    generatedImage?: { url?: string; shot?: { kind?: string } } | null;
  }>,
): (CouchItemShow & { seq: number }) | null {
  const show = items.at(-1);
  if (!show) return null;
  const retired = messages.some((message) =>
    message.authorType === "dm" && message.dmTurnId && (
      (message.seq > show.seq && message.dmTurnId !== show.turnId) ||
      (message.dmTurnId === show.turnId && message.generatedImage?.url && message.generatedImage.shot?.kind === "insert")
    ));
  return retired ? null : show;
}
