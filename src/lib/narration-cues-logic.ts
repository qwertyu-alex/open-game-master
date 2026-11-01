// Who is heard when in a passage's narration (docs/couch-mode-spec.md).
// The server renders a passage as clips, one per voice change
// (src/lib/tts-segments.ts), and measures each (src/lib/mp3-logic.ts); the
// TV reads the cue under its playback clock to show the speaker's face.
// Pure, and safe for the browser.

// One cue per run of clips spoken by the same person, by their name, in
// seconds from the start of the file. The narrator gets none, so a gap
// between cues is the narrator.
export type NarrationCue = { start: number; end: number; speaker: string };

const round2 = (seconds: number) => Math.round(seconds * 100) / 100;

export function narrationCues(
  requests: readonly { speaker?: string | null }[],
  seconds: readonly number[],
): NarrationCue[] {
  const cues: NarrationCue[] = [];
  let at = 0;
  requests.forEach((request, index) => {
    const length = Math.max(0, seconds[index] ?? 0);
    const speaker = request.speaker ?? null;
    const previous = cues[cues.length - 1];
    if (speaker && previous && previous.speaker === speaker && previous.end === round2(at)) {
      previous.end = round2(at + length);
    } else if (speaker && length > 0) {
      cues.push({ start: round2(at), end: round2(at + length), speaker });
    }
    at += length;
  });
  return cues;
}

// Cues as stored or sent, read defensively: anything malformed is dropped.
export function normalizeNarrationCues(raw: unknown): NarrationCue[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    const cue = entry as Partial<NarrationCue> | null;
    const start = Number(cue?.start);
    const end = Number(cue?.end);
    const speaker = typeof cue?.speaker === "string" ? cue.speaker.trim().slice(0, 120) : "";
    return speaker && Number.isFinite(start) && Number.isFinite(end) && end > start && start >= 0 ? [{ start, end, speaker }] : [];
  });
}

// Who is speaking `seconds` into the take; null while the narrator is.
export function speakerAt(cues: readonly NarrationCue[], seconds: number): string | null {
  return cues.find((cue) => seconds >= cue.start && seconds < cue.end)?.speaker ?? null;
}
