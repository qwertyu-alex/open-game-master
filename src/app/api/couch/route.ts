import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { NO_STORYTELLER_MESSAGE, storytellerConfigured } from "@/lib/capabilities";
import { createCouchNight } from "@/lib/couch/forge";
import { OFF_LIMITS_MAX, PLAYERS_MAX, SEED_MAX } from "@/lib/couch/limits";
import { scenarioCard, scenarioSeats } from "@/lib/couch/scenario-cards";
import { harnessOfferFor } from "@/lib/harness/policy";
import { configuredDefaultStorySettings } from "@/lib/runtime-defaults";
import { campaignCreationRefusal, canCreateCampaigns } from "@/lib/shared-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A couch night (docs/couch-mode-spec.md): the one screen's three answers.
// The rest is couch mode's own defaults (src/lib/couch/forge-logic.ts
// couchGameSettings), so there is nothing else to ask.
const couchSchema = z.object({
  // "" is "surprise us".
  seed: z.string().trim().max(SEED_MAX).default(""),
  players: z.number().int().min(1).max(PLAYERS_MAX).default(3),
  offLimits: z.string().trim().max(OFF_LIMITS_MAX).default(""),
  // A ready-made story's id (src/lib/couch/scenario-cards.ts), or "" for one
  // the AI writes from the seed. With one, the seed is not read.
  scenario: z.string().trim().max(60).default(""),
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
      { error: `A couch night needs a story seed of at most ${SEED_MAX} characters, 1 to ${PLAYERS_MAX} players, and an off-limits line of at most ${OFF_LIMITS_MAX} characters.` },
      { status: 400 },
    );
  }
  const { seed, players, offLimits, scenario } = parsed.data;
  const card = scenario ? scenarioCard(scenario) : undefined;
  if (scenario && !card) {
    return Response.json({ error: "That ready-made story is not on this server. Pick another, or write a new one." }, { status: 400 });
  }
  if (card && !scenarioSeats(card, players)) {
    return Response.json({ error: `"${card.title}" is written for ${card.players.min} to ${card.players.max} players.` }, { status: 400 });
  }
  // The AI runs the story even when it did not write it: no storyteller, no
  // night.
  if (!(await storytellerConfigured())) {
    return Response.json({ error: NO_STORYTELLER_MESSAGE, reason: "no_storyteller" }, { status: 409 });
  }
  // An agent program the admin keeps for campaigns an administrator leads
  // would write the story and then refuse every turn of it: the TV's
  // account is told before the night is made.
  if (configuredDefaultStorySettings().textProvider === "harness") {
    const offer = harnessOfferFor({ leadUserId: user.id });
    if (!offer.offered) {
      return Response.json({ error: offer.reason ?? "The server's agent is not available to this account.", reason: "no_storyteller" }, { status: 409 });
    }
  }
  const campaign = createCouchNight(user.id, { seed: card ? "" : seed, players, offLimits, scenarioId: card?.id ?? "" });
  return Response.json({ campaignId: campaign.id }, { status: 201 });
}
