import type { CampaignMessage } from "@/lib/db/messages";
import { isOocAnswer } from "@/lib/dm/ooc-question";
import { stripToolText, withoutRollMarkers } from "@/lib/dm/tool-text";

export type CouchAnswer = { userId: string; characterId: string | null; name: string; content: string; passed: boolean };
export type CouchAnswers = { id: string; throughSeq: number; answers: CouchAnswer[] };

// Only the public transcript belongs on the TV. Private messages live in
// separate stores and are deliberately never inputs to this function.
export function couchRoundAnswers(
  messages: ReadonlyArray<Pick<CampaignMessage, "authorType" | "userId" | "characterId" | "content" | "seq">>,
  seats: ReadonlyArray<{ userId: string; characterId: string; name: string }>,
  passes: ReadonlyArray<{ userId: string; seq: number }>,
): CouchAnswers | null {
  const answers = new Map<string, CouchAnswer>();
  let throughSeq = 0;
  for (const message of messages) {
    if (message.authorType !== "player" || !message.userId || isOocAnswer(message.content)) continue;
    const content = withoutRollMarkers(stripToolText(message.content)).trim();
    if (!content) continue;
    const seat = seats.find((entry) => entry.characterId === message.characterId) ?? seats.find((entry) => entry.userId === message.userId);
    const earlier = answers.get(message.userId);
    if (earlier) {
      earlier.content += `\n\n${content}`;
    } else {
      answers.set(message.userId, {
        userId: message.userId, characterId: message.characterId,
        name: seat?.name || "A player", content, passed: false,
      });
    }
    throughSeq = Math.max(throughSeq, message.seq);
  }
  for (const pass of passes) {
    const seat = seats.find((entry) => entry.userId === pass.userId);
    if (!seat || answers.has(pass.userId)) continue;
    answers.set(pass.userId, { userId: pass.userId, characterId: seat.characterId, name: seat.name, content: "Passes this round.", passed: true });
    throughSeq = Math.max(throughSeq, pass.seq);
  }
  if (!answers.size) return null;
  return { id: `couch-answers-${throughSeq}`, throughSeq, answers: [...answers.values()] };
}

export function couchAnswersSpeech(round: CouchAnswers): string {
  return round.answers.map((answer) => `${answer.name}: ${answer.content}`).join("\n\n");
}

// A live batch stays on screen through its readout, even if the GM has
// already finished writing. A reloaded screen never waits on old audio.
export function couchAnswersVisible(input: {
  round: CouchAnswers | null;
  latestNarrationSeq: number;
  playingMessageId: string | null;
  readoutExpected: boolean;
  live: boolean;
  dismissedId: string | null;
}): boolean {
  const { round } = input;
  return Boolean(round && (
    input.playingMessageId === round.id ||
    input.latestNarrationSeq <= round.throughSeq ||
    (input.live && input.readoutExpected && input.dismissedId !== round.id)
  ));
}
