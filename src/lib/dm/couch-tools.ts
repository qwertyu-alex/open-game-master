import { z } from "zod";
import type { Campaign } from "@/lib/db/campaigns";
import { advanceCouchAct, awardStoryPoint } from "@/lib/couch/play";
import { actName } from "@/lib/couch/prompt-logic";
import { getCouchForge } from "@/lib/couch/store";
import type { ToolResult } from "@/lib/dm/tool-errors";

// A couch night's two story levers (docs/couch-mode-spec.md 2.2): turning
// the act, which hands every crew member their next secret agenda on their
// phone and puts the act's title on the TV, and a story point for chasing
// an agenda. Without them the agendas the forge wrote for acts II and III
// never reach anyone and pursuing one earns nothing, which is the hook that
// makes players chase them. Offered only at a couch table (dmTurnTools).

export const COUCH_TOOL_NAMES = ["advance_act", "award_story_point"] as const;

type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const couchTools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "advance_act",
      description:
        "Turn the one-shot to its next act once the current act's goal is met or lost. Each crew member's phone gets their next secret agenda and the TV shows the act's title. Call it once, at the act break, then narrate the new act's opening.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Optional: a few words for the TV under the act number; blank uses the scenario's own act title." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "award_story_point",
      description:
        "Give a crew member one story point when they visibly pursue their secret agenda this scene (at most one each per scene). Never explain why aloud.",
      parameters: {
        type: "object",
        properties: { characterId: { type: "string", description: "The crew member's characterId from CREW AGENDAS." } },
        required: ["characterId"],
        additionalProperties: false,
      },
    },
  },
];

const storyPointSchema = z.object({ characterId: z.string().trim().min(1) });
const advanceActSchema = z.object({ title: z.string().trim().max(80).optional() });

export function handleAdvanceAct(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Acts belong to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof advanceActSchema>;
  try {
    args = advanceActSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: advance_act takes at most a short title.", retry: true };
  }
  const before = getCouchForge(campaign.id)?.act ?? 0;
  const act = advanceCouchAct(campaign.id, args.title ?? "");
  if (act === before) {
    return { error: `${actName(act)} is the last act: land the ending instead.`, refused: "rules" };
  }
  return { ok: true, act: actName(act), note: `${actName(act)} is in force; every crew member now holds that act's agenda (CREW AGENDAS from the next turn).` };
}

export function handleAwardStoryPoint(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Story points belong to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof storyPointSchema>;
  try {
    args = storyPointSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: award_story_point needs a characterId from CREW AGENDAS.", retry: true };
  }
  const outcome = awardStoryPoint(campaign.id, args.characterId);
  return outcome.ok ? { ok: true, storyPoints: outcome.storyPoints } : { error: outcome.error, retry: true };
}
