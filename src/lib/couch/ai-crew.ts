import { couchRoundRunning, playCouchTurn } from "@/lib/couch/autoplay";
import { aiCrewCards, isAiCrewUserId } from "@/lib/couch/ai-crew-logic";
import { claimCrew } from "@/lib/couch/play";
import { addAiCrewMember, getCouchForge, listCouchCrew, removeAiCrewMember } from "@/lib/couch/store";
import { getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { listSheets } from "@/lib/db/sheets";
import { subscribe } from "@/lib/events";

// AI crewmates (docs/couch-mode-spec.md 2.14): a night started with fewer
// people than its story's crew has the AI play the rest. Each one is an
// ordinary crew seat: a card claimed by a member nobody can sign in as
// (src/lib/couch/store.ts addAiCrewMember), so the crew strip, the agendas,
// the GM's party, the table's wait, the act breaks and the deaths treat it
// as they treat a phone's. The phones choose first; the AI takes the cards
// still free when the host begins. Its moves, rolls and truce answers are
// the stand-in players' round (src/lib/couch/autoplay.ts) kept to its seats,
// with a crewmate's prompt, played on the server whenever the night moves.
// The pure half is ai-crew-logic.ts.

export type SeatOutcome = { ok: true; seated: string[] } | { ok: false; status: number; error: string };

// The AI takes the free cards, as many as the night has AI crewmates, when
// the host begins (POST /api/campaigns/[id]/couch/ai-crew, before the TV's
// Begin). Asked twice, it seats nobody the second time. Synchronous, so two
// presses cannot both take the same card.
export function seatAiCrew(campaign: Campaign): SeatOutcome {
  const forge = getCouchForge(campaign.id);
  if (!campaign.gameSettings.couchMode || !forge) {
    return { ok: false, status: 404, error: "This table has no crew." };
  }
  if (forge.status !== "ready") {
    return { ok: false, status: 409, error: "The crew is still being written." };
  }
  const cards = listCouchCrew(campaign.id);
  const already = cards.filter((card) => isAiCrewUserId(card.claimedBy)).length;
  const seated: string[] = [];
  for (const card of aiCrewCards(cards, forge.aiCrew - already)) {
    const userId = addAiCrewMember(campaign.id, card.name);
    const outcome = claimCrew(campaign, userId, card.id);
    if (!outcome.ok) {
      removeAiCrewMember(campaign.id, userId);
      return { ok: false, status: outcome.status, error: `The AI could not take ${card.name}: ${outcome.error}` };
    }
    seated.push(card.name);
  }
  driveAiCrew(campaign.id);
  return { ok: true, seated };
}

// The AI crew's living seats at the table.
function aiSeats(campaignId: string): string[] {
  return [
    ...new Set(listSheets(campaignId).filter((sheet) => isAiCrewUserId(sheet.userId) && !sheet.isCompanion && !sheet.deathSaves?.dead).map((sheet) => sheet.userId)),
  ];
}

// ---- the driver ----
//
// One per night with an AI crew, in this process: it listens on the night's
// event bus and, once the night has been quiet for a moment (the GM's
// passage written, a roll asked for, a truce offered), plays a round for the
// AI seats. A slow beat behind it catches a wake it missed. The round itself
// decides who is due, so a wake with nothing to do costs one read. After a
// restart nothing listens until a screen reads the night again
// (GET /api/campaigns/[id] calls ensureAiCrew).

type Driver = {
  // The module evaluation that made it: in development a hot reload makes
  // a new one, and ensureAiCrew swaps a driver still running the old code.
  version: string;
  unsubscribe: () => void;
  beat: ReturnType<typeof setInterval>;
  timer?: ReturnType<typeof setTimeout>;
  firstWake?: number;
  // The newest GM passage each AI seat has answered, and the model's misses
  // per seat and passage (autoplay.ts RoundOptions).
  handled: Record<string, number>;
  misses: Record<string, number>;
};

declare global {
  var __odmCouchAiCrew: Map<string, Driver> | undefined;
}

const drivers = () => (globalThis.__odmCouchAiCrew ??= new Map());
const VERSION = crypto.randomUUID();

// Quiet before a round: the GM's passage streams as many events, and the
// round waits for the last. Never longer than the cap, so a night that
// never falls quiet still gets its AI crew's moves.
const QUIET_MS = 1500;
const QUIET_CAP_MS = 6000;
const BEAT_MS = 15_000;
// The events that never call for a move.
const IGNORED = new Set(["presence", "voice_roster"]);

// Starts the night's driver if it has AI crew and none runs here.
export function ensureAiCrew(campaign: Pick<Campaign, "id" | "status" | "gameSettings">): void {
  if (!campaign.gameSettings.couchMode || campaign.status === "ended") {
    return;
  }
  const running = drivers().get(campaign.id);
  if (running?.version === VERSION) {
    return;
  }
  if (running) stop(campaign.id);
  if (!aiSeats(campaign.id).length) {
    return;
  }
  driveAiCrew(campaign.id);
}

function driveAiCrew(campaignId: string): void {
  if (drivers().has(campaignId)) {
    wake(campaignId);
    return;
  }
  const driver: Driver = {
    version: VERSION,
    unsubscribe: subscribe(campaignId, (chunk) => {
      const type = /^event: (\S+)/m.exec(chunk)?.[1] ?? "";
      if (!IGNORED.has(type)) wake(campaignId);
    }),
    beat: setInterval(() => wake(campaignId), BEAT_MS),
    handled: {},
    misses: {},
  };
  driver.beat.unref?.();
  drivers().set(campaignId, driver);
  wake(campaignId);
}

function stop(campaignId: string): void {
  const driver = drivers().get(campaignId);
  if (!driver) return;
  driver.unsubscribe();
  clearInterval(driver.beat);
  if (driver.timer) clearTimeout(driver.timer);
  drivers().delete(campaignId);
}

function wake(campaignId: string): void {
  const driver = drivers().get(campaignId);
  if (!driver) return;
  const now = Date.now();
  driver.firstWake ??= now;
  if (driver.timer) clearTimeout(driver.timer);
  const wait = Math.max(0, Math.min(QUIET_MS, driver.firstWake + QUIET_CAP_MS - now));
  driver.timer = setTimeout(() => {
    driver.timer = undefined;
    driver.firstWake = undefined;
    void play(campaignId);
  }, wait);
  driver.timer.unref?.();
}

async function play(campaignId: string): Promise<void> {
  const driver = drivers().get(campaignId);
  const campaign = getCampaignById(campaignId);
  if (!driver || !campaign || !campaign.gameSettings.couchMode || campaign.status === "ended") {
    stop(campaignId);
    return;
  }
  if (campaign.status !== "active") {
    return;
  }
  const seats = aiSeats(campaignId);
  if (!seats.length) {
    // The whole AI crew is dead: nothing of theirs is left to play.
    stop(campaignId);
    return;
  }
  // A round already being played (the host's Play a turn) finishes first;
  // the events it raises wake this one again.
  if (couchRoundRunning(campaignId)) {
    return;
  }
  try {
    const result = await playCouchTurn(campaign, { seats, handled: driver.handled, misses: driver.misses, crewmate: true });
    for (const line of result.refused) console.warn(`[couch] AI crewmate refused: ${line}`);
    // A move the model failed to write is asked again soon, not at the
    // next slow beat: nothing else will wake the night meanwhile.
    if (result.refused.some((line) => line.endsWith("the model gave no move."))) setTimeout(() => wake(campaignId), 4000).unref?.();
  } catch (error) {
    console.error(`[couch] AI crew round failed for campaign ${campaignId}:`, error);
  }
}
