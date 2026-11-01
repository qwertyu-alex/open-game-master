import { isErrorResponse, requireLead } from "@/lib/campaign-api";
import { couchAutoplayAllowed, playCouchTurn } from "@/lib/couch/autoplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stand-in players for testing (src/lib/couch/autoplay.ts): GET says whether
// the TV offers Play a turn at all, POST plays one round for everyone the GM
// waits on. The host's only, and off in production unless COUCH_AUTOPLAY=1.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireLead(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  return Response.json({ allowed: couchAutoplayAllowed() && Boolean(context.campaign.gameSettings.couchMode) });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireLead(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  if (!context.campaign.gameSettings.couchMode || !couchAutoplayAllowed()) {
    return Response.json({ error: "Stand-in players are a development tool, off on this server." }, { status: 404 });
  }
  return Response.json(await playCouchTurn(context.campaign));
}
