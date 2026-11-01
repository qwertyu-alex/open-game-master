import { allocateSeq, type Campaign } from "@/lib/db/campaigns";
import { getDatabase } from "@/lib/db/core";
import { getPendingRoll, listPendingForTurn, setPendingCombatNote, type PendingRoll } from "@/lib/db/dm-turns";
import { getRoll, insertRoll, type StoredRoll } from "@/lib/db/rolls";
import { getSheetById, setSheetAgenda } from "@/lib/db/sheets";
import { rollExpression } from "@/lib/dice";
import { publishPersisted, publishWithSeq } from "@/lib/events";
import { resumeHumanTurn } from "@/lib/dm/invoke";
import { enqueueDmJob } from "@/lib/dm/queue";
import { resumeDmTurn } from "@/lib/dm/turn";
import { checkSuccess } from "@/lib/couch/check-logic";
import { groupedPendingIds } from "@/lib/couch/group-check";
import { publishCouchRollFeedback } from "@/lib/couch/roll-feedback";
import { adjustCouchStress, applyCouchStressDice, couchStressOf, recordCouchStressRoll } from "@/lib/couch/stress";
import { PUSH_WINDOW_MS, STORY_POINT_MARK, STRESS_KINDS, STRESS_MAX, type PushOffer } from "@/lib/couch/stress-logic";

// Pushing a failed roll on a couch night (docs/couch-mode-spec.md 2.3): the
// thrower may throw it again once, for +1 stress, before the GM reads it.
// Or they spend a story point (2.2) and the failure becomes a success, the
// dice as they fell: the one way a player overrides the dice, earned by
// chasing their agenda.
// A failed check or save that can be pushed holds the GM's turn for
// PUSH_WINDOW_MS while the phone offers "Push it"; a push re-throws at once
// with the new stress and lets the turn go on, and the window running out
// lets it go on with the failure. Offers live in memory: after a restart
// the turn, its rolls all thrown, is resumed by restart recovery as any
// parked turn is.

type Offer = { campaignId: string; turnId: string; characterId: string; userId: string; until: number; push: boolean; storyPoints: number; timer: ReturnType<typeof setTimeout> };

declare global {
  var __odmCouchPush: Map<string, Offer> | undefined;
}

const offers = () => (globalThis.__odmCouchPush ??= new Map<string, Offer>());

export function couchPushOffers(campaignId: string): PushOffer[] {
  return [...offers()].filter(([, offer]) => offer.campaignId === campaignId).map(([pendingRollId, offer]) => ({ pendingRollId, characterId: offer.characterId, until: offer.until, push: offer.push, storyPoints: offer.storyPoints }));
}

function publishOffers(campaignId: string) {
  publishPersisted(campaignId, "couch_push", { offers: couchPushOffers(campaignId) });
}

// Whether a push offer still holds this turn: the GM waits for it.
export function couchPushHolds(turnId: string): boolean {
  return [...offers().values()].some((offer) => offer.turnId === turnId);
}

// The pending-rolls route's own ending, for a turn a push held: resumed once
// every roll is in and no offer still holds it.
function resumeWhenThrown(campaignId: string, turnId: string) {
  if (couchPushHolds(turnId)) return;
  if (listPendingForTurn(turnId).some((entry) => entry.status === "pending")) return;
  if (!resumeHumanTurn(turnId)) {
    enqueueDmJob(campaignId, () => resumeDmTurn(campaignId, turnId), { kind: "turn" });
  }
}

// Offers a push on a roll just thrown, and says whether it did: the caller
// then leaves the turn to the offer. Only a crew member's own failed check
// or save, not one in a group check. At full stress there is no push, but
// a story point can still be spent.
export function offerCouchPush(campaign: Pick<Campaign, "id" | "gameSettings">, pending: PendingRoll, roll: Pick<StoredRoll, "success">): boolean {
  if (!campaign.gameSettings.couchMode || !STRESS_KINDS.has(pending.kind) || pending.dc === null || roll.success !== false) return false;
  if (!pending.characterId || offers().has(pending.id) || groupedPendingIds(pending.turnId).has(pending.id)) return false;
  const sheet = getSheetById(pending.characterId);
  if (!sheet || sheet.deathSaves?.dead) return false;
  const push = couchStressOf(campaign.id, sheet.id) < STRESS_MAX;
  const storyPoints = sheet.agenda?.storyPoints ?? 0;
  if (!push && storyPoints < 1) return false;
  const until = Date.now() + PUSH_WINDOW_MS;
  const timer = setTimeout(() => {
    if (!offers().delete(pending.id)) return;
    publishOffers(campaign.id);
    resumeWhenThrown(campaign.id, pending.turnId);
  }, PUSH_WINDOW_MS);
  timer.unref?.();
  offers().set(pending.id, { campaignId: campaign.id, turnId: pending.turnId, characterId: pending.characterId, userId: pending.userId, until, push, storyPoints, timer });
  publishOffers(campaign.id);
  return true;
}

// The thrower takes the failure: the GM goes on now rather than when the
// window runs out.
export function declineCouchPush(campaign: Pick<Campaign, "id">, userId: string, pendingRollId: string): boolean {
  const offer = offers().get(pendingRollId);
  if (!offer || offer.campaignId !== campaign.id || offer.userId !== userId) return false;
  clearTimeout(offer.timer);
  offers().delete(pendingRollId);
  publishOffers(campaign.id);
  resumeWhenThrown(campaign.id, offer.turnId);
  return true;
}

export type PushResult = { ok: true; roll: StoredRoll } | { ok: false; status: number; error: string };

// The thrower pushes: +1 stress, then the same roll thrown again with the
// stress dice that stress now buys. The new roll answers the GM's call.
export function pushCouchRoll(campaign: Campaign, userId: string, pendingRollId: string): PushResult {
  const offer = offers().get(pendingRollId);
  if (!offer || offer.campaignId !== campaign.id) return { ok: false, status: 409, error: "That roll can no longer be pushed." };
  if (offer.userId !== userId) return { ok: false, status: 403, error: "Only the one who threw it can push it." };
  if (!offer.push) return { ok: false, status: 409, error: "At full stress there is no pushing it." };
  const pending = getPendingRoll(pendingRollId);
  if (!pending) return { ok: false, status: 404, error: "Roll not found." };
  clearTimeout(offer.timer);
  offers().delete(pendingRollId);
  adjustCouchStress(campaign, [offer.characterId], 1);
  let outcome = rollExpression(pending.expression);
  const stressed = applyCouchStressDice(campaign, offer.characterId, pending.kind, outcome);
  if (stressed) outcome = stressed.outcome;
  const roll = insertRoll({
    campaignId: campaign.id,
    characterId: pending.characterId,
    requestedBy: "player",
    kind: pending.kind,
    detail: `${pending.detail || pending.kind} (pushed)`.trim(),
    advantage: pending.advantage,
    dc: pending.dc,
    success: checkSuccess(campaign.gameSettings, pending.kind, pending.dc, outcome),
    result: outcome,
    attacker: null,
    visibility: pending.visibility,
  });
  getDatabase().prepare(`UPDATE pending_rolls SET roll_id = ? WHERE id = ?`).run(roll.id, pendingRollId);
  const pushed = `Pushed: ${getSheetById(offer.characterId)?.name ?? "They"} threw it again for +1 stress.`;
  if (stressed) recordCouchStressRoll(campaign.id, roll.id, stressed.words);
  setPendingCombatNote(pendingRollId, [pushed, stressed?.words ?? ""].filter(Boolean).join(" "));
  publishOffers(campaign.id);
  publishWithSeq(campaign.id, allocateSeq(campaign.id), "roll_result", { roll, pendingRollId, source: "digital" });
  try {
    publishCouchRollFeedback(campaign, [roll.id], pending.reason, {}, pendingRollId);
  } catch (error) {
    console.error(`[couch] push readout failed for pending roll ${pendingRollId}:`, error);
  }
  resumeWhenThrown(campaign.id, pending.turnId);
  return { ok: true, roll };
}

// The thrower spends a story point: the failure stands as a success, with
// the same dice, and the GM is told why. One point, off the agenda's count.
export function spendCouchStoryPoint(campaign: Campaign, userId: string, pendingRollId: string): PushResult {
  const offer = offers().get(pendingRollId);
  if (!offer || offer.campaignId !== campaign.id) return { ok: false, status: 409, error: "That roll has gone to the GM already." };
  if (offer.userId !== userId) return { ok: false, status: 403, error: "Only the one who threw it can spend a point on it." };
  const pending = getPendingRoll(pendingRollId);
  const failed = pending?.rollId ? getRoll(pending.rollId) : null;
  const sheet = getSheetById(offer.characterId);
  if (!pending || !failed || !sheet) return { ok: false, status: 404, error: "Roll not found." };
  if (!sheet.agenda || sheet.agenda.storyPoints < 1) return { ok: false, status: 409, error: "You have no story points to spend." };
  clearTimeout(offer.timer);
  offers().delete(pendingRollId);
  const updated = setSheetAgenda(sheet.id, { ...sheet.agenda, storyPoints: sheet.agenda.storyPoints - 1 });
  if (updated) publishPersisted(campaign.id, "sheet_updated", { sheet: updated });
  getDatabase()
    .prepare(`UPDATE rolls SET success = 1, detail = ? WHERE id = ?`)
    .run(`${failed.detail || pending.detail || pending.kind} ${STORY_POINT_MARK}`.trim(), failed.id);
  const roll = getRoll(failed.id) ?? failed;
  setPendingCombatNote(
    pendingRollId,
    [pending.combatNote ?? "", `Story point: ${sheet.name} spent a story point, so this roll SUCCEEDS whatever the dice say. Narrate the success, and make it feel earned.`].filter(Boolean).join(" "),
  );
  publishOffers(campaign.id);
  publishWithSeq(campaign.id, allocateSeq(campaign.id), "roll_result", { roll, pendingRollId, source: "digital" });
  try {
    publishCouchRollFeedback(campaign, [roll.id], pending.reason, {}, pendingRollId);
  } catch (error) {
    console.error(`[couch] story point readout failed for pending roll ${pendingRollId}:`, error);
  }
  resumeWhenThrown(campaign.id, pending.turnId);
  return { ok: true, roll };
}
