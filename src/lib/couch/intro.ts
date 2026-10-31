import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrivateBackendHost } from "@/lib/backend-host";
import { forgedMember, introTexts, type IntroCrew } from "@/lib/couch/intro-logic";
import { getCouchForge, listCouchCrew } from "@/lib/couch/store";
import { getCampaignById } from "@/lib/db/campaigns";
import { enqueueMediaJob } from "@/lib/media-queue";
import { PaidAiRefusedError, paidAiAllowedNow } from "@/lib/shared-host";
import { synthesizeSpeech, ttsBackend } from "@/lib/tts-backend";
import { recordUsage } from "@/lib/usage/ledger";

// The TV's introductions read aloud (docs/couch-mode-spec.md 2.6): one clip
// per step, the briefing and then each crew member, in the narrator's voice.
// Rendered once the forge is ready, while the room is still scanning the QR
// code, so the first clip is on disk when the TV asks for it; a step asked
// for before its clip exists is rendered then. The words are
// src/lib/couch/intro-logic.ts; the route is
// /api/campaigns/[id]/couch/intro.

type IntroPlan = { texts: string[]; voice: string; speed: number; key: string };

// The words of every step and the voice they are read in, keyed together:
// a reforge, or a new narrator voice, is a new set of clips.
function introPlan(campaignId: string): IntroPlan | null {
  const forge = getCouchForge(campaignId);
  const campaign = getCampaignById(campaignId);
  if (!campaign || forge?.status !== "ready" || !forge.forge) {
    return null;
  }
  const crew: IntroCrew[] = listCouchCrew(campaignId).map((card) => {
    const member = forgedMember(forge.forge!.crew, card);
    return {
      name: card.name,
      crewRole: card.crewRole,
      backstory: member?.backstory || card.backstory,
      personality: member?.personality ?? "",
      signatureItem: member?.signatureItem ?? "",
      gender: card.gender,
    };
  });
  const texts = introTexts(forge.forge.scenario, crew);
  const voice = campaign.gameSettings.ttsVoice;
  const speed = campaign.gameSettings.ttsSpeed ?? 1;
  const key = createHash("sha256").update(JSON.stringify([texts, voice, speed])).digest("hex").slice(0, 16);
  return { texts, voice, speed, key };
}

export function couchIntroKey(campaignId: string): string {
  return introPlan(campaignId)?.key ?? "";
}

function clipName(key: string, step: number): string {
  return `intro-${key}-${step}.mp3`;
}

function clipPath(campaignId: string, name: string): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated-audio", campaignId, name);
}

declare global {
  var __odmCouchIntroRenders: Map<string, Promise<string>> | undefined;
}

// Resolves to the clip's path under generated-audio, rendering it first if
// it is not on disk; one render per clip however many ask at once.
export function renderIntroClip(campaignId: string, step: number): Promise<string[]> {
  const plan = introPlan(campaignId);
  const text = plan?.texts[step];
  if (!plan || !text) {
    return Promise.reject(new IntroMissingError());
  }
  const name = clipName(plan.key, step);
  const segments = [campaignId, name];
  const file = clipPath(campaignId, name);
  if (existsSync(file)) {
    return Promise.resolve(segments);
  }
  const renders = (globalThis.__odmCouchIntroRenders ??= new Map());
  const running = renders.get(file);
  if (running) {
    return running.then(() => segments);
  }
  const render = (async () => {
    const backend = ttsBackend();
    // As the narration's own clips are (src/lib/tts.ts): ElevenLabs bills
    // the host's account for every character, and the shared-host policy
    // answers before one is read.
    const paid = backend.provider === "elevenlabs" || (backend.provider === "openai" && backend.apiKey !== "" && !isPrivateBackendHost(backend.v1));
    if (paid && !paidAiAllowedNow()) {
      throw new PaidAiRefusedError("speech");
    }
    const audio = await synthesizeSpeech(text, plan.voice, plan.speed, backend);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, audio);
    recordUsage({ kind: "tts", role: "narration", backend: backend.provider, model: backend.model, paid, units: text.length });
    return file;
  })().finally(() => renders.delete(file));
  renders.set(file, render);
  return render.then(() => segments);
}

export class IntroMissingError extends Error {
  constructor() {
    super("No such introduction.");
    this.name = "IntroMissingError";
  }
}

// Every clip in order, on the night's narration lane: the briefing first,
// since it plays first. A clip that fails is left for the TV's own request
// to try again, and the TV reads that step on a timer if it fails there too.
export function prepareIntroAudio(campaignId: string): void {
  const campaign = getCampaignById(campaignId);
  const plan = introPlan(campaignId);
  if (!campaign?.gameSettings.ttsEnabled || !plan || ttsBackend().provider === "off") {
    return;
  }
  void enqueueMediaJob(
    `couch intro ${campaignId} ${plan.key}`,
    async () => {
      for (let step = 0; step < plan.texts.length; step += 1) {
        try {
          await renderIntroClip(campaignId, step);
        } catch (error) {
          console.warn(`[couch] introduction ${step} of ${campaignId} was not read ahead:`, error instanceof Error ? error.message : error);
          return;
        }
      }
    },
    `tts:${campaignId}`,
  );
}
