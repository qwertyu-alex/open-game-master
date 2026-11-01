import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { NO_STORYTELLER_MESSAGE, storytellerConfigured } from "@/lib/capabilities";
import { createCouchNight } from "@/lib/couch/forge";
import { OFF_LIMITS_MAX, PLAYERS_MAX } from "@/lib/couch/limits";
import { crewSeats, scenarioCard } from "@/lib/couch/scenario-cards";
import { harnessOfferFor } from "@/lib/harness/policy";
import { configuredDefaultStorySettings } from "@/lib/runtime-defaults";
import { campaignCreationRefusal, canCreateCampaigns } from "@/lib/shared-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A couch night (docs/couch-mode-spec.md): the one screen's answers.
// The rest is couch mode's own defaults (src/lib/couch/forge-logic.ts
// couchGameSettings), so there is nothing else to ask.
const couchSchema = z.object({
  // A written story's id (src/lib/couch/scenario-cards.ts): every night is
  // one, played on its site.
  scenario: z.string().trim().min(1).max(60),
  players: z.number().int().min(1).max(PLAYERS_MAX).default(3),
  // The crew the AI plays besides them (src/lib/couch/ai-crew.ts).
  aiCrew: z.number().int().min(0).max(PLAYERS_MAX).default(0),
  offLimits: z.string().trim().max(OFF_LIMITS_MAX).default(""),
});

// Creates the night with the caller as its TV (the party lead, playing no
// character) and starts the forge; answers at once with the campaign's id,
// and the TV's lobby follows the forge from there.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return unauthorized();
  }
  if (user.mustChangePassword) {
    return Response.json({ error: "Set a new password to continue." }, { status: 403 });
  }
  if (!canCreateCampaigns(user)) {
    return campaignCreationRefusal();
  }
  const raw = await request.json().catch(() => ({}));
  const parsed = couchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        error: `A couch night needs a story, 1 to ${PLAYERS_MAX} players, 0 to ${PLAYERS_MAX} AI crewmates, and an off-limits line of at most ${OFF_LIMITS_MAX} characters.`,
      },
      { status: 400 },
    );
  }
  const { players, aiCrew, offLimits, scenario } = parsed.data;
  const card = scenarioCard(scenario);
  if (!card) {
    return Response.json({ error: "That story is not on this server. Pick another." }, { status: 400 });
  }
  if (!crewSeats(card, players, aiCrew)) {
    return Response.json(
      { error: `"${card.title}" needs a crew of ${card.players.min} to ${card.players.max}, players and AI crewmates together.` },
      { status: 400 },
    );
  }
  // The AI runs the story: no storyteller, no night.
  if (!(await storytellerConfigured())) {
    return Response.json({ error: NO_STORYTELLER_MESSAGE, reason: "no_storyteller" }, { status: 409 });
  }
  // An agent program the admin keeps for campaigns an administrator leads
  // would refuse every turn of the night: the TV's account is told before
  // the night is made.
  if (configuredDefaultStorySettings().textProvider === "harness") {
    const offer = harnessOfferFor({ leadUserId: user.id });
    if (!offer.offered) {
      return Response.json({ error: offer.reason ?? "The server's agent is not available to this account.", reason: "no_storyteller" }, { status: 409 });
    }
  }
  const campaign = createCouchNight(user.id, { players, aiCrew, offLimits, scenarioId: card.id });
  return Response.json({ campaignId: campaign.id }, { status: 201 });
}
