import type { Campaign } from "@/lib/db/campaigns";
import { getDatabase } from "@/lib/db/core";
import { listMessagesInSeqRange } from "@/lib/db/messages";
import { listSheets } from "@/lib/db/sheets";
import { latestEventOfType, publishPersisted } from "@/lib/events";
import { enqueueNarrationAudio } from "@/lib/tts";
import { couchAnswersSpeech, couchRoundAnswers, type CouchAnswers } from "./answers-logic";

export function latestCouchAnswers(campaignId: string): CouchAnswers | null {
  return (latestEventOfType(campaignId, ["couch_answers"])?.payload as CouchAnswers | null) ?? null;
}

// Called at the same boundary that hands the collected replies to the GM.
// Enqueue first, without waiting for speech synthesis: the GM can write
// while the narrator reads, but its next narration follows on the same lane.
export function publishCouchAnswers(campaign: Campaign, since: number, through: number): CouchAnswers | null {
  if (!campaign.gameSettings.couchMode || campaign.floor.mode !== "open") return null;
  const passes = getDatabase().prepare(
    `SELECT json_extract(payload_json, '$.userId') AS userId, seq FROM campaign_events
     WHERE campaign_id = ? AND type = 'table_pass' AND seq > ? AND seq <= ? ORDER BY seq`,
  ).all(campaign.id, since, through) as Array<{ userId: string; seq: number }>;
  const round = couchRoundAnswers(
    listMessagesInSeqRange(campaign.id, since + 1, through),
    listSheets(campaign.id).filter((sheet) => !sheet.isCompanion).map((sheet) => ({
      userId: sheet.userId, characterId: sheet.id, name: sheet.name,
    })),
    passes,
  );
  if (!round || latestCouchAnswers(campaign.id)?.id === round.id) return null;
  publishPersisted(campaign.id, "couch_answers", round);
  if (campaign.gameSettings.ttsEnabled) {
    void enqueueNarrationAudio(campaign.id, round.id, couchAnswersSpeech(round), [], campaign.gameSettings, null, {
      onDemand: true, narratorOnly: true,
    });
  }
  return round;
}
