export type NarrationClip = { messageId: string; url: string; keepWithNext?: boolean };

// Drop stale history on the first sound gesture, but keep the newest
// answer readout with the GM passage that follows it.
export function narrationAfterUnlock(waiting: readonly NarrationClip[]): NarrationClip[] {
  if (!waiting.length) return [];
  let start = waiting.length - 1;
  for (let index = start; index >= 0; index -= 1) {
    if (waiting[index].keepWithNext) {
      start = index;
      break;
    }
  }
  return waiting.slice(start);
}
