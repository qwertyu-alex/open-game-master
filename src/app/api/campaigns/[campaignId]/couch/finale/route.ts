import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { readyCouchFinale } from "@/lib/couch/finale";
import { FinaleClipMissingError, renderFinaleClip } from "@/lib/couch/finale-voice";
import { serveGeneratedFile } from "@/lib/serve-file";
import { PaidAiRefusedError } from "@/lib/shared-host";
import { describeSpeechFailure, ttsBackend } from "@/lib/tts-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The night's closing read aloud on the TV (src/lib/couch/finale-voice.ts).
// GET ?step=n is that step of the reveal in the narrator's voice; the TV
// plays it and moves on when it ends. Only once the closing is written:
// before then nothing in it is for anyone's ears.

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
  if (!Number.isInteger(step) || step < 0 || step > 40) {
    return Response.json({ error: "Say which step of the closing (step)." }, { status: 400 });
  }
  const backend = ttsBackend();
  if (!context.campaign.gameSettings.ttsEnabled || backend.provider === "off") {
    return Response.json({ error: "Narration is switched off." }, { status: 409 });
  }
  const finale = context.campaign.status === "ended" ? readyCouchFinale(campaignId) : null;
  if (!finale) {
    return Response.json({ error: "The closing is not written yet." }, { status: 409 });
  }
  let segments: string[];
  try {
    segments = await renderFinaleClip(context.campaign, finale, step);
  } catch (error) {
    if (error instanceof FinaleClipMissingError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error(`[couch] closing step ${step} of ${campaignId} could not be read:`, error);
    const reason = error instanceof PaidAiRefusedError ? error.message : describeSpeechFailure(error, backend);
    return Response.json({ error: reason }, { status: 502 });
  }
  return serveGeneratedFile("generated-audio", segments, request);
}
