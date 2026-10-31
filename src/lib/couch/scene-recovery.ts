import { getCampaignById } from "@/lib/db/campaigns";
import { getDatabase } from "@/lib/db/core";
import { getCampaignMessage, setMessageImageRequest } from "@/lib/db/messages";
import { fulfillSceneShot } from "@/lib/dm/images";

// A couch turn's scene picture (src/lib/dm/images.ts fulfillSceneShot) is
// a job in the media queue's memory, and the request it fills is in the
// database. A restart before it ran left the request open with nothing to
// paint it: the TV kept the black screen of a picture that never comes. So
// once a server process starts (src/instrumentation.ts), each couch table's
// newest open scene request is queued again, and an older one, which a
// newer passage's picture would have taken the place of anyway, is closed.
export function resumeSceneShotsAfterRestart(): number {
  const rows = getDatabase()
    .prepare(
      `SELECT id, campaign_id AS campaignId FROM campaign_messages
        WHERE author_type = 'dm'
          AND generated_image_json IS NULL
          AND json_extract(image_request_json, '$.needed') = 1
          AND json_extract(image_request_json, '$.reason') = 'scene'
        ORDER BY campaign_id, seq DESC`,
    )
    .all() as Array<{ id: string; campaignId: string }>;
  const seen = new Set<string>();
  let resumed = 0;
  for (const row of rows) {
    const message = getCampaignMessage(row.id);
    if (!message?.imageRequest) continue;
    const campaign = getCampaignById(row.campaignId);
    const newest = !seen.has(row.campaignId);
    seen.add(row.campaignId);
    if (newest && campaign?.gameSettings.couchMode && campaign.status === "active") {
      void fulfillSceneShot(campaign.id, message.id, message.imageRequest, campaign.settings);
      resumed += 1;
      continue;
    }
    setMessageImageRequest(message.id, { ...message.imageRequest, needed: false });
  }
  return resumed;
}
