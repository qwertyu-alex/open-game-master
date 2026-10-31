import { z } from "zod";
import { isErrorResponse, requireLead, requireMember } from "@/lib/campaign-api";
import { publishCouchChange } from "@/lib/couch/forge";
import { IntroMissingError, renderIntroClip } from "@/lib/couch/intro";
import { couchView } from "@/lib/couch/play";
import { advanceCouchIntro } from "@/lib/couch/store";
import { serveGeneratedFile } from "@/lib/serve-file";
import { PaidAiRefusedError } from "@/lib/shared-host";
import { describeSpeechFailure, ttsBackend } from "@/lib/tts-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The TV's introductions before anyone picks (docs/couch-mode-spec.md 2.6).
// GET ?step=n is that step read aloud by the narrator: the briefing, then
// each crew member (src/lib/couch/intro.ts). POST moves the introductions
// on, from the TV: a step that has been heard, Next, or Skip.

export async function GET(
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
  const step = Number(new URL(request.url).searchParams.get("step"));
  if (!Number.isInteger(step) || step < 0 || step > 20) {
    return Response.json({ error: "Say which introduction (step)." }, { status: 400 });
  }
  const backend = ttsBackend();
  if (!context.campaign.gameSettings.ttsEnabled || backend.provider === "off") {
    return Response.json({ error: "Narration is switched off." }, { status: 409 });
  }
  let segments: string[];
  try {
    segments = await renderIntroClip(campaignId, step);
  } catch (error) {
    if (error instanceof IntroMissingError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error(`[couch] introduction ${step} of ${campaignId} could not be read:`, error);
    const reason = error instanceof PaidAiRefusedError ? error.message : describeSpeechFailure(error, backend);
    return Response.json({ error: reason }, { status: 502 });
  }
  return serveGeneratedFile("generated-audio", segments, request);
}

const advanceSchema = z.object({
  from: z.number().int().min(0).max(20),
  to: z.number().int().min(0).max(20),
});

// Only the lead's seat, the TV, moves the room through the introductions.
// From the step it was showing, so a second TV tab or a late Next does not
// skip one; 409 when the step had already moved, with where it is now.
export async function POST(
  request: Request,
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
  if (view.status !== "ready") {
    return Response.json({ error: "The crew is still being written." }, { status: 409 });
  }
  const parsed = advanceSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || parsed.data.to > view.intro.total) {
    return Response.json({ error: "Say which step the introductions move from and to." }, { status: 400 });
  }
  if (!advanceCouchIntro(campaignId, parsed.data.from, parsed.data.to)) {
    return Response.json({ error: "The introductions have already moved on.", step: view.intro.step }, { status: 409 });
  }
  publishCouchChange(campaignId);
  return Response.json({ ok: true, step: parsed.data.to });
}
