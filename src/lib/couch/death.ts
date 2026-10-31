import type { Campaign } from "@/lib/db/campaigns";
import { publishTitleCard } from "@/lib/dm/scene-state";
import type { CharacterSheet } from "@/lib/schemas/sheet";

// A crew member's death on a couch night (docs/couch-mode-spec.md 2.12),
// called by the death engine as it records one (src/lib/dm/death.ts). The
// room sees it on the TV as a card, the moment the server knows, so a
// death never passes as one more line of narration. The player's phone
// turns to taking over someone in the story by itself, from the sheet.
//
// Kept apart from src/lib/couch/takeover.ts: the death engine is imported
// by most of the rules, and this needs nothing past the title card.
export function couchCrewDied(campaign: Pick<Campaign, "id" | "gameSettings">, sheet: Pick<CharacterSheet, "name" | "crewRole" | "isCompanion">): void {
  if (!campaign.gameSettings.couchMode || sheet.isCompanion) {
    return;
  }
  publishTitleCard(campaign.id, { title: `${sheet.name} is dead`, ...(sheet.crewRole?.trim() ? { subtitle: sheet.crewRole.trim() } : {}), tone: "ember" });
}
