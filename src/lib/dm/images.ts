import { generateStoryImage, imageProducerReady } from "@/lib/image-generate";
import { imagesAvailable } from "@/lib/capabilities";
import {
  getCampaignMessage,
  getLatestDmMessage,
  setMessageGeneratedImage,
  setMessageImageRequest,
} from "@/lib/db/messages";
import { getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { boundaryNegativeTerms } from "@/lib/dm/safety-logic";
import { imageToolArgsSchema, type ImageToolArgs } from "@/lib/image-tool";
import { publishEphemeral, publishPersisted } from "@/lib/events";
import { enqueueMediaJob } from "@/lib/media-queue";
import { toEnglishForImage } from "@/lib/image-english";
import { artDirection, scenePrompt, typedStyle } from "@/lib/art-direction";
import { presetFor } from "@/lib/worlds/preset";
import { heuristicShot, wantsSceneShot } from "@/lib/dm/scene-shot-logic";
import { planScenePicture, portraitReferences } from "@/lib/dm/scene-shot";
import { keepEstablishingShot } from "@/lib/couch/place-shots";
import type { PictureShot } from "@/lib/dm/scene-shot-logic";
import type { PictureReference } from "@/lib/harness/picture-prompt-logic";
import type { AspectPreset, GeneratedImage, ImageRequest, StorySettings } from "@/lib/types";
import type { ToolResult } from "@/lib/dm/tool-errors";

// Ephemeral progress refinements for the pending-media placeholders. The
// durable truth stays derivable (a message with imageRequest and no
// generatedImage IS pending), so reloads never lose the placeholder.
export function publishMediaStatus(
  campaignId: string,
  kind: "image" | "map" | "tts",
  targetId: string,
  // "skipped": narration that fell behind and was passed over for a newer
  // passage (src/lib/tts.ts). Not a failure; the replay button still reads it.
  state: "queued" | "generating" | "failed" | "skipped",
  // Why it failed, in words the table can read (narration, issue 88).
  reason?: string,
) {
  publishEphemeral(campaignId, "media_status", {
    kind,
    targetId,
    state,
    startedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  });
}

// Why a picture or a map could not be made, in the words the table reads
// under its placeholder (as narration does, issue 88). The backends' errors
// are already sentences meant for people; this only bounds them.
export function pictureFailureReason(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const reason = text.replace(/\s+/g, " ").trim();
  return reason ? (reason.length > 240 ? `${reason.slice(0, 239)}…` : reason) : "The picture backend did not answer.";
}

// What a picture is painted from beyond its request: the words, and the
// faces it keeps (src/lib/harness/picture-prompt-logic.ts). A planned scene
// shot also says its framing, kept with the picture, and an insert its own
// shape.
export type PictureSubject = { prompt: string; references: PictureReference[]; aspect?: AspectPreset; shot?: PictureShot };

export type MessageImageOptions = {
  // The media queue's name for the job: a newer job of the same name takes
  // a waiting one's place (src/lib/media-queue.ts). One per message unless
  // said otherwise.
  label?: string;
  // Decided when the job runs rather than when it is queued (couch mode's
  // shot planner), so a job replaced while it waited never asks a model.
  subject?: (campaign: Campaign) => Promise<PictureSubject>;
  // Told of the picture once it is the message's (a couch place's
  // establishing shot is kept with the place).
  onPainted?: (image: GeneratedImage) => void;
};

// Fulfill a DM message's image request on the serial media queue. Called
// fire-and-forget after the DM turn persists, so narration never waits on
// the GPU. The client already renders message.generatedImage and handles
// the image_ready event; this is the missing producer side.
export function fulfillMessageImage(
  campaignId: string,
  messageId: string,
  request: ImageRequest,
  settings: StorySettings,
  options: MessageImageOptions = {},
) {
  const prompt = request.prompt;
  if (!prompt) {
    return Promise.resolve();
  }
  publishMediaStatus(campaignId, "image", messageId, "queued");
  return enqueueMediaJob(options.label ?? `image ${messageId}`, async () => {
    publishMediaStatus(campaignId, "image", messageId, "generating");
    try {
      const campaign = getCampaignById(campaignId);
      if (!campaign) {
        return;
      }
      // The table's boundary decides what the picture leaves out
      // (docs/vtt-parity-implementation-plan.md 9.1).
      const boundaries = campaign.gameSettings.safety?.boundaries ?? "standard";
      // The look the campaign has now (src/lib/art-direction.ts), leading
      // the subject the DM wrote. A typed style may need English too.
      const look = artDirection(campaign.settings, presetFor(campaign.gameSettings));
      const typed = typedStyle(campaign.settings, "scene");
      // The characters the narrator named keep their faces where the
      // backend takes reference pictures; their ids used to be dropped
      // before they got here (docs/couch-mode-spec.md 2.4).
      const subject = options.subject
        ? await options.subject(campaign)
        : { prompt, references: portraitReferences(campaignId, request.characterIds) };
      // The AI DM writes its prompt in English, a human DM may not.
      const english = await toEnglishForImage(campaign, { prompt: subject.prompt, style: typed });
      const image = await generateStoryImage(settings, {
        prompt: scenePrompt(typed ? english.style : look.scene, english.prompt),
        mode: request.mode ?? settings.imageMode,
        aspect: subject.aspect ?? request.aspect ?? settings.aspect,
        negative: boundaryNegativeTerms(boundaries),
        references: subject.references,
      });
      const stored = subject.shot ? { ...image, shot: subject.shot } : image;
      if (!setMessageGeneratedImage(messageId, stored)) {
        return;
      }
      publishPersisted(campaignId, "image_ready", { messageId, image: stored });
      options.onPainted?.(stored);
    } catch (error) {
      const reason = pictureFailureReason(error);
      publishMediaStatus(campaignId, "image", messageId, "failed", reason);
      recordImageFailure(campaignId, messageId, reason);
      throw error;
    }
  });
}

// The failure above is an ephemeral event, and the placeholder reads the
// request: left needed, a reload or a player who joins later would watch it
// spin forever. So the request is closed with the reason, which the passage
// shows in the placeholder's place. Asking again writes a fresh request.
function recordImageFailure(campaignId: string, messageId: string, reason: string) {
  const message = getCampaignMessage(messageId);
  if (!message?.imageRequest || message.generatedImage) {
    return;
  }
  if (!setMessageImageRequest(messageId, { ...message.imageRequest, needed: false, failed: reason })) {
    return;
  }
  const updated = getCampaignMessage(messageId);
  if (updated) {
    publishPersisted(campaignId, "message_updated", { message: updated });
  }
}

// The picture the AI DM attaches to its own narration. Nobody at the table
// asked for it, so on a server with no image backend running (setup's "no
// pictures", which still falls back to ComfyUI) it is dropped rather than
// failed: the request is marked not needed, which is what the placeholder
// reads, so it goes away now and stays away on a reload. A ComfyUI started
// later is picked up once the capability probe sees it.
export async function fulfillAutoImage(
  campaignId: string,
  messageId: string,
  request: ImageRequest,
  settings: StorySettings,
  options: MessageImageOptions = {},
) {
  if (await imagesAvailable(settings)) {
    return fulfillMessageImage(campaignId, messageId, request, settings, options);
  }
  closeImageRequest(campaignId, messageId, request);
}

// A request nobody will fulfil, marked not needed so its placeholder goes
// away now and stays away on a reload.
function closeImageRequest(campaignId: string, messageId: string, request: ImageRequest) {
  if (!setMessageImageRequest(messageId, { ...request, needed: false })) {
    return;
  }
  const updated = getCampaignMessage(messageId);
  if (updated) {
    publishPersisted(campaignId, "message_updated", { message: updated });
  }
}

// Couch mode paints every GM turn (docs/couch-mode-spec.md 2.4): the
// request a finished passage carries, or none when the passage is not a
// scene (a line or two, table talk) or the table cannot paint. Explicit
// pictures (the narrator's own, a person's) are not this: the narrator is
// not offered generate_image in couch mode (src/lib/dm/turn.ts dmTurnTools).
export function sceneShotRequest(campaign: Pick<Campaign, "settings" | "gameSettings">, content: string): ImageRequest | undefined {
  const { settings } = campaign;
  if (
    !campaign.gameSettings.couchMode ||
    !settings.imageGenerationEnabled ||
    !settings.autoImages ||
    !wantsSceneShot(content) ||
    !imageProducerReady(settings)
  ) {
    return undefined;
  }
  return {
    needed: true,
    // The passage's own frame, for a retry by hand; the job plans its own.
    prompt: heuristicShot(content, []).prompt,
    mode: settings.imageMode,
    backend: settings.imageBackend,
    // The picture fills the TV, which is wider than tall.
    aspect: "landscape",
    reason: "scene",
    characterIds: [],
  };
}

// One job name per table: when turns come faster than pictures, the newest
// passage's picture takes the place of one still waiting, and only the
// picture of the moment the table is in gets painted.
export function sceneShotLabel(campaignId: string): string {
  return `scene ${campaignId}`;
}

export async function fulfillSceneShot(campaignId: string, messageId: string, request: ImageRequest, settings: StorySettings) {
  await fulfillAutoImage(campaignId, messageId, request, settings, {
    label: sceneShotLabel(campaignId),
    // The passage as it stands when its turn comes, a reroll included.
    subject: (campaign) => {
      const message = getCampaignMessage(messageId);
      return planScenePicture(campaign, message?.content ?? request.prompt ?? "", message?.seq);
    },
    onPainted: (image) => keepEstablishingShot(campaignId, image),
  });
  // Settled without a picture or a failure: a newer passage's picture took
  // this one's place in the queue, so its placeholder must stop waiting.
  const message = getCampaignMessage(messageId);
  if (message?.imageRequest?.needed && !message.generatedImage) {
    closeImageRequest(campaignId, messageId, message.imageRequest);
  }
}

// generate_image, as an adjudication a person can invoke.
//
// The AI attaches its picture to the narration it wrote in the same turn. A
// human DM narrates first and decides to illustrate after, so this hangs the
// request on their latest passage: the picture belongs under the words it
// illustrates, and inventing a caption-only message to carry it would put a
// second DM passage in the transcript that nobody wrote.
export function handleGenerateImage(
  campaign: Campaign,
  rawArguments: string,
): ToolResult {
  if (!campaign.settings.imageGenerationEnabled) {
    return { error: "Image generation is off for this campaign.", retry: true };
  }
  let args: ImageToolArgs;
  try {
    args = imageToolArgsSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: illustrating needs a prompt.", retry: true };
  }
  const message = getLatestDmMessage(campaign.id);
  if (!message) {
    return { error: "Narrate something first; the picture hangs under the passage it draws.", retry: true };
  }
  const request: ImageRequest = {
    needed: true,
    prompt: args.prompt,
    mode: campaign.settings.imageMode,
    backend: campaign.settings.imageBackend,
    aspect: campaign.settings.aspect,
    reason: args.reason,
    characterIds: args.characterIds ?? [],
  };
  if (!setMessageImageRequest(message.id, request)) {
    return { error: "That passage is no longer there.", retry: true };
  }
  const updated = getCampaignMessage(message.id);
  if (updated) {
    publishPersisted(campaign.id, "message_updated", { message: updated });
  }
  // Backends without a producer side record the request and the existing
  // placeholder tells the table a picture is coming.
  if (imageProducerReady(campaign.settings)) {
    void fulfillMessageImage(campaign.id, message.id, request, campaign.settings);
  }
  return { ok: true, illustrating: message.id };
}

// A picture the DM uploaded, in the record shape the AI path writes. Maps
// and scene illustrations are stored as GeneratedImage whether a model or a
// person made them, so the consumers (the map panel, the transcript, the
// export) keep one code path. Nothing downstream reads width or height for
// these two kinds, and the upload route does not measure the file, so they
// are recorded as unknown (0) rather than guessed.
export function uploadedImageRecord(url: string, aspect: AspectPreset): GeneratedImage {
  return {
    id: crypto.randomUUID(),
    url,
    prompt: "",
    mode: "fast",
    aspect,
    width: 0,
    height: 0,
  };
}
