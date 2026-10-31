import { crewSheet, paintCrewPortraits, publishCouchChange, tableJudge } from "@/lib/couch/forge";
import {
  SOMEONE_NEW,
  choiceOf,
  fallbackTakeover,
  readTakeover,
  storyExcerpt,
  takeoverCandidates,
  takeoverNote,
  takeoverReplyTokens,
  takeoverSystemPrompt,
  takeoverUserPrompt,
  type TakeoverChoice,
  type TakeoverPerson,
} from "@/lib/couch/takeover-logic";
import { addTakenCrewCard, getCouchForge, linkNpcToCrewSheet } from "@/lib/couch/store";
import { seatAddedSheet } from "@/lib/character-seat";
import { getCampaignById, listMembers, setMemberReady, type Campaign } from "@/lib/db/campaigns";
import { getDatabase } from "@/lib/db/core";
import { getActiveEncounter, listEnemies } from "@/lib/db/encounters";
import { listRecentMessages } from "@/lib/db/messages";
import { getNpcById, listCastNpcs } from "@/lib/db/npcs";
import { createSheet, listSheets } from "@/lib/db/sheets";
import { tableNote } from "@/lib/dm/between-io";
import { requestDmMessage } from "@/lib/dm/model";
import { publishTitleCard } from "@/lib/dm/scene-state";
import { withLanguage } from "@/lib/dm/table-language-logic";
import { publishPersisted } from "@/lib/events";
import { arcTextTimeoutMs } from "@/lib/model-client";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { stripReasoningArtifacts } from "@/lib/story-prompt";
import { setRosterVoice } from "@/lib/tts-roster";
import { bindUsageScope } from "@/lib/usage/scope";

// Playing on after a death (docs/couch-mode-spec.md 2.12), the rim around
// src/lib/couch/takeover-logic.ts. A player whose character died picks
// someone in the story on their phone; the story model writes them up as a
// crew member (their agenda from what they want and hide), the table's
// door builds their sheet, and they take the player's seat, the dead
// character's sheet left where it lies. While the model writes, the phone
// says so; a model that is down, slow or unreadable is not a reason to keep
// anyone out, so the person is built from what the forge and the GM's
// roster already say.

type Pending = { key: string; name: string; status: "writing" | "failed"; error: string };

declare global {
  var __odmCouchTakeovers: Map<string, Pending> | undefined;
  // People the story model said cannot join (dead in the story, out for
  // the crew's blood), by campaign: dropped from every later list.
  var __odmCouchRefused: Map<string, Set<string>> | undefined;
}

function pendingMap(): Map<string, Pending> {
  return (globalThis.__odmCouchTakeovers ??= new Map());
}

function refusedFor(campaignId: string): Set<string> {
  const all = (globalThis.__odmCouchRefused ??= new Map());
  let set = all.get(campaignId);
  if (!set) {
    set = new Set();
    all.set(campaignId, set);
  }
  return set;
}

const pendingKey = (campaignId: string, userId: string) => `${campaignId}:${userId}`;

// The player's characters as the takeover reads them: the dead one they
// would replace, when every character they have is dead. Null while they
// have a living one, or none at all (a late joiner chooses from the crew
// cards instead).
export function fallenSheetOf(campaignId: string, userId: string, sheets: CharacterSheet[] = listSheets(campaignId)): CharacterSheet | null {
  const own = sheets.filter((sheet) => sheet.userId === userId && !sheet.isCompanion);
  if (!own.length || own.some((sheet) => !sheet.deathSaves?.dead)) {
    return null;
  }
  return own[own.length - 1];
}

// Everyone who may be taken over right now. Out besides what the pure half
// leaves out: anyone a fight has killed or still has standing against the
// crew, anyone the story model refused, and anyone another player is
// taking over this minute.
function candidates(campaign: Campaign, userId: string): TakeoverPerson[] {
  const forge = getCouchForge(campaign.id)?.forge;
  const sheets = listSheets(campaign.id);
  const encounter = getActiveEncounter(campaign.id);
  const foes = encounter ? listEnemies(encounter.id).filter((enemy) => enemy.status === "alive").map((enemy) => enemy.displayName) : [];
  const killed = (
    getDatabase().prepare(`SELECT display_name AS name FROM encounter_enemies WHERE campaign_id = ? AND status = 'dead'`).all(campaign.id) as Array<{ name: string }>
  ).map((row) => row.name);
  const others = [...pendingMap()]
    .filter(([key, pending]) => key.startsWith(`${campaign.id}:`) && key !== pendingKey(campaign.id, userId) && pending.status === "writing")
    .map(([, pending]) => pending.name);
  return takeoverCandidates({
    cast: forge?.scenario.cast ?? [],
    npcs: listCastNpcs(campaign.id),
    unavailable: [...sheets.map((sheet) => sheet.name), ...foes, ...killed, ...others, ...refusedFor(campaign.id)],
  });
}

// What the phone of a player whose character died reads
// (GET /api/campaigns/[id]/couch/takeover): their dead character, the
// people they may play on as, and how a takeover they asked for is going.
export type TakeoverView = {
  fallen: { id: string; name: string } | null;
  choices: TakeoverChoice[];
  pending: { name: string; status: "writing" | "failed"; error: string } | null;
};

export function takeoverView(campaign: Campaign, userId: string): TakeoverView {
  const fallen = fallenSheetOf(campaign.id, userId);
  const pending = pendingMap().get(pendingKey(campaign.id, userId)) ?? null;
  return {
    fallen: fallen ? { id: fallen.id, name: fallen.name } : null,
    choices: fallen ? candidates(campaign, userId).map(choiceOf) : [],
    pending: fallen && pending ? { name: pending.name, status: pending.status, error: pending.error } : null,
  };
}

export type TakeoverStart = { ok: true; name: string } | { ok: false; status: number; error: string };

// The player's choice, checked and started. The writing runs off the
// request (a story model can take a minute), and the phone follows it on
// the view above.
export function startTakeover(campaign: Campaign, userId: string, key: string): TakeoverStart {
  const forge = getCouchForge(campaign.id);
  if (!campaign.gameSettings.couchMode || forge?.status !== "ready" || !forge.forge) {
    return { ok: false, status: 404, error: "This table is not a couch night." };
  }
  if (campaign.status !== "active") {
    return { ok: false, status: 409, error: campaign.status === "ended" ? "The story has ended." : "The story has not started yet." };
  }
  const fallen = fallenSheetOf(campaign.id, userId);
  if (!fallen) {
    return { ok: false, status: 409, error: "Your character is still alive." };
  }
  const slot = pendingKey(campaign.id, userId);
  if (pendingMap().get(slot)?.status === "writing") {
    return { ok: false, status: 409, error: "Your next character is already being written." };
  }
  const person = key === SOMEONE_NEW ? null : (candidates(campaign, userId).find((entry) => entry.key === key) ?? null);
  if (key !== SOMEONE_NEW && !person) {
    return { ok: false, status: 409, error: "That person cannot join the crew any more. Choose someone else." };
  }
  const name = person?.name ?? "Someone new";
  pendingMap().set(slot, { key, name, status: "writing", error: "" });
  const job = bindUsageScope(() => runTakeover(campaign.id, userId, fallen, person), { campaignId: campaign.id });
  void job()
    .catch((error) => {
      console.error(`[couch] takeover failed for ${userId} in ${campaign.id}:`, error);
      pendingMap().set(slot, { key, name, status: "failed", error: "Something went wrong. Try again." });
    })
    .finally(() => {
      // A finished takeover leaves nothing pending; a failed one stays for
      // the phone to show until the player picks again.
      if (pendingMap().get(slot)?.status === "writing") pendingMap().delete(slot);
      publishCouchChange(campaign.id);
    });
  publishCouchChange(campaign.id);
  return { ok: true, name };
}

// One model call: a reply it cannot read, or no reply, falls back to the
// person as the forge and the roster wrote them. A refusal (the story says
// they are dead) is handed back for the player to choose again.
async function writeMember(campaign: Campaign, fallen: CharacterSheet, person: TakeoverPerson | null, act: number) {
  const forge = getCouchForge(campaign.id)!.forge!;
  const sheets = listSheets(campaign.id);
  const taken = [...sheets.map((sheet) => sheet.name), ...listCastNpcs(campaign.id).map((npc) => npc.name), ...forge.scenario.cast.map((cast) => cast.name)];
  const crew = sheets
    .filter((sheet) => !sheet.isCompanion && !sheet.deathSaves?.dead && sheet.userId !== campaign.leadUserId)
    .map((sheet) => ({ name: sheet.name, crewRole: sheet.crewRole ?? "" }));
  const prompt = takeoverUserPrompt({
    forge,
    act,
    person,
    fallen: { name: fallen.name, crewRole: fallen.crewRole ?? "" },
    crew,
    story: storyExcerpt(listRecentMessages(campaign.id, 24)),
  });
  const { message, error } = await requestDmMessage(
    campaign.settings,
    [
      { role: "system", content: withLanguage(takeoverSystemPrompt(), campaign.gameSettings.tableLanguage) },
      { role: "user", content: prompt },
    ],
    {
      meta: { task: "couch_takeover" },
      timeoutMs: arcTextTimeoutMs(),
      thinking: false,
      maxOutputTokens: takeoverReplyTokens(),
      harness: { campaignId: campaign.id },
    },
  );
  if (!error) {
    const read = readTakeover(stripReasoningArtifacts(String(message?.content ?? "")), { person, act, taken });
    if (read.ok) return { member: read.member };
    if ("unavailable" in read) return { unavailable: read.unavailable };
    console.warn(`[couch] takeover reply for ${person?.name ?? "someone new"} could not be read (${read.error}); building them from the scenario.`);
  } else {
    console.warn(`[couch] takeover model call failed (${error.status}); building ${person?.name ?? "someone new"} from the scenario.`);
  }
  return { member: fallbackTakeover(person, act, taken) };
}

async function runTakeover(campaignId: string, userId: string, fallen: CharacterSheet, person: TakeoverPerson | null): Promise<void> {
  const slot = pendingKey(campaignId, userId);
  const fail = (error: string): void => {
    pendingMap().set(slot, { key: person?.key ?? SOMEONE_NEW, name: person?.name ?? "Someone new", status: "failed", error });
  };
  const campaign = getCampaignById(campaignId);
  const forgeRow = getCouchForge(campaignId);
  if (!campaign || !forgeRow?.forge) {
    return fail("The night is gone.");
  }
  const act = forgeRow.act;
  const written = await writeMember(campaign, fallen, person, act);
  if ("unavailable" in written) {
    if (person) refusedFor(campaignId).add(person.name);
    return fail(`${person?.name ?? "They"} cannot join: ${written.unavailable} Choose someone else.`);
  }
  const { member } = written;
  const sheet = crewSheet(member, tableJudge(campaign));
  if (!sheet) {
    return fail(`${member.name} could not be made into a character within the rules. Choose someone else.`);
  }
  // Read again after the wait: a second phone of the same player, or a
  // revival, may have settled it meanwhile.
  const now = getCampaignById(campaignId);
  if (!now || now.status !== "active" || !fallenSheetOf(campaignId, userId)) {
    pendingMap().delete(slot);
    return;
  }
  const npc = person?.npcId ? getNpcById(person.npcId) : null;
  const portraitUrl = npc?.portraitUrl || null;
  const agenda = { acts: member.agenda, act: Math.min(act, member.agenda.length - 1), hiddenRole: "", storyPoints: 0 };
  const created = createSheet(campaignId, userId, 1, {
    ...sheet,
    agenda,
    ...(portraitUrl ? { portrait: { id: `takeover-${npc!.id}`, name: `${member.name} portrait`, type: "image/png", url: portraitUrl } } : {}),
  });
  const card = addTakenCrewCard(
    campaignId,
    { name: created.name, crewRole: member.crewRole, backstory: member.backstory, career: member.career, gender: member.gender, look: member.look, sheet: { ...sheet, agenda } },
    userId,
    created.id,
    portraitUrl,
  );
  if (npc) {
    linkNpcToCrewSheet(npc.id, created.id);
    // The same voice the room already knows them by.
    if (npc.voice) setRosterVoice(campaignId, { key: `pc:${created.id}`, name: created.name }, npc.voice);
  }
  pendingMap().delete(slot);
  seatAddedSheet(now, userId, created.id);
  setMemberReady(campaignId, userId, true);
  publishPersisted(campaignId, "sheet_updated", { sheet: created });
  const player = listMembers(campaignId).find((member) => member.userId === userId)?.username ?? "";
  tableNote(now, takeoverNote({ fallen: fallen.name, player, name: created.name, role: member.crewRole }), "system-party");
  publishTitleCard(campaignId, { title: created.name, subtitle: "joins the crew", tone: "plain" });
  if (!portraitUrl) {
    paintCrewPortraits(campaignId, forgeRow.forge.styleLock, [card]);
  }
}
