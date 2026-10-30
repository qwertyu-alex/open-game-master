import type { Campaign } from "@/lib/db/campaigns";
import { allocateSeq } from "@/lib/db/campaigns";
import { insertCampaignMessage } from "@/lib/db/messages";
import { publishWithSeq } from "@/lib/events";
import { enqueueNarrationAudio } from "@/lib/tts";
import { COUCH_RULES_BRIEFING } from "./rules-logic";

export function publishCouchRules(campaign: Campaign) {
  if (!campaign.gameSettings.couchMode) return;
  const seq = allocateSeq(campaign.id);
  const message = insertCampaignMessage({ campaignId: campaign.id, seq, authorType: "dm", content: COUCH_RULES_BRIEFING, speech: [] });
  publishWithSeq(campaign.id, seq, "message_added", { message });
  if (campaign.gameSettings.ttsEnabled) {
    void enqueueNarrationAudio(campaign.id, message.id, message.content, [], campaign.gameSettings, null, { onDemand: true, narratorOnly: true });
  }
}
