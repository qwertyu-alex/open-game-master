import { z } from "zod";
import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { startTakeover, takeoverView } from "@/lib/couch/takeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Playing on after a death (docs/couch-mode-spec.md 2.12), for the phone of
// a player whose character died. GET: their dead character, the people in
// the story they may take over, and how a takeover is going. POST: take one
// over ("new" for a survivor the story has not named yet); 202 while the
// story model writes them, 409 when the choice is gone or they still have
// a living character.
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
  return Response.json(takeoverView(context.campaign, context.user.id));
}

const takeoverSchema = z.object({ choice: z.string().trim().min(1).max(80) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireMember(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  const parsed = takeoverSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Say who to play on as (choice)." }, { status: 400 });
  }
  const outcome = startTakeover(context.campaign, context.user.id, parsed.data.choice);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json({ ok: true, name: outcome.name }, { status: 202 });
}
