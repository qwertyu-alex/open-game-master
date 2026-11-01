// The fight's grid for a couch TV (src/lib/couch/fight-map-logic.ts), read
// from the running fight's battle map. The TV signs in as the host, who
// plays no character, so the board's own projection would show it the crew
// on a dark field and no creature at all. This one shows the room what the
// TV already names: the crew in the fight and every creature still standing
// in it that the GM has not hidden, on the squares around them.
import { getBattleMapForEncounter, getTokenByRef, listTokens } from "@/lib/db/battle-maps";
import { getDatabase } from "@/lib/db/core";
import { getActiveEncounter, listEnemies } from "@/lib/db/encounters";
import { listSheets } from "@/lib/db/sheets";
import { buildPlayerMapView, pcMoveBudget } from "@/lib/battlemap/view";
import { cropFightMap, type CouchFightMap, type FightMapToken } from "@/lib/couch/fight-map-logic";

export function couchFightMap(campaignId: string): CouchFightMap | null {
  const encounter = getActiveEncounter(campaignId);
  if (!encounter || encounter.status !== "active") return null;
  const map = getBattleMapForEncounter(encounter.id);
  if (!map) return null;
  // A crew member elsewhere keeps a token on the board but is not in the
  // fight until they run in and take a place in the order.
  const fighting = new Set(encounter.order.flatMap((entry) => (entry.kind === "pc" ? [entry.characterId] : [])));
  const standing = new Set(listEnemies(encounter.id).filter((enemy) => enemy.status === "alive").map((enemy) => enemy.id));
  const hp = new Map(listSheets(campaignId).map((sheet) => [sheet.id, sheet.currentHp]));
  // When each figure last changed, on the server's clock as the board's
  // effects are: the TV plays a walk and a swing in the order they happened
  // (fight-map-logic.ts queueBeats), whichever reached it first.
  const touched = new Map(
    (getDatabase().prepare(`SELECT id, updated_at FROM battle_tokens WHERE map_id = ?`).all(map.id) as Array<{ id: string; updated_at: string }>)
      .map((row) => [row.id, Date.parse(row.updated_at) || 0]),
  );
  const tokens: FightMapToken[] = listTokens(map.id)
    .filter((token) => !token.hidden && (token.kind === "pc" ? fighting.has(token.refId) : token.kind === "enemy" && standing.has(token.refId)))
    .map((token) => ({
      id: token.id,
      kind: token.kind as "pc" | "enemy",
      refId: token.refId,
      name: token.name,
      x: token.x,
      y: token.y,
      down: token.kind === "pc" && (hp.get(token.refId) ?? 1) <= 0,
      movedAt: touched.get(token.id) ?? 0,
    }));
  const crop = cropFightMap(map, tokens);
  if (!crop) return null;
  // Where the crew member whose turn it is can still walk, from the board's
  // own lit squares (src/lib/battlemap/view.ts): the movement they have
  // spent, Dash, prone, conditions and armour all count, so the TV's green
  // is the move route's answer, not an estimate from base speed.
  const entry = encounter.orderReady ? encounter.order[encounter.turnIndex] : undefined;
  const sheet = entry?.kind === "pc" ? listSheets(campaignId).find((candidate) => candidate.id === entry.characterId) : undefined;
  const token = sheet ? getTokenByRef(map.id, sheet.id) : null;
  if (sheet && token && sheet.currentHp > 0) {
    // The feet in hand come from the one budget the board and the move
    // route share. The squares come from the board's own view for that
    // player, which lights them only when the engine lets them walk now; a
    // couch whose floor is not on initiative gets the feet alone, and the
    // TV walks them out itself.
    const feetLeft = pcMoveBudget(campaignId, encounter, map, sheet, token).tiles * 5;
    const view = sheet.userId ? buildPlayerMapView(campaignId, sheet.userId) : null;
    const lit = view && view.myTokenId === token.id && view.budgetLeft > 0;
    const inCrop = (x: number, y: number) => x >= crop.x && y >= crop.y && x < crop.x + crop.width && y < crop.y + crop.height;
    crop.move = {
      refId: sheet.id,
      feetLeft,
      ...(lit
        ? {
            squares: view.reachable.flatMap((index) => {
              const x = index % map.width;
              const y = Math.floor(index / map.width);
              return inCrop(x, y) ? [`${x},${y}`] : [];
            }),
          }
        : {}),
    };
  }
  return crop;
}
