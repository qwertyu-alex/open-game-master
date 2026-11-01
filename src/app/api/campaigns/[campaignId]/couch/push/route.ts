import { z } from "zod";
import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { refuseDuringBreak } from "@/lib/dm/table-break";
import { declineCouchPush, pushCouchRoll, spendCouchStoryPoint } from "@/lib/couch/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A crew member pushes the check they just failed (docs/couch-mode-spec.md
// 2.3), from their phone, while the offer holds: +1 stress and one more
// throw. spend uses a story point instead, and the failure succeeds. decline
// takes the failure, so the GM goes on at once. 409 once the window has
// closed.
const pushSchema = z.object({ pendingRollId: z.string().trim().min(1).max(80), decline: z.boolean().optional(), spend: z.boolean().optional() });

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
  const paused = refuseDuringBreak(campaignId);
  if (paused) {
    return paused;
  }
  const parsed = pushSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Say which roll to push (pendingRollId)." }, { status: 400 });
  }
  if (parsed.data.decline) {
    return declineCouchPush(context.campaign, context.user.id, parsed.data.pendingRollId)
      ? Response.json({ ok: true })
      : Response.json({ error: "That roll is no longer waiting on you." }, { status: 409 });
  }
  const outcome = parsed.data.spend
    ? spendCouchStoryPoint(context.campaign, context.user.id, parsed.data.pendingRollId)
    : pushCouchRoll(context.campaign, context.user.id, parsed.data.pendingRollId);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json({ ok: true, roll: outcome.roll });
}
