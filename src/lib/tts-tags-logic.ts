import { words } from "@/lib/language/text-logic";

// Audio tags (docs/couch-mode-spec.md 2.5): ElevenLabs' expressive models
// read a short direction in square brackets, "[whispers] Get down.", and
// change the delivery instead of saying the words. Every other speech server
// reads the tag aloud ("whispers. Get down."), so it is cut before they hear
// it. A tag also has to stay with the words it directs: a clip that is
// nothing but a tag is refused by ElevenLabs (input_text_empty, which fails
// the whole passage) and is noise anywhere else. Pure, so
// scripts/test-tts-segments.mjs drives it directly.

// Lower-case words with spaces and light punctuation, the way ElevenLabs
// writes them: [whispers], [clears throat], [laughs softly]. A roll marker
// ([roll:...]) or a bracketed name ([Kara]) is not a tag.
const TAG = "\\[[a-z][a-z ,'-]{1,30}\\]";
const TAGS = new RegExp(TAG, "g");
// A tag with the spaces before it, so cutting it leaves "Go." and not " Go.".
const SPACED_TAGS = new RegExp(`[^\\S\\n]*${TAG}`, "g");
const TRAILING_TAGS = new RegExp(`(?:\\s*${TAG})+\\s*$`);

export function stripAudioTags(text: string): string {
  if (!text.includes("[")) {
    return text;
  }
  return text.replace(SPACED_TAGS, "").trim();
}

// Whether a clip has anything to say once its tags are set aside.
export function hasSpokenWords(text: string): boolean {
  return words(stripAudioTags(text)).length > 0;
}

// The parts of a passage with every tag kept beside the words it directs. A
// tag that ends a part (the narrator's "Kara leans in. [whispers]" before
// her quoted line) moves to the start of the next part, where its words
// are; a part that is only tags gives them all to the next one; a tag left
// at the very end directs nothing and is dropped.
export function carryAudioTags<T extends { text: string }>(parts: readonly T[]): T[] {
  const out: T[] = [];
  let carried = "";
  for (const part of parts) {
    let text = carried ? `${carried} ${part.text}` : part.text;
    carried = "";
    const trailing = TRAILING_TAGS.exec(text);
    if (trailing) {
      carried = trailing[0].trim();
      text = text.slice(0, trailing.index).trim();
    }
    if (hasSpokenWords(text)) {
      out.push({ ...part, text });
    } else {
      carried = [...(text.match(TAGS) ?? []), carried].filter(Boolean).join(" ");
    }
  }
  return out;
}
