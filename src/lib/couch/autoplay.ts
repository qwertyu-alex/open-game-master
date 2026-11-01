import { createHash } from "node:crypto";
import { mintSession } from "@/lib/auth";
import type { Campaign } from "@/lib/db/campaigns";
import { listOpenPendingRolls } from "@/lib/db/dm-turns";
import { listRecentMessages } from "@/lib/db/messages";
import { listSheets } from "@/lib/db/sheets";
import { deleteSession } from "@/lib/db/users";
import { requestDmMessage } from "@/lib/dm/model";
import { currentCoordination } from "@/lib/dm/coordination";
import { xCardRaised } from "@/lib/dm/safety";
import { getDmStatus } from "@/lib/dm/status";
import { tableBreakOn } from "@/lib/dm/table-break";
import { currentTableWait } from "@/lib/dm/table-wait";
import { couchFinaleView } from "@/lib/couch/finale";
import { couchObjective } from "@/lib/couch/pacing";
import { answerCouchTruce, latestCouchTruce } from "@/lib/couch/truce";
import {
  botRolls,
  botTruceAnswers,
  dueBots,
  nightPaused,
  parseMove,
  playerPrompt,
  TRUCE_ACCEPT_CHANCE,
  type AutoplaySheet,
  type AutoplayView,
} from "@/lib/couch/autoplay-logic";
import { arcTextTimeoutMs } from "@/lib/model-client";
import { stripReasoningArtifacts } from "@/lib/story-prompt";
import { bindUsageScope } from "@/lib/usage/scope";

// Stand-in players for testing a couch night from the TV: Play a turn (and
// Autoplay, which presses it after each passage is read) writes a move for
// every player the GM is waiting on, throws their rolls and answers their
// truces, so one person can run a whole night. The pure half is
// autoplay-logic.ts, shared with scripts/couch-autoplay.mjs.
//
// A developer's tool: on only in development or with COUCH_AUTOPLAY=1, and
// only for the host. The moves go through the real routes, signed in as
// each player for that one request, so a stand-in's move is held, refused
// and answered exactly as a phone's would be.

export function couchAutoplayAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.COUCH_AUTOPLAY === "1";
}

export type AutoplayResult = {
  // What the stand-ins did, one line each.
  played: string[];
  // What a route refused them, in its own words.
  refused: string[];
  // Why nothing was tried, when nothing was.
  idle: string;
};

declare global {
  var __odmCouchAutoplay: Map<string, Promise<AutoplayResult>> | undefined;
}
// One round at a time per night: a second press while the model writes
// waits for the same round rather than writing every move twice.
const rounds = (globalThis.__odmCouchAutoplay ??= new Map());

export function playCouchTurn(campaign: Campaign): Promise<AutoplayResult> {
  const running = rounds.get(campaign.id);
  if (running) return running;
  const round = bindUsageScope(() => runRound(campaign), { campaignId: campaign.id })().finally(() => rounds.delete(campaign.id));
  rounds.set(campaign.id, round);
  return round;
}

function viewOf(campaign: Campaign): AutoplayView {
  return {
    campaign: { status: campaign.status, floor: campaign.floor },
    dmStatus: getDmStatus(campaign.id),
    messages: listRecentMessages(campaign.id, 40),
    sheets: listSheets(campaign.id) as unknown as AutoplaySheet[],
    tableWait: currentTableWait(campaign.id),
    pendingRolls: listOpenPendingRolls(campaign.id),
    couchTruce: latestCouchTruce(campaign.id),
    couchObjective: couchObjective(campaign),
    couchFinale: couchFinaleView(campaign),
    tableBreak: tableBreakOn(campaign.id),
    safetyPause: xCardRaised(campaign.id) || null,
  };
}

async function runRound(campaign: Campaign): Promise<AutoplayResult> {
  const view = viewOf(campaign);
  const paused = nightPaused(view);
  if (paused) return { played: [], refused: [], idle: `Nothing to play: ${paused}.` };
  // A coordinated plan (opened from the host's full screens) refuses every
  // move until it is filled in or set aside, and no couch screen shows it.
  if (currentCoordination(campaign.id)) {
    return { played: [], refused: [], idle: "A coordinated plan is open: set it aside in Host controls first." };
  }
  // Every crew seat but the TV's own.
  const sheets = view.sheets.filter((sheet) => !sheet.isCompanion && sheet.userId !== campaign.leadUserId);
  const players = [...new Set(sheets.map((sheet) => sheet.userId))];
  const nameOf = (userId: string) => sheets.find((sheet) => sheet.userId === userId)?.name ?? "A player";
  const played: string[] = [];
  const refused: string[] = [];

  for (const roll of botRolls(view, players)) {
    const answer = await asPlayer(campaign.id, roll.userId, `/pending-rolls/${roll.id}`, { fallback: "digital" });
    if (answer.ok) played.push(`${nameOf(roll.userId)} rolled${roll.reason ? ` for ${roll.reason}` : ""}.`);
    else refused.push(`${nameOf(roll.userId)}'s roll: ${answer.error}`);
  }
  for (const { truce, member } of botTruceAnswers(view, sheets.map((sheet) => sheet.id))) {
    const userId = sheets.find((sheet) => sheet.id === member.characterId)!.userId;
    const accept = Math.random() < TRUCE_ACCEPT_CHANCE;
    const outcome = answerCouchTruce(campaign, userId, truce.id, accept);
    if (outcome.ok) played.push(`${member.name} ${accept ? "accepted" : "refused"} the truce.`);
    else refused.push(`${member.name}'s truce answer: ${outcome.error}`);
  }
  // A roll or a truce answer may have woken the GM: its passage comes first.
  if (played.length || refused.length) return { played, refused, idle: "" };

  const due = dueBots(view, players);
  if (!due.length) {
    return { played, refused, idle: view.dmStatus !== "idle" ? "The GM is still writing." : "Nobody is waiting to move." };
  }
  await Promise.all(
    due.map(async (userId) => {
      const sheet = sheets.find((entry) => entry.userId === userId)!;
      const move = await writeMove(campaign, view, sheet);
      if (!move) return refused.push(`${sheet.name}: the model gave no move.`);
      const answer = await asPlayer(campaign.id, userId, "/actions", { content: move.content, kind: move.kind, characterId: sheet.id });
      if (answer.ok) played.push(`${sheet.name} ${move.kind === "say" ? "says" : "does"}: ${move.content}`);
      else refused.push(`${sheet.name}: ${answer.error}`);
    }),
  );
  return { played, refused, idle: "" };
}

async function writeMove(campaign: Campaign, view: AutoplayView, sheet: AutoplaySheet) {
  const { message, error } = await requestDmMessage(
    campaign.settings,
    [
      { role: "system", content: "You play one character at a tabletop game night. Answer with one line only." },
      { role: "user", content: playerPrompt({ view, sheet }) },
    ],
    {
      meta: { task: "couch_autoplay" },
      timeoutMs: arcTextTimeoutMs(),
      thinking: false,
      maxOutputTokens: 300,
      harness: { campaignId: campaign.id },
    },
  );
  if (error) {
    console.warn(`[couch] autoplay move for ${sheet.name} failed (${error.status}).`);
    return null;
  }
  return parseMove(stripReasoningArtifacts(String(message?.content ?? "")));
}

// The same request the player's phone makes, on the server's own loopback
// (as the harness bridge reaches /api/mcp), under a session that lives for
// this one request.
async function asPlayer(campaignId: string, userId: string, route: string, body: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { token } = mintSession(userId);
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || "3005"}/api/campaigns/${campaignId}${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error || `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    deleteSession(createHash("sha256").update(token).digest("hex"));
  }
}
