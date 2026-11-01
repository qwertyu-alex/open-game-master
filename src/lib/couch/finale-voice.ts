import { createHash } from "node:crypto";
import { finaleSpeechTexts, type CouchFinale } from "@/lib/couch/finale-logic";
import { renderNarratorClip } from "@/lib/couch/narrator-clip";
import type { Campaign } from "@/lib/db/campaigns";
import { enqueueMediaJob } from "@/lib/media-queue";
import { ttsBackend } from "@/lib/tts-backend";

// The closing read aloud on the TV: one clip per step of the reveal
// (finaleSpeech in src/lib/couch/finale-logic.ts), in the narrator's voice,
// as the introductions are (src/lib/couch/intro.ts). Rendered ahead as soon
// as the closing is written, while the room is still looking at "The end";
// a step asked for before its clip exists is rendered then. The route is
// /api/campaigns/[id]/couch/finale.

type VoicePlan = { texts: string[]; voice: string; speed: number; key: string };

function voicePlan(campaign: Pick<Campaign, "gameSettings">, finale: CouchFinale): VoicePlan | null {
  if (!campaign.gameSettings.ttsEnabled || ttsBackend().provider === "off") return null;
  const texts = finaleSpeechTexts(finale);
  const voice = campaign.gameSettings.ttsVoice;
  const speed = campaign.gameSettings.ttsSpeed ?? 1;
  const key = createHash("sha256").update(JSON.stringify([texts, voice, speed])).digest("hex").slice(0, 16);
  return { texts, voice, speed, key };
}

// What the TV puts on each clip's address, so a rewritten closing or a new
// narrator voice is never served from an old clip. "" when there is no voice.
export function finaleVoiceKey(campaign: Pick<Campaign, "gameSettings">, finale: CouchFinale): string {
  return voicePlan(campaign, finale)?.key ?? "";
}

export class FinaleClipMissingError extends Error {
  constructor() {
    super("No such step of the closing to read.");
    this.name = "FinaleClipMissingError";
  }
}

export function renderFinaleClip(campaign: Campaign, finale: CouchFinale, step: number): Promise<string[]> {
  const plan = voicePlan(campaign, finale);
  const text = plan?.texts[step];
  if (!plan || !text) return Promise.reject(new FinaleClipMissingError());
  return renderNarratorClip(campaign.id, `finale-${plan.key}-${step}.mp3`, text, plan.voice, plan.speed);
}

// Every clip in order on the night's narration lane, the end card first.
// One that fails is left for the TV's own request, and the TV holds that
// step for its reading time if it fails there too.
export function prepareFinaleVoice(campaign: Campaign, finale: CouchFinale): void {
  const plan = voicePlan(campaign, finale);
  if (!plan) return;
  void enqueueMediaJob(
    `couch finale ${campaign.id} ${plan.key}`,
    async () => {
      for (let step = 0; step < plan.texts.length; step += 1) {
        if (!plan.texts[step]) continue;
        try {
          await renderFinaleClip(campaign, finale, step);
        } catch (error) {
          console.warn(`[couch] closing step ${step} of ${campaign.id} was not read ahead:`, error instanceof Error ? error.message : error);
          return;
        }
      }
    },
    `tts:${campaign.id}`,
  );
}
