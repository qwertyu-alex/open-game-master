import { z } from "zod";
import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { claimCrew } from "@/lib/couch/play";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const claimSchema = z.object({ crewId: z.string().trim().min(1).max(80) });

// A player takes a crew card from their phone: one each, first come first
// served (src/lib/couch/play.ts claimCrew). 409 when it is taken, when the
// caller already holds one, or when the caller is the TV.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireMember(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  const raw = await request.json().catch(() => ({}));
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Say which crew member to take (crewId)." }, { status: 400 });
  }
  const outcome = claimCrew(context.campaign, context.user.id, parsed.data.crewId);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json({ ok: true, sheetId: outcome.sheet.id });
}
