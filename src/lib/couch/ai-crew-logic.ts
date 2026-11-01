// AI crewmates, the pure half (src/lib/couch/ai-crew.ts is the rest): a
// night started with fewer people than its story's crew has the AI play the
// cards the phones leave. No imports, so the couch suites load it directly.

// The id prefix of an AI crewmate's seat. Under 'comp_' so the upstream
// sweeps that keep companions' owner rows out of the admin's lists and
// delete them with their campaign keep these too.
export const AI_CREW_USER_PREFIX = "comp_crew_";

export function isAiCrewUserId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(AI_CREW_USER_PREFIX);
}

// The cards the AI takes when the host begins: the free ones, in the
// story's order (the first cards carry the story's ties and its hidden
// role), as many as the night has AI crewmates.
export function aiCrewCards<T extends { position: number; claimedBy: string | null }>(cards: readonly T[], aiCrew: number): T[] {
  return [...cards]
    .filter((card) => !card.claimedBy)
    .sort((a, b) => a.position - b.position)
    .slice(0, Math.max(0, aiCrew));
}

// How many more people the lobby waits on before the host may begin: the
// free cards beyond what the AI will take.
export function peopleStillNeeded(freeCards: number, aiCrew: number): number {
  return Math.max(0, freeCards - Math.max(0, aiCrew));
}

// The AI seats that already hold a card, out of those the night asked for:
// the AI takes cards once, at Begin, so a lobby read after it counts none
// still to come.
export function aiCrewStillToSeat(aiCrew: number, seated: number): number {
  return Math.max(0, aiCrew - seated);
}
