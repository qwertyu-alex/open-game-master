import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { couchFightMap } from "@/lib/couch/fight-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The running fight's grid for a couch night's TV (src/lib/couch/fight-map.ts):
// the squares around the fighters, the crew in the fight and the creatures
// still standing. Null when no fight is on or it has no board.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireMember(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  if (!context.campaign.gameSettings.couchMode) {
    return Response.json({ error: "This table is not a couch night." }, { status: 404 });
  }
  return Response.json({ map: couchFightMap(campaignId) });
}
