import { admitSheet } from "@/lib/characters/admit";
import { buildDraft, type DraftOffered } from "@/lib/characters/pregen-drafts";
import { srdBackgroundOptions, srdClassOptions, srdRaceOptions } from "@/lib/characters/options";
import {
  COUCH_CLASS_IDS,
  CAREER_BUILD,
  DEFAULT_STYLE_LOCK,
  couchGameSettings,
  couchOutline,
  crewPortraitPrompt,
  crewProposal,
  crewSheetFields,
  forgeReplyTokens,
  forgeSystemPrompt,
  forgeUserPrompt,
  readForge,
  withSignatureItem,
  type Forge,
  type ForgedCrew,
} from "@/lib/couch/forge-logic";
import {
  beginCouchForge,
  failCouchForge,
  finishCouchForge,
  getCouchCrew,
  getCouchForge,
  listCouchCrew,
  setCrewPortrait,
  type CouchCrewRow,
} from "@/lib/couch/store";
import { writtenForge } from "@/lib/couch/scenarios";
import { couchStartingKit } from "@/lib/couch/kit-logic";
import { prepareIntroAudio } from "@/lib/couch/intro";
import {
  createCampaign,
  getCampaignById,
  setDmOutline,
  updateCampaignInfo,
  updateStorySettings,
  type Campaign,
} from "@/lib/db/campaigns";
import { getSheetById, patchSheet } from "@/lib/db/sheets";
import { requestDmMessage } from "@/lib/dm/model";
import { withLanguage } from "@/lib/dm/table-language-logic";
import { publishPersisted } from "@/lib/events";
import { toEnglishForImage } from "@/lib/image-english";
import { generateStoryImage } from "@/lib/image-generate";
import { enqueueMediaJob } from "@/lib/media-queue";
import { arcTextTimeoutMs } from "@/lib/model-client";
import { copyIntoUploads, whenImagesAvailable } from "@/lib/portrait";
import { configuredDefaultStorySettings } from "@/lib/runtime-defaults";
import type { CreateSheetInput } from "@/lib/schemas/sheet";
import { pregenById } from "@/lib/starter/pregens";
import { stripReasoningArtifacts } from "@/lib/story-prompt";
import { bindUsageScope } from "@/lib/usage/scope";

// The scenario forge's model call and writes (docs/couch-mode-spec.md 2.1):
// a couch night is created with its forge running, the forge asks the story
// model for the scenario and the crew in one structured call, the
// quick-build engine turns each crew member into a level 1 sheet the table's
// door admits, and the night is ready: the cards are claimable, the GM's
// spine is written, the art direction is locked and the portraits paint.
// What is asked and how the answer is read is src/lib/couch/forge-logic.ts.

// scenarioId picks a ready-made story (src/lib/couch/scenarios) in place of
// one written tonight from the seed; "" is the story model's.
export type CouchNightInput = { seed: string; players: number; offLimits: string; scenarioId?: string };

declare global {
  var __odmCouchForging: Set<string> | undefined;
  var __odmCouchPainting: Map<string, { running: boolean; tries: number }> | undefined;
}

function forging(): Set<string> {
  return (globalThis.__odmCouchForging ??= new Set());
}

// Each card's portrait while it paints, and how often it was tried: a lobby
// read asks again for a card still without one (catchUpPortraits), and a
// painter that refuses the same card twice is not asked a third time.
const PORTRAIT_TRIES = 2;
function painting(): Map<string, { running: boolean; tries: number }> {
  return (globalThis.__odmCouchPainting ??= new Map());
}

// Whether this process is writing the campaign's forge now. A row that says
// "forging" with no forge running here was cut off by a restart.
export function forgeRunning(campaignId: string): boolean {
  return forging().has(campaignId);
}

// What changed for a lobby that shows the cards: the TV and the phones
// re-read GET /api/campaigns/[id]/couch when a campaign_updated carries this
// key (the campaign's own fields ride beside it when the forge set them).
// couchStamp moves on every change, so a lobby keyed on it reads again even
// when the status has not changed: a portrait landing, the introductions
// moving on a step.
export function publishCouchChange(campaignId: string, extra: Record<string, unknown> = {}): void {
  const forge = getCouchForge(campaignId);
  publishPersisted(campaignId, "campaign_updated", { ...extra, couchStatus: forge?.status ?? "forging", couchStamp: Date.now() });
}

// A couch night: an AI-run one-shot whose creator is the TV's own account
// (the party lead, playing no character), with every couch default, and its
// forge running in the background. The TV's seat is the one past the crew.
export function createCouchNight(userId: string, input: CouchNightInput): Campaign {
  const campaign = createCampaign(userId, {
    title: "Couch night",
    description: "",
    theme: "",
    maxPlayers: input.players + 1,
    startingLevel: 1,
    difficulty: "normal",
    gameSettings: couchGameSettings(input.offLimits),
  });
  // Pictures on, on the server's own painter, every one of them in the
  // night's look: the default until the forge writes the story's own.
  updateStorySettings(campaign.id, {
    imageGenerationEnabled: true,
    autoImages: true,
    artStyle: "custom",
    artStyleScene: DEFAULT_STYLE_LOCK,
    artStyleMap: "",
  });
  beginCouchForge(campaign.id, input);
  startForge(campaign.id);
  return getCampaignById(campaign.id) ?? campaign;
}

// Off the request that asked for it: the forge takes as long as the story
// model does (minutes, on an agent program), and the TV polls meanwhile.
// One forge per campaign at a time.
export function startForge(campaignId: string): void {
  if (forgeRunning(campaignId)) {
    return;
  }
  forging().add(campaignId);
  const job = bindUsageScope(() => runForge(campaignId), { campaignId });
  void job()
    .catch((error) => {
      console.error(`[couch] forge failed for campaign ${campaignId}:`, error);
      failCouchForge(campaignId, "Something went wrong while writing the story. Try again.");
      publishCouchChange(campaignId);
    })
    .finally(() => forging().delete(campaignId));
}

// A reforge: the same night's seed asked again, the old cards gone. Only
// before anyone has taken a card; the route checks who may ask.
export function restartForge(campaignId: string): void {
  const forge = getCouchForge(campaignId);
  if (!forge) {
    return;
  }
  beginCouchForge(campaignId, { players: forge.players, seed: forge.seed, offLimits: forge.offLimits, scenarioId: forge.scenarioId });
  publishCouchChange(campaignId);
  startForge(campaignId);
}

// What a backend's refusal said, for the TV's error line: "The server's
// agent is kept for campaigns an administrator leads" is something the host
// can fix tonight, where "could not be reached" alone is not.
async function upstreamReason(error: Response): Promise<string> {
  const body = (await error.clone().json().catch(() => null)) as { error?: unknown } | null;
  const said = typeof body?.error === "string" ? body.error : typeof (body?.error as { message?: unknown } | undefined)?.message === "string" ? String((body!.error as { message: string }).message) : "";
  return said.slice(0, 200);
}

// Two tries: a reply the reader refuses is asked once more with the reason,
// which is what a model that slipped one field needs. A backend that is not
// answering at all is not asked twice.
async function askForge(campaign: Campaign, players: number, seed: string, offLimits: string): Promise<{ forge: Forge } | { error: string }> {
  const system = withLanguage(forgeSystemPrompt(players, offLimits), campaign.gameSettings.tableLanguage);
  let problem = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { message, error } = await requestDmMessage(
      campaign.settings,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: problem
            ? `${forgeUserPrompt(seed)}\n\nYour last reply could not be used: ${problem} Write the whole JSON again, exactly as asked.`
            : forgeUserPrompt(seed),
        },
      ],
      {
        meta: { task: "couch_forge" },
        timeoutMs: arcTextTimeoutMs(),
        thinking: false,
        maxOutputTokens: forgeReplyTokens(players),
        // An agent program asks the admin's rule for this campaign, as its
        // turns will: a forge it would refuse turns is refused too, now.
        harness: { campaignId: campaign.id },
      },
    );
    if (error) {
      const said = await upstreamReason(error);
      return { error: `The storyteller could not be reached, so the story was not written${said ? ` (${said})` : ""}. Try again in a moment.` };
    }
    const read = readForge(stripReasoningArtifacts(String(message?.content ?? "")), players);
    if (read.ok) {
      return { forge: read.forge };
    }
    problem = read.error;
  }
  return { error: `The storyteller's story could not be read (${problem}). Try again.` };
}

// What the quick-build engine may build a crew member from: the careers'
// classes, a human, and every background (the career names its own).
function couchOffered(): DraftOffered {
  const classes = srdClassOptions().filter((entry) => COUCH_CLASS_IDS.includes(entry.id));
  const races = srdRaceOptions().filter((entry) => entry.id === "human");
  return { classes, races, backgrounds: srdBackgroundOptions() };
}

type Judge = (sheet: CreateSheetInput) => CreateSheetInput | null;

// The table's own door, as a player's character at this table passes it:
// the forge's crew and anyone a player takes over after a death
// (src/lib/couch/takeover.ts) are let in by the same rules.
export function tableJudge(campaign: Campaign): Judge {
  return (sheet) => {
    const verdict = admitSheet({ door: "table", level: 1, sheet, userId: campaign.ownerUserId, campaign });
    if (!verdict.ok) {
      console.warn(`[couch] ${sheet.name} did not pass the table's rules check: ${verdict.problems[0] ?? "no reason given"}`);
      return null;
    }
    verdict.settle();
    return verdict.sheet;
  };
}

// One crew member as a sheet the table's door admits: built by the
// quick-build engine from the career's class and background, or, when the
// engine or the door refuses it, the nearest of the four ready-made heroes
// reskinned (docs/couch-mode-spec.md Part 5). Either way the forge's words
// go on top, and the signature item goes in the pack after the door, where
// a free-text item cannot cost the build.
export function crewSheet(member: ForgedCrew, judge: Judge, rng: () => number = Math.random): CreateSheetInput | null {
  const fields = crewSheetFields(member);
  // The crew starts light (src/lib/couch/kit-logic.ts): trimmed after the
  // door, which judged the whole class kit, so no build is refused for it.
  const finish = (sheet: CreateSheetInput): CreateSheetInput => ({ ...sheet, equipment: withSignatureItem(couchStartingKit(sheet.equipment), member.signatureItem) });
  const built = buildDraft(crewProposal(member), 1, couchOffered(), rng);
  if (built.ok) {
    const admitted = judge({ ...built.draft.sheet, ...fields });
    if (admitted) {
      return finish({ ...admitted, ...fields });
    }
  }
  const pregen = pregenById(CAREER_BUILD[member.career].pregen);
  if (!pregen) {
    return null;
  }
  const admitted = judge({ ...pregen.sheet, ...fields });
  return admitted ? finish({ ...admitted, ...fields }) : null;
}

// The forge itself, start to finish. Exported for the suites, which await
// it rather than racing the background job.
export async function runForge(campaignId: string, options: { rng?: () => number } = {}): Promise<void> {
  const campaign = getCampaignById(campaignId);
  const row = getCouchForge(campaignId);
  if (!campaign || !row) {
    return;
  }
  // A ready-made story needs no model call: it is read as the model's
  // reply would be, and everything after this line treats it the same.
  const asked = row.scenarioId ? writtenForge(row.scenarioId, row.players) : await askForge(campaign, row.players, row.seed, row.offLimits);
  if ("error" in asked) {
    failCouchForge(campaignId, asked.error);
    publishCouchChange(campaignId);
    return;
  }
  const { forge } = asked;
  const judge = tableJudge(campaign);
  const crew: Parameters<typeof finishCouchForge>[2] = [];
  for (const member of forge.crew) {
    const sheet = crewSheet(member, judge, options.rng);
    if (!sheet) {
      failCouchForge(campaignId, `${member.name} could not be made into a character within the rules. Try again.`);
      publishCouchChange(campaignId);
      return;
    }
    crew.push({
      name: sheet.name,
      crewRole: member.crewRole,
      backstory: sheet.backstory,
      career: member.career,
      gender: member.gender,
      look: member.look,
      sheet,
    });
  }
  // The night as the table and the GM know it. A reforge cancelled by a
  // deleted campaign writes nothing.
  if (!getCampaignById(campaignId)) {
    return;
  }
  const cards = finishCouchForge(campaignId, forge, crew);
  setDmOutline(campaignId, couchOutline(forge));
  const info = {
    title: forge.scenario.title.slice(0, 80),
    description: forge.scenario.logline.slice(0, 500),
    theme: forge.scenario.setting.slice(0, 120),
  };
  updateCampaignInfo(campaignId, info);
  // Every picture of the night in one look (src/lib/art-direction.ts): the
  // scene pictures read the custom scene style.
  updateStorySettings(campaignId, { artStyle: "custom", artStyleScene: forge.styleLock, artStyleMap: "" });
  publishCouchChange(campaignId, info);
  paintCrewPortraits(campaignId, forge.styleLock, cards);
  // The TV opens on the introductions: their voice is read ahead now.
  prepareIntroAudio(campaignId);
}

// One portrait per card, on the media queue, while the TV shows the
// briefing. A card claimed before its portrait lands gets it on its sheet.
export function paintCrewPortraits(campaignId: string, styleLock: string, cards: CouchCrewRow[]): void {
  for (const card of cards) {
    const state = painting().get(card.id) ?? { running: false, tries: 0 };
    if (card.portraitUrl || state.running || state.tries >= PORTRAIT_TRIES) {
      continue;
    }
    painting().set(card.id, { running: true, tries: state.tries + 1 });
    void whenImagesAvailable(() =>
      enqueueMediaJob(`couch portrait ${card.id}`, async () => {
        try {
          // The look is the forge's prose, in the table's language; an image
          // model reads English.
          const campaign = getCampaignById(campaignId);
          const { look } = campaign ? await toEnglishForImage(campaign, { look: card.look }) : { look: card.look };
          const prompt = crewPortraitPrompt({ gender: card.gender, career: card.career, look }, styleLock);
          const image = await generateStoryImage(configuredDefaultStorySettings(), { prompt, mode: "fast", aspect: "square" });
          const copied = copyIntoUploads(image.url);
          const fresh = getCouchCrew(card.id);
          if (!fresh) {
            return;
          }
          setCrewPortrait(card.id, copied.url);
          if (fresh.sheetId && getSheetById(fresh.sheetId)) {
            const updated = patchSheet(fresh.sheetId, {
              portrait: { id: copied.id, name: `${card.name} portrait`, type: "image/png", url: copied.url },
            });
            if (updated) {
              publishPersisted(campaignId, "sheet_updated", { sheet: updated });
            }
          }
          publishCouchChange(campaignId);
        } catch (error) {
          console.error(`[couch] portrait failed for ${card.name} (${card.id}):`, error);
        } finally {
          painting().set(card.id, { running: false, tries: painting().get(card.id)?.tries ?? 1 });
        }
      }),
    ).finally(() => {
      // No painter on this server: nothing ran, so nothing is in flight.
      const now = painting().get(card.id);
      if (now?.running) {
        painting().set(card.id, { ...now, running: false });
      }
    });
  }
}

// The cards that still lack a portrait, painted again: a server that came
// back from a restart, or a painter that was busy, catches up on the next
// lobby read. Cheap to ask: the media queue folds a repeat into the job
// already waiting.
export function catchUpPortraits(campaignId: string): void {
  const forge = getCouchForge(campaignId);
  if (forge?.status !== "ready" || !forge.forge) {
    return;
  }
  const missing = listCouchCrew(campaignId).filter((card) => !card.portraitUrl);
  if (missing.length) {
    paintCrewPortraits(campaignId, forge.forge.styleLock, missing);
  }
}
