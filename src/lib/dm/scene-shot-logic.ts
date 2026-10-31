// Couch mode's picture of every GM turn (docs/couch-mode-spec.md 2.4): what
// the camera sees at the moment a passage ends, who is in frame, and the
// words the picture is painted from. Pure, no database or model call, so
// scripts/test-scene-shot.mjs imports it directly; src/lib/dm/scene-shot.ts
// reads the table and asks the utility model.
//
// A passage handed to the image model whole was a plot summary, and the
// model painted a collage of everything that happened in it. A shot is one
// frame: the planner says what that frame holds, and when it cannot be
// asked (or answers nonsense) the passage's last two paragraphs and the
// people they name stand in.
//
// A thing found in a room already on screen (a mechanism behind a panel, a
// letter in a drawer) is an insert: a close picture of that thing alone,
// shown beside the room's picture rather than in its place. Before, a new
// picture could only replace the room, so the planner framed the finder's
// face and the find was never shown.

import { isOocAnswer } from "@/lib/dm/ooc-question";
import { textKey } from "@/lib/language/text-logic";

export const SHOT_KINDS = ["wide", "medium", "close", "insert"] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

export type SceneShot = {
  shot: ShotKind;
  // Sheet or NPC ids in frame, most important first.
  subjects: string[];
  // What the camera sees, in English, without the art style.
  prompt: string;
};

// How a painted scene picture was framed, kept with it
// (GeneratedImage.shot): the next turn's planner reads it as what is on
// screen, and the screens tell the place from an insert beside it.
export type PictureShot = {
  kind: ShotKind;
  // What the camera saw, without the style, the looks or the art direction.
  frame: string;
  // The place it was painted in. A picture of the place the party left is
  // not one a find can sit beside.
  placeId?: string;
  // The place's establishing shot: wide, empty, and kept with the place
  // (src/lib/couch/place-shots.ts).
  establishing?: true;
};

// What the screen shows: the stage (the place, the newest picture that is
// not an insert) and an insert beside it while one is newer than the
// stage. A new stage picture retires the insert; a newer insert replaces
// it. Pictures without a recorded shot (a person's upload, the narrator's
// generate_image, a picture from before shots were kept) are stages.
export type ScenePicture = { url: string; shot?: PictureShot };

export function sceneComposition<T extends ScenePicture>(
  messages: ReadonlyArray<{ generatedImage?: T | null }>,
): { stage: T | null; insert: T | null } {
  let insert: T | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const picture = messages[index]?.generatedImage;
    if (!picture?.url) {
      continue;
    }
    if (picture.shot?.kind !== "insert") {
      return { stage: picture, insert };
    }
    insert ??= picture;
  }
  return { stage: null, insert };
}

// The planner's line for what is on screen: the stage's frame while it
// shows the place the party is in, else null (nothing of this place yet, so
// the next picture must show the place, not a detail of it). A stage with
// no recorded frame or place is taken as this place, by its stored words.
export function onScreenFrame(stage: { prompt?: string; shot?: PictureShot } | null, placeId: string | null): string | null {
  if (!stage) {
    return null;
  }
  if (stage.shot?.placeId && placeId && stage.shot.placeId !== placeId) {
    return null;
  }
  const frame = (stage.shot?.frame ?? stage.prompt ?? "").replace(/\s+/g, " ").trim();
  return frame ? clip(frame, ON_SCREEN_MAX_CHARS) : "a picture of this place";
}

// An insert stands beside the place in a square, so the thing found is not
// cropped away to fit a wide frame. Every other shot keeps its request's
// shape.
export function shotAspect(shot: ShotKind): "square" | undefined {
  return shot === "insert" ? "square" : undefined;
}

// Someone the camera can put in frame: a crew member's sheet or an NPC.
export type ShotCastMember = {
  id: string;
  name: string;
  aliases?: readonly string[];
  // The fixed look the portraits were painted from; "" when none is known.
  look: string;
};

// Three faces is as many as a reference-guided picture keeps recognisable,
// and the fourth reference slot is left for the place.
export const MAX_SHOT_SUBJECTS = 3;

// A line or two ("You wait.", a roll's result with a sentence around it)
// is not a new scene, and a picture for it would replace the one that is.
export const SCENE_SHOT_MIN_CHARS = 120;

const PROMPT_MAX_CHARS = 600;
const LOOK_MAX_CHARS = 300;
const ON_SCREEN_MAX_CHARS = 300;
// The place's layout and, once a picture of it was looked at, what it shows.
const PLACE_MAX_CHARS = 700;
// The end of a long passage is what is on screen now; the planner reads no
// more than this of it.
const PLANNER_TEXT_CHARS = 2_400;

const ROLL_MARKER = /\[roll:[^\]]*\]/g;

// The story a GM message tells, without the dice cards placed in it.
export function shotText(content: string): string {
  return content.replace(ROLL_MARKER, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Whether a GM message earns a picture of its own: story, and long enough
// to be a scene. An out-of-character answer is table talk, not a scene.
export function wantsSceneShot(content: string): boolean {
  const text = content.trim();
  return !isOocAnswer(text) && shotText(text).length >= SCENE_SHOT_MIN_CHARS;
}

function paragraphs(content: string): string[] {
  return shotText(content)
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The words a passage could call someone by: their full name, an alias, or
// one capitalised part of the name ("Kara" or "Voss" for Kara Voss). Case
// matters, so the crew's Hope is not found in "they hope".
function callingNames(member: ShotCastMember): string[] {
  const whole = [member.name, ...(member.aliases ?? [])].map((name) => name.trim()).filter(Boolean);
  const parts = member.name.split(/\s+/).filter((part) => part.length >= 3 && /^\p{Lu}/u.test(part));
  return [...new Set([...whole, ...parts])];
}

// Where a passage first names someone, or -1.
function firstMention(text: string, member: ShotCastMember): number {
  let first = -1;
  for (const name of callingNames(member)) {
    const found = new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, "u").exec(text);
    if (found && (first < 0 || found.index < first)) {
      first = found.index;
    }
  }
  return first;
}

// The cast a passage names, in the order it first names them.
export function mentionedCast<T extends ShotCastMember>(text: string, cast: readonly T[]): T[] {
  return cast
    .map((member) => ({ member, at: firstMention(text, member) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.member);
}

// Quoted speech is heard, not seen, and an image model letters what it is
// given in quotes.
function withoutDialogue(text: string): string {
  return text
    .replace(/“[^”]*”/g, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  return sentence > max / 2 ? cut.slice(0, sentence + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

// The shot when the planner cannot be asked: the last two paragraphs are
// the moment the passage ends on, and the people they name are in frame.
export function heuristicShot(content: string, cast: readonly ShotCastMember[]): SceneShot {
  const recent = paragraphs(content).slice(-2).join("\n\n");
  const subjects = mentionedCast(recent, cast).slice(0, MAX_SHOT_SUBJECTS);
  const prompt = clip(withoutDialogue(recent) || recent.replace(/\s+/g, " "), PROMPT_MAX_CHARS);
  return { shot: subjects.length ? "medium" : "wide", subjects: subjects.map((member) => member.id), prompt };
}

export const SHOT_PLANNER_SYSTEM = [
  "You are the camera for the pictures of a tabletop role-playing game. Read the newest narration and describe the single frame of film that shows the moment it ends on: who is in frame, where, doing what, with what expression, the light and the mood. It is one frame, not a summary of everything that happened.",
  'Answer with one JSON object and nothing else: {"shot": "wide" | "medium" | "close" | "insert", "subjects": ["c1"], "prompt": "..."}',
  "- shot: wide for a place or a group in it, medium for one to three people acting, close for one face reacting, insert for an object or a detail.",
  "- An insert is shown beside the picture ON SCREEN NOW, which stays up; every other shot replaces it.",
  "- When the narration reveals something found, opened, read or examined in the place on screen (a mechanism, a clue, a message, a mark, an object), answer insert and frame that thing alone, close and clearly lit, even when the narration ends on someone deciding what to do next. The place and the people are already on screen.",
  "- When ON SCREEN NOW is none, or the narration moves somewhere new or brings someone or something new in, never answer insert: show the place and who is in it.",
  `- subjects: the refs from CAST of the people visible in the frame, most important first, at most ${MAX_SHOT_SUBJECTS}; [] when nobody in the cast is visible, and always [] for an insert.`,
  "- prompt: in English, under 80 words: what the camera sees, naming the subjects and saying what each does. No dialogue, no lettering or signs, no art style or medium.",
  "- Horror is implied, never shown: shadows, silhouettes, aftermath, a face reacting, something just out of frame. Never gore, wounds or bodies in detail.",
].join("\n");

// The planner's question: who it may name, where they are, what the screen
// shows now, and the end of the passage. Refs (c1, c2) stand for the ids,
// which the model would only garble. `onScreen` is onScreenFrame's line.
// `brief` is a standing instruction for this one picture (an establishing
// shot's, src/lib/couch/place-shots-logic.ts).
export function shotPlannerInput(content: string, cast: readonly ShotCastMember[], place = "", onScreen: string | null = null, brief = ""): string {
  const text = shotText(content);
  const end = text.length > PLANNER_TEXT_CHARS ? `…${text.slice(-PLANNER_TEXT_CHARS)}` : text;
  return [
    "CAST:",
    ...(cast.length ? cast.map((member, index) => `- c${index + 1}: ${member.name}`) : ["(nobody)"]),
    ...(place.trim() ? ["", `PLACE: ${clip(place.replace(/\s+/g, " ").trim(), PLACE_MAX_CHARS)}`] : []),
    "",
    `ON SCREEN NOW: ${onScreen?.trim() || "none"}`,
    ...(brief.trim() ? ["", brief.trim()] : []),
    "",
    "NARRATION:",
    end,
  ].join("\n");
}

function jsonObjectIn(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The planner's answer, checked: a known shot, subjects that are the cast's
// (by ref, id or name; anyone else is dropped), and a prompt with words in
// it. Null for anything unreadable, and the heuristic stands in.
//
// An insert has nobody in it: a face passed as a reference would paint the
// person instead of the thing. With nothing of this place on screen
// (`onScreen` false) there is no picture for an insert to sit beside, so the
// same frame is painted as a close-up that stands on its own.
export function parseShotReply(reply: string, cast: readonly ShotCastMember[], { onScreen = true } = {}): SceneShot | null {
  const raw = jsonObjectIn(reply);
  if (!raw) {
    return null;
  }
  const said = String(raw.shot ?? "").trim().toLowerCase();
  const prompt = typeof raw.prompt === "string" ? raw.prompt.replace(/\s+/g, " ").trim() : "";
  if (!(SHOT_KINDS as readonly string[]).includes(said) || prompt.length < 12) {
    return null;
  }
  const shot = said === "insert" && !onScreen ? "close" : said;
  const named = (entry: string): ShotCastMember | undefined => {
    const ref = /^c(\d+)$/i.exec(entry);
    if (ref) {
      return cast[Number(ref[1]) - 1];
    }
    const wanted = textKey(entry);
    return cast.find((member) => member.id === entry || textKey(member.name) === wanted);
  };
  const subjects: string[] = [];
  for (const entry of Array.isArray(raw.subjects) ? raw.subjects : []) {
    const member = typeof entry === "string" ? named(entry.trim()) : undefined;
    if (member && !subjects.includes(member.id)) {
      subjects.push(member.id);
    }
  }
  return {
    shot: shot as ShotKind,
    subjects: shot === "insert" ? [] : subjects.slice(0, MAX_SHOT_SUBJECTS),
    prompt: clip(withoutDialogue(prompt) || prompt, PROMPT_MAX_CHARS),
  };
}

const SHOT_WORDS: Record<ShotKind, string> = {
  wide: "Wide shot",
  medium: "Medium shot",
  close: "Close-up",
  insert: "Insert shot of a detail",
};

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// The words the picture is painted from, after the campaign's style: the
// frame, then each subject's fixed look so a backend that takes no
// reference pictures still paints the same people, then how danger is
// shown. Worded without the nouns it keeps out, since a diffusion model
// paints the nouns it is given, negated or not.
export function sceneShotPrompt(shot: SceneShot, cast: readonly ShotCastMember[]): string {
  const looks = shot.subjects
    .map((id) => cast.find((member) => member.id === id))
    .filter((member): member is ShotCastMember => Boolean(member?.look.trim()))
    .map((member) => sentence(`${member.name}: ${clip(member.look.replace(/\s+/g, " ").trim(), LOOK_MAX_CHARS)}`));
  return [
    sentence(`${SHOT_WORDS[shot.shot]}: ${shot.prompt}`),
    ...looks,
    "Any danger is shown by suggestion: shadows, aftermath and faces reacting.",
  ].join(" ");
}
