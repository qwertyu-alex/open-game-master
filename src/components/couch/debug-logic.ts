import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { BuildInfo } from "@/lib/build-info";

// The TV's debug report, for pasting into an AI agent's prompt. The agent
// can read the database and the server, so the report is references (ids,
// the build, the server address) plus what only this browser knows: what it
// thinks the GM is doing, what it is playing, and why sound might be stuck.

export type TvDebugAudio = {
  unlocked: boolean;
  muted: boolean;
  held: number;
  playingMessageId: string | null;
  playbackFailure: string | null;
  // What the room hears under the voice: the server's cue is in the
  // database, so only whether this browser plays it.
  ambience?: { muted: boolean; installed: boolean; bed: string | null; music: string | null; blocked: boolean };
};

export type TvDebugEnvironment = {
  url: string;
  userAgent: string;
  viewport: string;
  at: string;
};

export function tvDebugReport({
  state,
  audio,
  environment,
  build,
}: {
  state: CampaignState;
  audio: TvDebugAudio;
  environment: TvDebugEnvironment;
  build: BuildInfo | null;
}): string {
  const newest = state.messages.at(-1);
  return [
    "Couch TV debug report (look the ids up in the database)",
    `campaignId: ${state.campaign?.id ?? "none"}`,
    `userId: ${state.me?.id ?? "none"}`,
    `newestMessage: ${newest ? `${newest.id} (seq ${newest.seq})` : "none"}`,
    `playingMessage: ${audio.playingMessageId ?? "none"}`,
    `build: ${build ? `${build.label} ${build.commit || "unknown commit"}${build.dirty ? " dirty" : ""}` : "unknown"}`,
    `url: ${environment.url}`,
    ...(state.answeredBy ? [`answeredBy: ${state.answeredBy}`] : []),
    `at: ${environment.at}`,
    `client: gmStatus=${state.dmStatus}${state.dmPrivate ? "(private)" : ""} sound=${audio.unlocked ? "unlocked" : "locked"}${audio.muted ? ",muted" : ""} held=${audio.held}` +
      `${audio.playbackFailure ? ` playbackFailure=${audio.playbackFailure}` : ""}${state.error ? ` streamError=${JSON.stringify(state.error)}` : ""}`,
    ...(audio.ambience
      ? [
          `ambience: ${audio.ambience.installed ? "installed" : "no library"}${audio.ambience.muted ? ",muted" : ""}` +
            `${audio.ambience.blocked ? ",blocked" : ""} bed=${audio.ambience.bed ?? "none"} music=${audio.ambience.music ?? "none"}`,
        ]
      : []),
    `browser: ${environment.viewport} ${environment.userAgent}`,
  ].join("\n");
}
