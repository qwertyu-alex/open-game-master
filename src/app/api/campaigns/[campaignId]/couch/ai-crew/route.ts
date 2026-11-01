import { isErrorResponse, requireLead } from "@/lib/campaign-api";
import { seatAiCrew } from "@/lib/couch/ai-crew";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The AI takes the crew cards the phones left (src/lib/couch/ai-crew.ts):
// the TV's Begin asks this first. The host's only; asked again, it seats
// nobody new. No body.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireLead(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  if (context.campaign.status !== "lobby") {
    return Response.json({ error: "The night has already begun." }, { status: 409 });
  }
  const outcome = seatAiCrew(context.campaign);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json({ ok: true, seated: outcome.seated });
}
