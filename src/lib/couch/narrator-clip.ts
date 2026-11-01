import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrivateBackendHost } from "@/lib/backend-host";
import { PaidAiRefusedError, paidAiAllowedNow } from "@/lib/shared-host";
import { synthesizeSpeech, ttsBackend } from "@/lib/tts-backend";
import { recordUsage } from "@/lib/usage/ledger";

// One clip of the narrator reading fixed words on the TV, outside the
// story's own narration: the introductions (src/lib/couch/intro.ts) and
// the closing (src/lib/couch/finale-voice.ts). Written once under
// public/generated-audio/<campaign>/<name> and served from there; one
// render per clip however many ask at once.

declare global {
  var __odmCouchClipRenders: Map<string, Promise<string>> | undefined;
}

// Resolves to the clip's path segments under generated-audio.
export function renderNarratorClip(campaignId: string, name: string, text: string, voice: string, speed: number): Promise<string[]> {
  const segments = [campaignId, name];
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated-audio", campaignId, name);
  if (existsSync(file)) {
    return Promise.resolve(segments);
  }
  const renders = (globalThis.__odmCouchClipRenders ??= new Map());
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
    const audio = await synthesizeSpeech(text, voice, speed, backend);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, audio);
    recordUsage({ kind: "tts", role: "narration", backend: backend.provider, model: backend.model, paid, units: text.length });
    return file;
  })().finally(() => renders.delete(file));
  renders.set(file, render);
  return render.then(() => segments);
}
