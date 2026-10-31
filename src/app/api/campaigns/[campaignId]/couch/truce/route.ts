import { z } from "zod";
import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { answerCouchTruce } from "@/lib/couch/truce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A crew member's answer to a truce offered in a couch fight
// (docs/couch-mode-spec.md 2.11), from their phone, whoever's move it is.
// 409 when the truce is settled or is not waiting on them.
const answerSchema = z.object({ truceId: z.string().trim().min(1).max(80), accept: z.boolean() });

export async function POST(
  request: Request,
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
  const parsed = answerSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Say which truce (truceId) and whether you accept it (accept)." }, { status: 400 });
  }
  const outcome = answerCouchTruce(context.campaign, context.user.id, parsed.data.truceId, parsed.data.accept);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json({ ok: true, truce: outcome.truce });
}
