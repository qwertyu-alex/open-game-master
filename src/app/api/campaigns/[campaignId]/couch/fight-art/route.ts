import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { fightArtFor } from "@/lib/couch/fight-art";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The pictures of the creatures in a couch night's running fight
// (src/lib/couch/fight-art.ts): what is painted, and whether more is on the
// way, so the TV asks again until it is not. The first ask of a fight is
// what starts the painting. Only the fight's own creatures are painted, so
// nobody can spend the night's pictures on anything else.
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
  return Response.json(fightArtFor(campaignId));
}
