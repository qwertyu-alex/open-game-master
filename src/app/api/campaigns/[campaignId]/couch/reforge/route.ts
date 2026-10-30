import { isErrorResponse, requireLead } from "@/lib/campaign-api";
import { restartForge } from "@/lib/couch/forge";
import { couchView } from "@/lib/couch/play";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The lead (the TV) asks for the story again: after a forge that failed, or
// for a scenario nobody has taken a card from yet. Once a card is taken the
// crew is somebody's, and a new story would take it from them.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireLead(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  const view = context.campaign.gameSettings.couchMode ? couchView(campaignId) : null;
  if (!view) {
    return Response.json({ error: "This table is not a couch night." }, { status: 404 });
  }
  if (context.campaign.status !== "lobby") {
    return Response.json({ error: "The story has already started." }, { status: 409 });
  }
  if (view.status === "forging") {
    return Response.json({ error: "The story is still being written." }, { status: 409 });
  }
  if (view.crew.some((card) => card.claimedBy)) {
    return Response.json({ error: "A crew card is already taken, so the story stays." }, { status: 409 });
  }
  restartForge(campaignId);
  return Response.json({ ok: true, status: "forging" });
}
