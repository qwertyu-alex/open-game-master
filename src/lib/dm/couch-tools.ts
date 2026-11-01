import { z } from "zod";
import type { Campaign } from "@/lib/db/campaigns";
import { advanceCouchAct, awardStoryPoint, isCouchCrew } from "@/lib/couch/play";
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
import { readActRecap, RECAP_POINT_MAX, RECAP_POINTS_MAX } from "@/lib/couch/act-break-logic";
import { springCouchBeat } from "@/lib/couch/tension";
import { requestCouchEnding } from "@/lib/couch/finale";
import { BEAT_KINDS, BEATS_PER_ACT } from "@/lib/couch/tension-logic";
import { runHiddenEffect } from "@/lib/couch/hidden-effects";
import { adjustCouchStress } from "@/lib/couch/stress";
import { HIDDEN_EVERY_MAX, HIDDEN_EVERY_MIN, HIDDEN_NAME_MAX, HIDDEN_STAGE_MAX, HIDDEN_STAGES_MAX, HIDDEN_STAGES_MIN, HIDDEN_TRUTH_MAX } from "@/lib/couch/hidden-effects-logic";

// A couch night's two story levers (docs/couch-mode-spec.md 2.2): turning
// the act, which hands every crew member their next secret agenda on their
// phone and puts the act's title on the TV, and with it the act's story
// points. Without it the agendas the forge wrote for acts II and III never
// reach anyone and pursuing one earns nothing, which is the hook that makes
// players chase them. Offered only at a couch table (dmTurnTools).
//
// Story points follow ALIEN's cinematic rule (Starter Set rulebook, p. 26
// and 35): at the end of each act the GM judges every crew member once, and
// one who took specific actions toward that act's agenda despite personal
// risk or sacrifice earns one point; nobody holds more than three. A tool
// the GM could call any time (award_story_point) was called on every turn of
// one torch job, three points in three minutes for a single scene; judged
// once per act, a point means the act's agenda was chased. The host keeps
// award_story_point in their tool panel (src/lib/dm/catalog-world.ts) for a
// correction; the GM is not offered it.
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
// And the beat (src/lib/couch/tension.ts): attacks and damage already tell
// the tension clock something came at the crew, but a breach, a betrayal or
// a sign of the threat is only prose until the GM logs it, and a strike the
// clock never heard was struck again the next reply.
//
// And the objective (src/lib/couch/pacing.ts): what the crew must do now,
// on the TV and every phone, so the room always knows what it is playing
// for. Without it a night drifted through ninety minutes of "what do you
// do?" with nobody sure what the scene wanted (2026-10-30).

//
// And the end (src/lib/couch/finale.ts): only the GM knows when the story
// has landed. Without it a night's ending was narrated and then went on,
// the GM still told to land it, until the host found End session on the
// upstream screens; the reveal of agendas and hidden roles never came.

export const COUCH_TOOL_NAMES = ["advance_act", "set_objective", "award_story_point", "repaint_place", "set_mood", "cut_to", "offer_truce", "spring_beat", "end_night", "hidden_effect", "adjust_stress"] as const;

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
        "Turn the one-shot to its next act once the current act's goal is met or lost. Judge each crew member's agenda for the act that ended: earned names who took specific actions toward it despite personal risk or sacrifice, and each earns one story point (three held at most). The TV shows the story so far (your recap) and who earned a point, the narrator reads them aloud with a reminder of the new agendas, then the new act's title shows, and each phone gets its next secret agenda. Call it once, at the act break, then narrate the cut into the new act.",
      parameters: {
        type: "object",
        properties: {
          recap: {
            type: "array",
            items: { type: "string" },
            maxItems: RECAP_POINTS_MAX,
            description: `The story points of the act that just ended, for the TV and your later turns: 2 to ${RECAP_POINTS_MAX} short past-tense lines of what the room saw happen and what it cost ("The beacon led the crew to the derelict Sulaco", "Rook was dragged into the vents"), each under ${RECAP_POINT_MAX} characters. Public: never an agenda, a hidden role or a truth the crew has not found.`,
          },
          earned: {
            type: "array",
            items: { type: "string" },
            description: "The characterIds from CREW AGENDAS of everyone who chased their agenda for the act that ended at real risk or cost; [] when nobody did. Talking about it, or doing it safely, earns nothing.",
          },
          title: { type: "string", description: "Optional: a few words for the TV under the act number; blank uses the scenario's own act title." },
        },
        required: ["recap", "earned"],
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
  {
    type: "function",
    function: {
      name: "spring_beat",
      description:
        "Mark a beat you play this reply: a deck beat by its number, or one you improvise by its kind (sign: a trace of the threat; human: someone presses a demand; strike: something comes at the crew). It never restarts TENSION: only dice that can hurt do (apply_hazard, an attack, start_encounter, damage or a condition on crew).",
      parameters: {
        type: "object",
        properties: {
          beat: { type: "integer", minimum: 1, maximum: BEATS_PER_ACT, description: "The beat's number in this act's deck, as TENSION names it." },
          kind: { type: "string", enum: [...BEAT_KINDS], description: "For a beat not from the deck." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_night",
      description:
        "End the one-shot, in act III once the ending has landed: the crew escaped, won, or was lost. Call it in the reply that narrates the ending; once that passage has played, the TV runs the closing (who pulled off their agenda, the hidden role, your review) and the phones stop taking moves. Never in a fight, never before the climax.",
      parameters: {
        type: "object",
        properties: {
          ending: { type: "string", description: "How the night ended, in one plain sentence for the closing: \"Vasquez and Hicks made the shuttle; Burke was left in the hive.\"" },
        },
        required: ["ending"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hidden_effect",
      description:
        "A secret growing in one crew member: a parasite, spores, an infection, an implant, something answering another voice. plant it unseen (from a bite, a spill, a face-hugger, a bad injection) with its stages, each a symptom the room can notice, the last the payoff. HIDDEN EFFECTS then says when each symptom is due: show it, then advance. reveal puts it on the TV when it comes out (a scan, a confession); cure ends it at a cost; payoff plays the last stage at the worst moment and, with damage, hurts through the damage rules (it can drop or kill only as damage does). Never name it aloud before it is revealed.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["plant", "advance", "reveal", "cure", "payoff"] },
          characterId: { type: "string", description: "plant: the crew member it grows in." },
          effectId: { type: "string", description: "Every other action: the effectId from HIDDEN EFFECTS." },
          name: { type: "string", description: `plant: what the room will call it once revealed ("Parasite"), under ${HIDDEN_NAME_MAX} characters.` },
          truth: { type: "string", description: `plant: what it really is and how it ends, for you alone, under ${HIDDEN_TRUTH_MAX} characters.` },
          stages: {
            type: "array",
            minItems: HIDDEN_STAGES_MIN,
            maxItems: HIDDEN_STAGES_MAX,
            items: { type: "string", maxLength: HIDDEN_STAGE_MAX },
            description: "plant: the symptoms in order, the last the payoff (\"a dry cough\", \"a fever and a bulge under the ribs\", \"it tears out of the chest\").",
          },
          everyReplies: { type: "integer", minimum: HIDDEN_EVERY_MIN, maximum: HIDDEN_EVERY_MAX, description: "plant: your replies each stage holds before the next is due; default 6." },
          damage: { type: "string", description: "payoff: the damage dice it does to its host (\"4d10\"), if it hurts." },
          damageType: { type: "string", description: "payoff: the damage type (piercing, poison, acid)." },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_stress",
      description:
        "Move crew members' stress (STRESS) for what only you can judge: +1 or +2 when they see something horrible (a body opened from inside, the creature itself, a friend taken), -1 when they truly rest or someone talks them down in a breather. Wounds, a crewmate falling and pushed rolls already add it on their own. Stress dice make them stronger on checks and saves and can set off panic.",
      parameters: {
        type: "object",
        properties: {
          characterIds: { type: "array", minItems: 1, items: { type: "string" }, description: "The crew members who saw it, or who rest." },
          amount: { type: "integer", minimum: -3, maximum: 3, description: "+1 or +2 for a horror, -1 for rest; never 0." },
          reason: { type: "string", description: "What did it, in a few words." },
        },
        required: ["characterIds", "amount"],
        additionalProperties: false,
      },
    },
  },
];

const moodSchema = z.object({ mood: z.enum(COUCH_MOODS) });
const storyPointSchema = z.object({ characterId: z.string().trim().min(1) });
const advanceActSchema = z.object({ title: z.string().trim().max(80).optional(), recap: z.unknown().optional(), earned: z.array(z.string().trim().min(1)).max(12).optional() });
const objectiveSchema = z.object({ objective: z.string().trim().min(3).max(OBJECTIVE_MAX * 2), clock: z.string().trim().max(OBJECTIVE_CLOCK_MAX * 2).optional() });
const repaintSchema = z.object({ change: z.string().trim().min(3).max(300) });
const beatSchema = z.object({ beat: z.coerce.number().int().min(1).max(BEATS_PER_ACT).optional(), kind: z.enum(BEAT_KINDS).optional() });
const cutSchema = z.object({ characterIds: z.array(z.string().trim().min(1)).max(6).optional(), place: z.string().trim().max(80).optional() });
const stressSchema = z.object({
  characterIds: z.array(z.string().trim().min(1)).min(1).max(8),
  amount: z.coerce.number().int().min(-3).max(3).refine((value) => value !== 0),
  reason: z.string().trim().max(200).optional(),
});
const hiddenSchema = z.object({
  action: z.enum(["plant", "advance", "reveal", "cure", "payoff"]),
  characterId: z.string().trim().min(1).optional(),
  effectId: z.string().trim().min(1).optional(),
  name: z.string().trim().max(HIDDEN_NAME_MAX * 2).optional(),
  truth: z.string().trim().max(HIDDEN_TRUTH_MAX * 2).optional(),
  stages: z.array(z.string().max(HIDDEN_STAGE_MAX * 2)).max(HIDDEN_STAGES_MAX * 2).optional(),
  everyReplies: z.coerce.number().int().min(HIDDEN_EVERY_MIN).max(HIDDEN_EVERY_MAX).optional(),
  damage: z.string().trim().max(30).optional(),
  damageType: z.string().trim().max(30).optional(),
});
const endSchema = z.object({ ending: z.string().trim().min(3).max(600) });

export function handleEndNight(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Ending the night belongs to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof endSchema>;
  try {
    args = endSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: end_night needs the ending in one plain sentence.", retry: true };
  }
  const act = getCouchForge(campaign.id)?.act ?? 0;
  if (act < 2) {
    return { error: `The night ends in Act III; this is ${actName(act)}. Play on, and call advance_act when this act's goal is won or lost.`, refused: "rules" };
  }
  if (getActiveEncounter(campaign.id)) {
    return { error: "A fight is still on: the night ends once it is over (the last enemy falls, or end_encounter).", refused: "rules" };
  }
  if (!requestCouchEnding(campaign, args.ending)) {
    return { ok: true, note: "The night is already over." };
  }
  return {
    ok: true,
    note: "The night ends after this reply. Make this passage the ending: the final image, who is left and what it cost, in a few sentences, with no question and no choice to the crew. Never reveal agendas or the hidden role; the closing reveals them next.",
  };
}

export function handleAdvanceAct(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Acts belong to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof advanceActSchema>;
  try {
    args = advanceActSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: advance_act takes the act's recap as a list of short story points, earned as a list of characterIds, and at most a short title.", retry: true };
  }
  // A fight is resolved before the story moves on (docs/couch-mode-spec.md
  // 2.11): an act turned mid-fight put the new act's title and agendas over
  // a creature still on the TV.
  if (getActiveEncounter(campaign.id)) {
    return { error: "A fight is still on: the act turns once it is over (the last enemy falls, or end_encounter).", refused: "rules" };
  }
  const before = getCouchForge(campaign.id)?.act ?? 0;
  const recap = readActRecap(args.recap);
  const earned = [...new Set(args.earned ?? [])];
  // Checked before the act turns: a wrong id would otherwise cost its owner
  // the act's point with no second call to fix it.
  const strangers = earned.filter((id) => !isCouchCrew(campaign.id, id));
  if (strangers.length) {
    return { error: `Not a living crew member at this table: ${strangers.join(", ")}. earned takes characterIds from CREW AGENDAS.`, retry: true };
  }
  const act = advanceCouchAct(campaign.id, args.title ?? "", recap, earned);
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
    ...(recap.length ? { recap } : {}),
    note: `${actName(act)} is in force; every crew member now holds that act's agenda (CREW AGENDAS from the next turn). The TV shows the act break and the narrator reads it aloud: ${recap.length ? "the story so far, " : ""}who earned a story point, and the reminder that new agendas are on their phones. Do not repeat any of it. Narrate on from there like a film: a cut ahead past travel and waiting ("Six hours later..."), then open the new act in motion. Call set_objective with what the crew must do now.`,
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

export function handleSpringBeat(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Beats belong to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof beatSchema>;
  try {
    args = beatSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: spring_beat takes a beat number from TENSION, or a kind (sign, human or strike).", retry: true };
  }
  const sprung = springCouchBeat(campaign, args);
  if (!sprung.ok) return { error: sprung.error, retry: true };
  return {
    ok: true,
    kind: sprung.kind,
    ...(sprung.beat ? { beat: sprung.beat } : {}),
    note:
      sprung.kind === "sign"
        ? "Marked. Dread builds; the clock keeps running toward the next strike."
        : "Marked. A strike lands only with dice: apply_hazard on named crew, an attack or start_encounter. Until then the clock keeps running.",
  };
}

export function handleHiddenEffect(campaign: Campaign, turnId: string, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Hidden effects belong to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof hiddenSchema>;
  try {
    args = hiddenSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: hidden_effect needs an action (plant, advance, reveal, cure, payoff) and, to plant, a characterId, a name and its stages.", retry: true };
  }
  return runHiddenEffect(campaign, turnId, args);
}

export function handleAdjustStress(campaign: Campaign, rawArguments: string): ToolResult {
  if (!campaign.gameSettings.couchMode) {
    return { error: "Stress belongs to a couch one-shot; this table has none.", refused: "rules" };
  }
  let args: z.infer<typeof stressSchema>;
  try {
    args = stressSchema.parse(JSON.parse(rawArguments || "{}"));
  } catch {
    return { error: "Invalid arguments: adjust_stress needs characterIds and an amount from -3 to 3 (not 0).", retry: true };
  }
  const changed = adjustCouchStress(campaign, args.characterIds, args.amount);
  if (!changed.length) return { error: "None of those is a living crew member: use characterIds from GAME STATE.", retry: true };
  return { ok: true, stress: changed.map((entry) => `${entry.name} ${entry.stress}`).join(", "), note: "Every screen shows it. Let it show in how they speak and move; never read the number aloud." };
}
