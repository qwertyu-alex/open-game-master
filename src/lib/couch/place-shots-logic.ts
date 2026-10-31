// A place's establishing shot (docs/couch-navigation.md "Pictures of the
// places"): the wide, empty picture painted the first time the crew stands
// somewhere, kept with the place so the phones' map can show it again, the
// TV can put it straight back up when the crew returns, every later picture
// there is painted from it, and the GM knows what everyone saw. Pure, for
// scripts/test-couch-place-shots.mjs; src/lib/couch/place-shots.ts stores it
// and runs the look at the picture.

export type PlaceShot = {
  locationId: string;
  url: string;
  // The planner's frame: what the picture was painted from.
  frame: string;
  // What a model looking at the finished picture says is in it; "" until
  // it has looked, or when it could not. The picture invents details the
  // words never had (a valve, a stain), and this is where the GM learns them.
  seen: string;
  // The GM said the place changed (repaint_place): what changed, else "".
  // The next picture there repaints it.
  change: string;
  stale: boolean;
};

// What a phone's map and the TV carry of a place's picture.
export type PlacePicture = { url: string; seen: string; placeId: string };

const SEEN_MAX_CHARS = 700;
const CHANGE_MAX_CHARS = 200;

// The place owes an establishing shot: none yet, or the GM asked for a new one.
export function owesEstablishingShot(shot: Pick<PlaceShot, "stale"> | null): boolean {
  return !shot || shot.stale;
}

// A place the GM asked to repaint keeps its old picture until the new one
// lands.
export function placePicture(shot: PlaceShot | null): PlacePicture | null {
  return shot?.url ? { url: shot.url, seen: shotWords(shot), placeId: shot.locationId } : null;
}

// The words for a place's picture: what was seen in it, else what it was
// painted from.
export function shotWords(shot: Pick<PlaceShot, "seen" | "frame">): string {
  return (shot.seen || shot.frame).replace(/\s+/g, " ").trim();
}

export function cleanChange(change: string): string {
  return clip(change.replace(/\s+/g, " ").trim(), CHANGE_MAX_CHARS);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  return sentence > max / 2 ? cut.slice(0, sentence + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

export const PLACE_SEEN_SYSTEM = [
  "You look at a picture from a tabletop role-playing game: the establishing shot of a place the players just entered. Describe what is in it so the game master can keep the story consistent with what the players saw.",
  "Answer in English, in plain prose under 110 words, with no heading or list: the shape and size of the place, the light, the notable fixtures, objects, openings and exits, any marks, damage or signs of something wrong, and where things are (left, right, ahead, overhead).",
  "Say only what is visible. Do not invent a story or name the people who will come.",
  "If no picture is attached, answer exactly: NO PICTURE",
].join("\n");

export function placeSeenInput(placeName: string, frame: string): string {
  return [
    `PLACE: ${placeName.trim() || "unnamed"}`,
    `IT WAS PAINTED FROM: ${frame.replace(/\s+/g, " ").trim() || "(unknown)"}`,
    "",
    "Describe what the attached picture shows.",
  ].join("\n");
}

// The look's answer, or null when there is none to keep: the model could not
// see the picture, or said too little to be a description.
export function parseSeenReply(reply: string): string | null {
  const text = reply.replace(/^\s*#+.*$/gm, "").replace(/\s+/g, " ").trim();
  if (!text || /NO PICTURE/i.test(text) || /\[a picture was shared here\]/i.test(text) || text.length < 40) {
    return null;
  }
  return clip(text, SEEN_MAX_CHARS);
}

// The planner's brief for an establishing shot: the whole place, nobody in
// it. A repaint keeps the place's layout (its old picture rides as a
// reference) and shows what changed.
export function establishingNote(change: string): string {
  return [
    "ESTABLISHING SHOT: the crew has just arrived here, so this picture introduces the place itself. Frame a wide shot of the whole room or area, empty of people: its shape, its light, its fixtures, its exits and anything wrong with it. Answer shot wide and subjects [].",
    ...(change ? [`THE PLACE HAS CHANGED: ${change}. Show the same place as it is now.`] : []),
  ].join("\n");
}

// The frame when the planner cannot be asked: the place's own description.
export function establishingFallback(placeName: string, layout: string, passageFrame: string): string {
  const where = [placeName.trim(), layout.replace(/\s+/g, " ").trim().replace(/[.!?…]+$/, "")].filter(Boolean).join(": ");
  return clip(`The whole of ${where || passageFrame}, empty of people.`, 600);
}
