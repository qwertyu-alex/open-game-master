"use client";

import { useState } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { NarrationAudio } from "@/app/campaigns/[campaignId]/useNarrationAudio";
import type { BuildInfo } from "@/lib/build-info";
import { copyText } from "@/lib/clipboard";
import { tvDebugReport } from "@/components/couch/debug-logic";

// Puts the TV's debug report on the clipboard, to paste into an AI agent's
// prompt. The build is asked for on each press, so a server
// updated since the page loaded reports what it runs now.
export function CouchTvDebugButton({ state, narration }: { state: CampaignState; narration: NarrationAudio }) {
  const [said, setSaid] = useState<"" | "copied" | "failed">("");
  async function copy() {
    const build = await fetch("/api/about", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ build?: BuildInfo }>) : null))
      .then((about) => about?.build ?? null)
      .catch(() => null);
    const report = tvDebugReport({
      state,
      audio: {
        unlocked: narration.unlocked,
        muted: narration.muted,
        held: narration.held,
        playingMessageId: narration.playingMessageId,
        playbackFailure: narration.playbackFailure,
      },
      environment: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
        at: new Date().toISOString(),
      },
      build,
    });
    setSaid((await copyText(report)) ? "copied" : "failed");
    window.setTimeout(() => setSaid(""), 2000);
  }
  return (
    <button type="button" className="couch-tv-control" onClick={() => void copy()} aria-live="polite">
      {said === "copied" ? "Debug info copied" : said === "failed" ? "Could not copy" : "Copy debug info"}
    </button>
  );
}
