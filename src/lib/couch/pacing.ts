import type { Campaign } from "@/lib/db/campaigns";
import { getDatabase } from "@/lib/db/core";
import { publishPersisted } from "@/lib/events";
import { getCouchForge, setCouchObjective, startCouchActClock } from "@/lib/couch/store";
import { couchPacingLine, readObjective, type CouchObjective } from "@/lib/couch/pacing-logic";

// The rim of the night's pace (src/lib/couch/pacing-logic.ts): the act
// clock and the GM's replies since it started, read for every couch turn's
// prompt, and the objective every screen shows.

function repliesSince(campaignId: string, since: string): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM campaign_messages WHERE campaign_id = ? AND author_type = 'dm' AND created_at >= ?`)
    .get(campaignId, since) as { n: number } | undefined;
  return row?.n ?? 0;
}

// "" off a couch night, before the night is forged, and during a fight,
// which is the scene until it ends (COUCH_FIGHT_RULES): a fight is never
// hurried by the act's clock.
export function couchPacingPrompt(campaign: Campaign, inFight: boolean): string {
  if (!campaign.gameSettings.couchMode || inFight) return "";
  const forge = getCouchForge(campaign.id);
  if (!forge || forge.status !== "ready") return "";
  const since = startCouchActClock(campaign.id);
  const minutes = (Date.now() - Date.parse(since)) / 60000;
  return couchPacingLine({
    act: forge.act,
    minutes: Number.isFinite(minutes) ? minutes : 0,
    replies: repliesSince(campaign.id, since),
    objective: forge.objective,
    nightMinutes: forge.forge?.scenario.minutes,
  });
}

// The objective on screen now: only the act in force's, so a new act starts
// with a clean slate on the TV.
export function couchObjective(campaign: Campaign): CouchObjective | null {
  if (!campaign.gameSettings.couchMode) return null;
  const forge = getCouchForge(campaign.id);
  return forge?.objective && forge.objective.act === forge.act ? forge.objective : null;
}

export function publishCouchObjective(campaign: Campaign): void {
  if (!campaign.gameSettings.couchMode) return;
  publishPersisted(campaign.id, "couch_objective", { objective: couchObjective(campaign) });
}

// set_objective: written for the act in force, then on every screen.
export function stateCouchObjective(campaign: Campaign, text: string, clock: string): CouchObjective | null {
  const forge = getCouchForge(campaign.id);
  const objective = readObjective({ text, clock, act: forge?.act ?? 0 });
  if (!forge || !objective) return null;
  setCouchObjective(campaign.id, objective);
  publishCouchObjective(campaign);
  return objective;
}
