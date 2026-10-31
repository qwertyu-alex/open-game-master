import { getCampaignById, type Campaign } from "@/lib/db/campaigns";
import { getDatabase, nowIso } from "@/lib/db/core";
import { listLocations } from "@/lib/db/locations";
import { requestUtilityMessage } from "@/lib/dm/model";
import { stripReasoningArtifacts } from "@/lib/story-prompt";
import { jsonIn } from "./forge-logic";
import { getCouchForge } from "./store";
import { DECK_PLAN_SYSTEM, deckPlanInput, knownOnlyPlan, mergeKnown, readDeckPlan, type DeckPlan, type KnownPlace } from "./deck-plan-logic";

// The night's deck plan (src/lib/couch/deck-plan-logic.ts): one row per
// night in couch_deck_plans, made on first use like the forge's tables
// (src/lib/couch/store.ts). Drawn once, in the background, the first time a
// couch night with a story asks for its map; the map stands on what is
// recorded until then, and on that alone if the planner fails twice.

const ensured = new WeakSet<object>();
const PLAN_TIMEOUT_MS = 60_000;
const TRIES = 2;

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_deck_plans (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        plan_json TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    ensured.add(database);
  }
  return database;
}

declare global {
  var __odmDeckPlans: Set<string> | undefined;
}
const drawing = () => (globalThis.__odmDeckPlans ??= new Set<string>());

function knownPlaces(campaignId: string): KnownPlace[] {
  return listLocations(campaignId).map((place) => ({ name: place.name, connections: place.connections, visited: place.visited, createdAt: place.createdAt }));
}

function storedPlan(campaignId: string): { plan: DeckPlan | null; status: string } | null {
  const row = db().prepare(`SELECT plan_json, status FROM couch_deck_plans WHERE campaign_id = ?`).get(campaignId) as { plan_json: string; status: string } | undefined;
  if (!row) return null;
  let plan: DeckPlan | null = null;
  try {
    plan = row.plan_json ? (JSON.parse(row.plan_json) as DeckPlan) : null;
  } catch {
    plan = null;
  }
  return { plan, status: row.status };
}

function savePlan(campaignId: string, plan: DeckPlan | null, status: "ready" | "failed"): void {
  db()
    .prepare(
      `INSERT INTO couch_deck_plans (campaign_id, plan_json, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (campaign_id) DO UPDATE SET plan_json = excluded.plan_json, status = excluded.status, updated_at = excluded.updated_at`,
    )
    .run(campaignId, plan ? JSON.stringify(plan) : "", status, nowIso());
}

// The plan the map and the GM read now: the drawn one with everything
// recorded since merged in, or, until one is drawn, the recorded rooms
// alone. Asking for it starts the drawing once.
export function currentDeckPlan(campaign: Campaign): DeckPlan | null {
  if (!campaign.gameSettings.couchMode) return null;
  const known = knownPlaces(campaign.id);
  const stored = storedPlan(campaign.id);
  if (!stored) startDeckPlan(campaign);
  if (stored?.plan) return mergeKnown(stored.plan, known);
  return known.length ? knownOnlyPlan(known) : null;
}

function startDeckPlan(campaign: Campaign): void {
  const forge = getCouchForge(campaign.id);
  if (forge?.status !== "ready" || !forge.forge || drawing().has(campaign.id)) return;
  drawing().add(campaign.id);
  void drawDeckPlan(campaign.id).finally(() => drawing().delete(campaign.id));
}

async function drawDeckPlan(campaignId: string): Promise<void> {
  const campaign = getCampaignById(campaignId);
  const forge = getCouchForge(campaignId)?.forge;
  if (!campaign || !forge) return;
  const input = deckPlanInput({ setting: forge.scenario.setting, locations: forge.scenario.locations, known: knownPlaces(campaignId) });
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const { message, error } = await requestUtilityMessage(
      campaign.settings,
      [
        { role: "system", content: DECK_PLAN_SYSTEM },
        { role: "user", content: input },
      ],
      { meta: { task: "couch_deck_plan" }, timeoutMs: PLAN_TIMEOUT_MS, thinking: false, temperature: 0.4 },
    );
    const plan = error ? null : readDeckPlan(jsonIn(stripReasoningArtifacts(String(message?.content ?? ""))));
    if (plan) {
      savePlan(campaignId, plan, "ready");
      // Every screen hears the new map; imported here, at the end, so the
      // navigation module can read plans without a cycle at load.
      const fresh = getCampaignById(campaignId);
      if (fresh) (await import("./navigation")).publishCouchNavigation(fresh);
      return;
    }
  }
  savePlan(campaignId, null, "failed");
}
