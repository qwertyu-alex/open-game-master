"use client";

import { useEffect, useRef } from "react";
import { useNarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import { useAmbienceAudio } from "@/app/campaigns/[campaignId]/useAmbienceAudio";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { COUCH_ROLL_PARTS, couchRollVoiceId } from "@/lib/couch/roll-feedback-logic";
import { COUCH_RULES_BRIEFING } from "@/lib/couch/rules-logic";

// The table's two audio channels and how they meet. Narration is the DM's
// voice; ambience is the room. The room drops behind the voice while a
// passage is being read and comes back when it stops. Nothing else in the
// app knows how to do this, which is why the two hooks are joined here
// rather than inside either one.
export function useTableAudio(state: CampaignState) {
  // A table break holds the DM's voice until Resume (useNarrationAudio.ts).
  // The room keeps its bed: a quiet table under a break is no worse for it.
  const narration = useNarrationAudio(state.tableBreak !== null);
  const ambience = useAmbienceAudio(
    state.ambience,
    state.ambienceSting,
    Boolean(state.campaign?.gameSettings?.ambienceEnabled),
  );
  const duckAmbience = ambience.setDucked;
  useEffect(() => {
    duckAmbience(Boolean(narration.playingMessageId));
  }, [duckAmbience, narration.playingMessageId]);

  // Only tts_ready events newer than the seq present when the snapshot first
  // loaded autoplay; the backlog stays silent (replay buttons cover history).
  // Each narration is handed over exactly once: unrelated events (new chat
  // messages) must never re-trigger and restart playback.
  const mountSeqRef = useRef<number | null>(null);
  const handedTtsRef = useRef<string | null>(null);
  const { latestTts, loading, lastSeq } = state;
  const answers = state.couchAnswers;
  const answersAudio = answers ? state.narrationAudio[answers.id] : undefined;
  const { onTtsReady } = narration;
  useEffect(() => {
    if (mountSeqRef.current === null) {
      if (!loading) {
        mountSeqRef.current = lastSeq;
      }
      return;
    }
    // A cached GM clip can finish in the same update as the answer readout.
    // Offer the completed batch first even if latestTts already names the
    // GM; useNarrationAudio deduplicates a batch already heard as a stream.
    if (answers?.live && answersAudio) {
      onTtsReady(answers.id, answersAudio, true, true);
    }
    // A tool can resolve several dice before React paints. Recover every
    // clip from its durable ready event instead of hearing only latestTts.
    // No roll feedback is loaded in a snapshot, so old dice stay silent.
    for (const feedback of state.couchRolls) {
      for (const part of COUCH_ROLL_PARTS) {
        const id = couchRollVoiceId(feedback.roll.id, part);
        const url = state.narrationAudio[id] ?? (latestTts?.messageId === id ? latestTts.url : undefined);
        if (url) onTtsReady(id, url, true, part === "announce");
      }
    }
    if (latestTts && latestTts.messageId !== handedTtsRef.current) {
      handedTtsRef.current = latestTts.messageId;
      // A stream is only ever offered live; a finished file is live when it
      // is newer than the snapshot.
      onTtsReady(latestTts.messageId, latestTts.url, Boolean(latestTts.live) || latestTts.seq > mountSeqRef.current,
        Boolean((answers?.live && answers.id === latestTts.messageId) || state.messages.some((message) =>
          message.id === latestTts.messageId && message.content === COUCH_RULES_BRIEFING,
        )));
    }
  }, [latestTts, onTtsReady, loading, lastSeq, answers, answersAudio, state.couchRolls, state.narrationAudio, state.messages]);

  return { narration, ambience };
}
