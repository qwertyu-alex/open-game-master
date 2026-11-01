"use client";

import { useEffect, useState } from "react";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { speakerAt, type NarrationCue } from "@/lib/narration-cues-logic";
import type { SpeakingFace } from "./couch-logic";
import { CouchFace } from "./CouchParts";

// Who is talking on the TV right now: the cue under the narration's clock
// (src/lib/narration-cues-logic.ts), by name; null while the narrator
// reads, or nothing plays. Polled like the subtitles, on timers so a
// background tab still turns; the screen re-renders only when it changes.
const POLL_MS = 150;

export function useSpeakerNow(narration: Pick<NarrationAudio, "clock" | "playingMessageId">, cues: Record<string, NarrationCue[]>): string | null {
  const [speaker, setSpeaker] = useState<string | null>(null);
  const playing = narration.playingMessageId;
  const current = playing ? cues[playing] : undefined;
  const { clock } = narration;
  useEffect(() => {
    if (!playing || !current?.length) {
      return;
    }
    const timer = window.setInterval(() => {
      const at = clock();
      setSpeaker(at && at.messageId === playing ? speakerAt(current, at.seconds) : null);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [playing, current, clock]);
  return playing && current?.length ? speaker : null;
}

// The speaker's face and name over the subtitles, while their line is heard.
// Key it by name, so a new speaker fades in rather than swapping in place.
export function CouchTvSpeaker({ face }: { face: SpeakingFace }) {
  return (
    <div className="couch-tv-speaker" data-crew={face.sheetId ? "" : undefined}>
      <CouchFace src={face.portraitUrl || null} name={face.name} />
      <strong>{face.name}</strong>
    </div>
  );
}
