import { z } from "zod";
import type { Campaign } from "@/lib/db/campaigns";
import { advanceCouchAct, awardStoryPoint } from "@/lib/couch/play";
import { actName } from "@/lib/couch/prompt-logic";
import { getCouchForge } from "@/lib/couch/store";
import { markPlaceChanged } from "@/lib/couch/place-shots";
import { COUCH_MOODS, moodCue } from "@/lib/couch/mood-logic";
import { stateCouchMood } from "@/lib/couch/mood";
import { getActiveEncounter } from "@/lib/db/encounters";
import { getCurrentLocation } from "@/lib/db/locations";
import { cutCouchScene } from "@/lib/couch/navigation";
import { publishCouchSite } from "@/lib/couch/site";
import { couchGroups, offSceneWaits } from "@/lib/couch/whereabouts";
import { heldMovesLine, planCut } from "@/lib/couch/whereabouts-logic";
import type { ToolResult } from "@/lib/dm/tool-errors";
import { publishCouchObjective, stateCouchObjective } from "@/lib/couch/pacing";
import { OBJECTIVE_CLOCK_MAX, OBJECTIVE_MAX } from "@/lib/couch/pacing-logic";

// A couch night's two story levers (docs/couch-mode-spec.md 2.2): turning
// the act, which hands every crew member their next secret agenda on their
// phone and puts the act's title on the TV, and a story point for chasing
// an agenda. Without them the agendas the forge wrote for acts II and III
// never reach anyone and pursuing one earns nothing, which is the hook that
// makes players chase them. Offered only at a couch table (dmTurnTools).
//
// And a third for the pictures: each place is painted once, wide and empty,
// when the crew first stands in it (src/lib/couch/place-shots.ts), and the
// phones' map shows that picture again. When the place changes for good (a
// fire, a breach), repaint_place has its next picture paint it anew.
//
// And the mood, which the TV's music follows (src/lib/couch/mood.ts): the
// server already hears a fight in the attack tools, but only the GM knows
// when a quiet corridor has turned to dread.

//
// And the cut, once the crew has split up (src/lib/couch/whereabouts.ts):
// the story follows one group at a time, and the GM chooses when it turns
// to another.
//
// And the truce, in a fight (src/lib/couch/truce.ts): the crew answer it on
// their phones, so the GM never has to ask the room out of turn.
//
// And the objective (src/lib/couch/pacing.ts): what the crew must do now,
// on the TV and every phone, so the room always knows what it is playing
// for. Without it a night drifted through ninety minutes of "what do you
// do?" with nobody sure what the scene wanted (2026-10-30).

export const COUCH_TOOL_NAMES = ["advance_act", "set_objective", "award_story_point", "repaint_place", "set_mood", "cut_to", "offer_truce"] as const;

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
      name: "set_objective",
      description:
        "Put the crew's current objective on the TV and every phone: what they must do now, as an order or a need, in a few plain words (\"Get Maren to the medical bay\", \"Seal the cargo lock before the pirates cut through\"), and the clock when one is running. Set it when an act opens and whenever the crew's aim changes; never put a secret, an agenda or the truth in it.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: `What the crew must do now, under ${OBJECTIVE_MAX} characters.` },
          clock: { type: "string", description: `Optional: the deadline in a few words ("ships dock in 1 hour"), under ${OBJECTIVE_CLOCK_MAX} characters.` },
        },
        required: ["objective"],
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
  {
    type: "function",
    function: {
      name: "repaint_place",
      description:
        "Have the next picture repaint the place the crew is in, when it has changed so much that its picture on every map is wrong (a fire, a flood, a breach, the lights die). Not for people moving or small finds.",
      parameters: {
        type: "object",
        properties: { change: { type: "string", description: "What changed, in a few words: \"the bulkhead is breached and venting\"." } },
        required: ["change"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_mood",
      description:
        "Say what the scene is doing to the crew; the TV's music follows. Call it before narrating the turn when the mood changes (creeping into the dark is dread, something hunting them is danger, a running escape is chase, blows are fight, the cost after it is aftermath), not every reply. Attacks raise it on their own.",
      parameters: {
        type: "object",
        properties: { mood: { type: "string", enum: [...COUCH_MOODS] } },
        required: ["mood"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cut_to",
      description:
        "While the crew is split, turn the scene to another group (CREW WHEREABOUTS), then open the narration with the cut. Their moves since you last played them come back with it.",
      parameters: {
        type: "object",
        properties: {
          characterIds: { type: "array", items: { type: "string" }, description: "Any of the group's characterIds." },
          place: { type: "string", description: "Or the group's place, by name." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "offer_truce",
      description:
        "In a fight, when the crew member whose move it is offers a truce, surrender or ceasefire, or tells everyone to stand down. It is their action this turn. Every other crew member in the fight answers on their phone (accept or fight on); the server reads the answer and ends the fight if all accept. Narrate the offer and stop: never ask anyone to answer it.",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "The offering crew member's characterId." },
          terms: { type: "string", description: "What they offer, in a short phrase: \"lower the sword and we walk back together\"." },
        },
        required: ["characterId"],
        additionalProperties: false,
      },
    },
  },
];

const moodSchema = z.object({ mood: z.enum(COUCH_MOODS) });
const storyPointSchema = z.object({ characterId: z.string().trim().min(1) });
const advanceActSchema = z.object({ title: z.string().trim().max(80).optional() });
const objectiveSchema = z.object({ objective: z.string().trim().min(3).max(OBJECTIVE_MAX * 2), clock: z.string().trim().max(OBJECTIVE_CLOCK_MAX * 2).optional() });
const repaintSchema = z.object({ change: z.string().trim().min(3).max(300) });
const cutSchema = z.object({ characterIds: z.array(z.string().trim().min(1)).max(6).optional(), place: z.string().trim().max(80).optional() });

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
  // A fight is resolved before the story moves on (docs/couch-mode-spec.md
  // 2.11): an act turned mid-fight put the new act's title and agendas over
  // a creature still on the TV.
  if (getActiveEncounter(campaign.id)) {
    return { error: "A fight is still on: the act turns once it is over (the last enemy falls, or end_encounter).", refused: "rules" };
  }
  const before = getCouchForge(campaign.id)?.act ?? 0;
  const act = advanceCouchAct(campaign.id, args.title ?? "");
  if (act === before) {
    return { error: `${actName(act)} is the last act: land the ending instead.`, refused: "rules" };
  }
  // The old act's objective leaves the screens with it.
  publishCouchObjective(campaign);
  // A new act's foes and finds join the map.
  publishCouchSite(campaign);
  return {
    ok: true,
    act: actName(act),
    note: `${actName(act)} is in force; every crew member now holds that act's agenda (CREW AGENDAS from the next turn). Open the act in motion and call set_objective with what the crew must do now.`,
  };
}

export function handleSetObjective(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "The objective belongs to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof objectiveSchema>;
  try {
    args = objectiveSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: set_objective needs the objective in a few words, and optionally a short clock.", retry: true };
  }
  const objective = stateCouchObjective(campaign, args.objective, args.clock ?? "");
  if (!objective) {
    return { error: "The night is not ready yet; set the objective once the story has begun.", retry: true };
  }
  return { ok: true, objective: objective.text, ...(objective.clock ? { clock: objective.clock } : {}), note: "Every screen shows it now; no need to repeat it word for word in the narration." };
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

export function handleRepaintPlace(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Place pictures belong to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof repaintSchema>;
  try {
    args = repaintSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: repaint_place needs a few words on what changed.", retry: true };
  }
  const place = getCurrentLocation(campaign.id);
  if (!place) {
    return { error: "The crew is nowhere yet; call move_party first.", retry: true };
  }
  if (!markPlaceChanged(place.id, args.change)) {
    return { ok: true, note: `${place.name} has no picture yet; the next picture there paints it as it is now.` };
  }
  return { ok: true, note: `The next picture repaints ${place.name} as it is now. Narrate the change as usual.` };
}

export function handleSetMood(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "The mood belongs to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof moodSchema>;
  try {
    args = moodSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: `Invalid arguments: set_mood needs a mood, one of ${COUCH_MOODS.join(", ")}.`, retry: true };
  }
  const now = stateCouchMood(campaign, args.mood);
  if (now !== args.mood) {
    return { ok: true, mood: now, note: `The music stays on ${now} a few seconds more; ${args.mood} is noted as the scene's mood.` };
  }
  return campaign.gameSettings.ambienceEnabled
    ? { ok: true, mood: now, music: moodCue(now, getCouchForge(campaign.id)?.act ?? 0) }
    : { ok: true, mood: now, note: "The table's sound is off; the mood is noted." };
}

export function handleCutTo(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Cutting between groups belongs to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof cutSchema>;
  try {
    args = cutSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: cut_to needs a group's characterIds or its place.", retry: true };
  }
  const groups = couchGroups(campaign);
  if (!groups) {
    return { error: "The crew is nowhere yet; call move_party first.", retry: true };
  }
  const plan = planCut({ groups, characterIds: args.characterIds ?? [], place: args.place ?? "", fightOn: Boolean(getActiveEncounter(campaign.id)) });
  if (!plan.ok) {
    return plan.refused ? { error: plan.error, refused: plan.refused } : { error: plan.error, retry: true };
  }
  if (plan.group.inScene) {
    return { ok: true, scene: plan.group.placeName, note: `The scene is already with ${plan.group.members.map((member) => member.name).join(", ")} in ${plan.group.placeName}.` };
  }
  const waiting = offSceneWaits(campaign, groups).find((entry) => entry.placeId === plan.group.placeId);
  cutCouchScene(campaign, plan.group);
  const who = plan.group.members.map((member) => member.name).join(", ");
  return {
    ok: true,
    scene: plan.group.placeName,
    note: [
      `The scene is with ${who} in ${plan.group.placeName}. Open with the cut, and narrate only them.`,
      waiting?.moves.length ? `Their moves since you last played them: ${heldMovesLine(waiting.moves)}` : "They have sent no move since; ask them what they do.",
    ].join(" "),
  };
}
