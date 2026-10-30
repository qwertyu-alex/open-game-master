// What a picture run of the agent program is told, and which reference
// pictures ride with it (src/lib/harness/images.ts). Pure, so
// scripts/test-picture-references.mjs can pin the words.
//
// References are how a couch-mode table keeps its faces from one turn's
// picture to the next (docs/couch-mode-spec.md 2.4): the program is handed
// the crew's portraits with the scene, and told who each one is. Words
// alone ("a tall woman with a shaved head") gave a different woman every
// picture.

import type { AspectPreset, ImageMode } from "@/lib/types";

// Four faces or places is what a scene shot holds (three people and the
// room); more pictures only dilute each one's hold on the result.
export const MAX_PICTURE_REFERENCES = 4;

export type PictureReference = {
  // A picture on this machine, as an absolute path: a portrait, or a
  // place's establishing shot.
  path: string;
  // Who or what it shows, as the prompt names them ("Kara Voss").
  label: string;
  // A person keeps their face; a place its layout and light.
  kind?: "person" | "place";
};

const ASPECT_WORDS: Record<AspectPreset, string> = {
  square: "square (1:1)",
  portrait: "portrait (2:3, taller than wide)",
  landscape: "landscape (3:2, wider than tall)",
};

const PICTURE_FILE = /\.(png|jpe?g|webp)$/i;

// The references a run can carry: pictures only, each once, each named, at
// most MAX_PICTURE_REFERENCES. A label is the caller's (a character's name)
// and lands in the prompt, so it is flattened and cut short.
export function pictureReferences(references: readonly PictureReference[] | undefined): PictureReference[] {
  const kept: PictureReference[] = [];
  const seen = new Set<string>();
  for (const reference of references ?? []) {
    const label = reference.label.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!label || !PICTURE_FILE.test(reference.path) || seen.has(reference.path)) {
      continue;
    }
    seen.add(reference.path);
    kept.push({ path: reference.path, label, kind: reference.kind === "place" ? "place" : "person" });
    if (kept.length === MAX_PICTURE_REFERENCES) {
      break;
    }
  }
  return kept;
}

// The run's standing instruction. With references it adds one sentence: a
// model handed a portrait tends to return that portrait retouched, and the
// table wants the scene, with that face in it.
export function picturePrompt(hasReferences: boolean): string {
  return [
    "You make one picture for a tabletop role-playing game. Use your image generation tool exactly once to draw what is asked, then reply with the single word done. Do not use any other tool.",
    hasReferences
      ? "The attached pictures are references for who and where: draw the new scene asked for with those people in it, never a copy of a reference."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// The run's one message. The pictures are attached in the order given, so
// "Reference 1" is the first attached picture.
export function pictureRequest(options: {
  prompt: string;
  aspect: AspectPreset;
  mode?: ImageMode;
  negative?: string;
  references?: readonly PictureReference[];
}): string {
  const references = options.references ?? [];
  return [
    ...references.map((reference, index) =>
      reference.kind === "place"
        ? `Reference ${index + 1} is ${reference.label}: keep the place's layout, materials and lighting.`
        : `Reference ${index + 1} is ${reference.label}: keep their face, hair, skin tone, build and clothing exactly, so they are recognisably the same person. Take the pose, framing and background from the scene, not from the reference.`,
    ),
    `Draw: ${options.prompt}`,
    `Shape: ${ASPECT_WORDS[options.aspect]}.`,
    options.mode === "fast"
      ? "Prioritize speed: use the lowest supported image quality (low) and the smallest supported size that keeps the requested shape. Make one image without refinement passes. Preserve reference identities and clear composition."
      : "",
    options.negative ? `Leave out: ${options.negative}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
