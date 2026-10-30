import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { couchView } from "@/lib/couch/play";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A couch night's lobby for every member (docs/couch-mode-spec.md 2.1): the
// forge's state, the scenario's public face, and the crew cards with who
// holds each. Never an agenda, a hidden role or the truth: the TV shows this
// to the whole room.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireMember(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  const view = context.campaign.gameSettings.couchMode ? couchView(campaignId) : null;
  if (!view) {
    return Response.json({ error: "This table is not a couch night." }, { status: 404 });
  }
  return Response.json(view);
}
