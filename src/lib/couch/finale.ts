import { getCouchForge, listCouchCrew } from "@/lib/couch/store";
import {
  finaleFacts,
  finaleSystemPrompt,
  finaleTranscript,
  finaleUserPrompt,
  mergeFinale,
  readFinaleReply,
  withFinalePictures,
  type CouchFinale,
  type CouchFinaleView,
  type FinaleFacts,
  type FinaleProse,
  type FinaleStatus,
} from "@/lib/couch/finale-logic";
import { finaleVoiceKey, prepareFinaleVoice } from "@/lib/couch/finale-voice";
import { getCampaignById, setCampaignStatus, type Campaign } from "@/lib/db/campaigns";
import { getDatabase, nowIso, parseJson } from "@/lib/db/core";
import { listAllMessages, type CampaignMessage } from "@/lib/db/messages";
import { listRollsSince } from "@/lib/db/rolls";
import { listSheets } from "@/lib/db/sheets";
import { requestDmMessage } from "@/lib/dm/model";
import { withLanguage } from "@/lib/dm/table-language-logic";
import { stripToolText, withoutRollMarkers } from "@/lib/dm/tool-text";
import { publishPersisted } from "@/lib/events";
import { arcTextTimeoutMs } from "@/lib/model-client";
import { stripReasoningArtifacts } from "@/lib/story-prompt";
import { bindUsageScope } from "@/lib/usage/scope";

// The rim of the night's closing (src/lib/couch/finale-logic.ts): the GM's
// end_night, which waits for its closing passage before it ends the night;
// the host's end, which ends it at once; the one model call that writes the
// closing; and what every screen reads.
//
// couch_finales: one row per couch campaign whose night has ended or is
// ending, made here on first use like couch_forges (src/lib/couch/store.ts),
// with the closing once it is written. Everything in it is for every seat:
// the agendas and the hidden role are secret only until the night ends.

type FinaleRow = {
  campaign_id: string;
  status: string;
  ended_by: string;
  ending: string;
  finale_json: string;
  ended_at: string;
};

const ensured = new WeakSet<object>();

function db() {
  const database = getDatabase();
  if (!ensured.has(database)) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS couch_finales (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        ended_by TEXT NOT NULL DEFAULT 'gm',
        ending TEXT NOT NULL DEFAULT '',
        finale_json TEXT NOT NULL DEFAULT '',
        ended_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    ensured.add(database);
  }
  return database;
}

type Row = { status: FinaleStatus; endedBy: "gm" | "host"; ending: string; finale: CouchFinale | null; endedAt: string };

function getRow(campaignId: string): Row | null {
  const row = db().prepare(`SELECT * FROM couch_finales WHERE campaign_id = ?`).get(campaignId) as FinaleRow | undefined;
  if (!row) return null;
  return {
    status: row.status === "ready" || row.status === "writing" ? row.status : "pending",
    endedBy: row.ended_by === "host" ? "host" : "gm",
    ending: row.ending,
    finale: parseJson<CouchFinale | null>(row.finale_json || "null", null),
    endedAt: row.ended_at,
  };
}

function writeRow(campaignId: string, row: Omit<Row, "finale"> & { finale?: CouchFinale | null }): void {
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO couch_finales (campaign_id, status, ended_by, ending, finale_json, ended_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (campaign_id) DO UPDATE SET status = excluded.status, ended_by = excluded.ended_by, ending = excluded.ending,
         finale_json = excluded.finale_json, ended_at = excluded.ended_at, updated_at = excluded.updated_at`,
    )
    .run(campaignId, row.status, row.endedBy, row.ending.slice(0, 600), row.finale ? JSON.stringify(row.finale) : "", row.endedAt, now);
}

declare global {
  var __odmCouchFinales: Set<string> | undefined;
}
const writing = (): Set<string> => (globalThis.__odmCouchFinales ??= new Set<string>());

// ---- ending the night ----

// end_night: the ending is noted, and the night ends once this turn's
// closing passage is on every screen (settleCouchEnding), so the room hears
// the ending before the closing covers it. Asking twice keeps the newest
// line; a night already over changes nothing.
export function requestCouchEnding(campaign: Campaign, line: string): boolean {
  const row = getRow(campaign.id);
  if (row && row.status !== "pending") return false;
  writeRow(campaign.id, { status: "pending", endedBy: "gm", ending: line, endedAt: nowIso() });
  return true;
}

// After a couch turn's narration: the ending the GM asked for this turn
// ends the night. True when it did.
export function settleCouchEnding(campaign: Campaign): boolean {
  const row = getRow(campaign.id);
  if (!row || row.status !== "pending" || campaign.status !== "active") return false;
  setCampaignStatus(campaign.id, "ended");
  publishPersisted(campaign.id, "campaign_updated", { status: "ended" });
  beginCouchFinale(campaign.id, "gm", row.ending);
  return true;
}

// The night is over (by the GM's end_night, or the host's end from the
// campaign route, which has set the status already): the closing is written.
export function beginCouchFinale(campaignId: string, endedBy: "gm" | "host", ending = ""): void {
  const row = getRow(campaignId);
  if (row?.status === "ready" || (row?.status === "writing" && writing().has(campaignId))) return;
  // A host ending a night the GM had already called keeps the GM's words.
  const kept = row?.status === "pending" ? { endedBy: row.endedBy, ending: row.ending } : { endedBy, ending };
  writeRow(campaignId, { status: "writing", ...kept, endedAt: row?.endedAt || nowIso() });
  publishFinale(campaignId);
  startWriting(campaignId);
}

function startWriting(campaignId: string): void {
  if (writing().has(campaignId)) return;
  writing().add(campaignId);
  const job = bindUsageScope(() => writeFinale(campaignId), { campaignId });
  void job()
    .catch((error) => {
      console.error(`[couch] closing failed for campaign ${campaignId}:`, error);
      // The facts alone still close the night.
      const facts = gatherFacts(campaignId);
      if (facts) finish(campaignId, mergeFinale(facts.facts, null));
    })
    .finally(() => writing().delete(campaignId));
}

function finish(campaignId: string, finale: CouchFinale): void {
  const row = getRow(campaignId);
  writeRow(campaignId, { status: "ready", endedBy: row?.endedBy ?? "gm", ending: row?.ending ?? "", endedAt: row?.endedAt ?? nowIso(), finale });
  // The narrator's clips, while the room is still on "The end".
  const campaign = getCampaignById(campaignId);
  if (campaign) prepareFinaleVoice(campaign, finale);
  publishFinale(campaignId);
}

function publishFinale(campaignId: string): void {
  publishPersisted(campaignId, "couch_finale", { finale: viewOf(campaignId, getRow(campaignId)) });
}

function viewOf(campaignId: string, row: Row | null): CouchFinaleView | null {
  if (!row || row.status === "pending") return null;
  const finale = row.status === "ready" ? readyFinale(campaignId, row) : null;
  if (!finale) return { status: "writing" };
  const campaign = getCampaignById(campaignId);
  return { status: "ready", finale, voice: campaign ? finaleVoiceKey(campaign, finale) : "" };
}

// The written closing, with its pictures: one stored before the closing
// had pictures is given the night's now, and kept.
function readyFinale(campaignId: string, row: Row | null): CouchFinale | null {
  if (row?.status !== "ready" || !row.finale) return null;
  if (row.finale.pictures) return row.finale;
  const finale = withFinalePictures(row.finale, nightPictures(listAllMessages(campaignId)));
  writeRow(campaignId, { ...row, finale });
  return finale;
}

export function readyCouchFinale(campaignId: string): CouchFinale | null {
  return readyFinale(campaignId, getRow(campaignId));
}

// The night's scene pictures, oldest first: the GM passages' own, wide
// ones only (a square is an insert of a find, not the scene), each once.
function pictureOf(message: CampaignMessage): string | null {
  const image = message.authorType === "dm" ? message.generatedImage : undefined;
  if (!image?.url || image.aspect === "square" || image.aspect === "portrait") return null;
  return image.url;
}

function nightPictures(messages: readonly CampaignMessage[]): string[] {
  return [...new Set(messages.map(pictureOf).filter((url): url is string => Boolean(url)))];
}

// What a seat's snapshot carries. A night that ended without a closing (the
// host ended it before this shipped, or a restart cut the writing off) has
// one written now.
export function couchFinaleView(campaign: Campaign): CouchFinaleView | null {
  if (!campaign.gameSettings.couchMode) return null;
  const row = getRow(campaign.id);
  if (campaign.status !== "ended") return viewOf(campaign.id, row?.status === "pending" ? null : row);
  if (!row || row.status === "pending") {
    if (getCouchForge(campaign.id)?.status === "ready") beginCouchFinale(campaign.id, row?.endedBy ?? "host", row?.ending ?? "");
    return viewOf(campaign.id, getRow(campaign.id));
  }
  if (row.status === "writing") startWriting(campaign.id);
  return viewOf(campaign.id, row);
}

// ---- writing it ----

function gatherFacts(campaignId: string): { facts: FinaleFacts; outline: string; transcript: string; campaign: Campaign } | null {
  const campaign = getCampaignById(campaignId);
  const forge = getCouchForge(campaignId);
  if (!campaign || !forge?.forge) return null;
  const row = getRow(campaignId);
  const scenario = forge.forge.scenario;
  // The crew in the order the forge wrote them; a takeover is last.
  const order = new Map(listCouchCrew(campaignId).flatMap((card) => (card.sheetId ? [[card.sheetId, card.position] as const] : [])));
  const sheets = listSheets(campaignId)
    .filter((sheet) => !sheet.isCompanion && sheet.agenda)
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const messages = listAllMessages(campaignId);
  const names = new Map(sheets.map((sheet) => [sheet.id, sheet.name]));
  const fights = (
    getDatabase().prepare(`SELECT COUNT(*) AS n FROM encounters WHERE campaign_id = ? AND kind = 'fight'`).get(campaignId) as { n: number } | undefined
  )?.n ?? 0;
  const facts = finaleFacts({
    title: scenario.title || campaign.title,
    truth: scenario.truth,
    ending: row?.ending ?? "",
    endedBy: row?.endedBy ?? "host",
    act: forge.act,
    endedAt: row?.endedAt || nowIso(),
    crew: sheets.map((sheet) => ({
      id: sheet.id,
      userId: sheet.userId,
      name: sheet.name,
      crewRole: sheet.crewRole,
      portraitUrl: sheet.portrait?.url ?? null,
      dead: Boolean(sheet.deathSaves?.dead),
      agenda: sheet.agenda ?? null,
    })),
    rolls: listRollsSince(campaignId, "1970-01-01T00:00:00.000Z").map((roll) => ({ characterId: roll.characterId, crit: roll.breakdown?.crit ?? null })),
    messages: messages.map((message) => ({ authorType: message.authorType, characterId: message.characterId, createdAt: message.createdAt })),
    fights,
    pictures: nightPictures(messages),
  });
  const outline = [
    `Truth: ${scenario.truth}`,
    scenario.threat ? `Threat: ${scenario.threat}` : "",
    ...scenario.acts.map((act, index) => `Act ${index + 1}, ${act.title}: ${act.goal}${act.twist ? ` Twist: ${act.twist}` : ""}`),
    ...scenario.cast.filter((person) => person.secret).map((person) => `${person.name} (${person.role}) secretly: ${person.secret}`),
    // What the GM recapped at each act break (act-break-logic.ts), the
    // night's spine when a long transcript has been cut down.
    ...(forge.recaps ?? []).map((points, index) => (points.length ? `Recapped at the end of act ${index + 1}: ${points.join("; ")}` : "")),
  ]
    .filter(Boolean)
    .join("\n");
  // Each passage with a picture is marked with its number among the
  // night's pictures, for the model to pick one per beat.
  const numbers = new Map(facts.pictures.map((url, index) => [url, index + 1]));
  const transcript = finaleTranscript(
    messages
      .filter((message) => message.authorType !== "system")
      .map((message) => {
        const url = pictureOf(message);
        return {
          who: message.authorType === "dm" ? "GM" : (message.characterId && names.get(message.characterId)) || "A player",
          text: withoutRollMarkers(stripToolText(message.content)),
          ...(url && numbers.has(url) ? { picture: numbers.get(url) } : {}),
        };
      }),
  );
  return { facts, outline, transcript, campaign };
}

async function writeFinale(campaignId: string): Promise<void> {
  const gathered = gatherFacts(campaignId);
  if (!gathered) return;
  const { facts, outline, transcript, campaign } = gathered;
  let prose: FinaleProse | null = null;
  // Two tries: a reply that could not be read is asked once more. A backend
  // that does not answer is not asked again; the facts close the night.
  for (let attempt = 0; attempt < 2 && !prose; attempt += 1) {
    const { message, error } = await requestDmMessage(
      campaign.settings,
      [
        { role: "system", content: withLanguage(finaleSystemPrompt(), campaign.gameSettings.tableLanguage) },
        {
          role: "user",
          content: attempt
            ? `${finaleUserPrompt(facts, outline, transcript)}\n\nYour last reply could not be read as the JSON asked for. Write the whole JSON again, exactly as asked.`
            : finaleUserPrompt(facts, outline, transcript),
        },
      ],
      { meta: { task: "couch_finale" }, timeoutMs: arcTextTimeoutMs(), thinking: false, maxOutputTokens: 4000, harness: { campaignId } },
    );
    if (error) {
      console.warn(`[couch] closing for ${campaignId}: the storyteller did not answer (${error.status}).`);
      break;
    }
    prose = readFinaleReply(stripReasoningArtifacts(String(message?.content ?? "")));
  }
  finish(campaignId, mergeFinale(facts, prose));
}
