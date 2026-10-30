import type { Campaign } from "@/lib/db/campaigns";
import { listPendingForTurn } from "@/lib/db/dm-turns";
import { getRoll } from "@/lib/db/rolls";
import { listSheets } from "@/lib/db/sheets";
import { publishPersisted } from "@/lib/events";
import { enqueueNarrationAudio } from "@/lib/tts";
import { COUCH_ROLL_PARTS, couchAttackRulings, couchRollCall, couchRollFeedback, couchRollVoiceId } from "./roll-feedback-logic";

// Called around every model tool, so attacks, saves and damage get the
// same readout as request_roll, and from the pending-rolls route with the
// roll a crew member threw (pendingId), whose call was read when it parked.
// Read stored rolls, never model arithmetic.
export function publishCouchRollFeedback(campaign: Campaign, rollIds: readonly string[], reason = "", outcome: Record<string, unknown> = {}, pendingId?: string) {
  if (!campaign.gameSettings.couchMode || !rollIds.length) return;
  const sheets = listSheets(campaign.id);
  const rolls = rollIds.map(getRoll).filter((roll) => roll !== null);
  const rulings = couchAttackRulings(rolls, outcome);
  for (const roll of rolls) {
    const id = roll.id;
    const read = couchRollFeedback(roll, sheets.find((sheet) => sheet.id === roll.characterId)?.name, reason, rulings.get(id));
    if (!read) continue;
    const feedback = pendingId ? { ...read, pendingId } : read;
    publishPersisted(campaign.id, "couch_roll", feedback);
    if (campaign.gameSettings.ttsEnabled) {
      for (const part of pendingId ? (["result"] as const) : COUCH_ROLL_PARTS) {
        void enqueueNarrationAudio(campaign.id, couchRollVoiceId(id, part), part === "announce" ? feedback.announcement : feedback.result,
          [], campaign.gameSettings, null, { onDemand: true, narratorOnly: true });
      }
    }
  }
}

// Each parked roll is called aloud once, after the tool that parked it:
// a request_roll, a pc_attack, or the damage a parked hit asks for next.
// The TV shows the call from the stream's own roll_pending until the phone
// throws it; this only reads it. Remembered for the life of the server.
declare global {
  var __odmCouchRollCalls: Set<string> | undefined;
}

const called: Set<string> = (globalThis.__odmCouchRollCalls ??= new Set<string>());

export function announceCouchRollCalls(campaign: Campaign, turnId: string) {
  if (!campaign.gameSettings.couchMode || !campaign.gameSettings.ttsEnabled) return;
  const waiting = listPendingForTurn(turnId).filter((pending) =>
    pending.status === "pending" && pending.visibility === "public" && !called.has(pending.id));
  if (!waiting.length) return;
  const sheets = listSheets(campaign.id);
  for (const pending of waiting) {
    called.add(pending.id);
    if (called.size > 500) called.delete(called.values().next().value as string);
    const call = couchRollCall(pending, sheets.find((sheet) => sheet.id === pending.characterId)?.name);
    void enqueueNarrationAudio(campaign.id, couchRollVoiceId(pending.id, "call"), call.announcement,
      [], campaign.gameSettings, null, { onDemand: true, narratorOnly: true });
  }
}
