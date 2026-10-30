import type { CharacterSheet } from "@/lib/schemas/sheet";
import type { CouchAnswers } from "@/lib/couch/answers-logic";
import { CouchFace } from "./CouchParts";
import { couchParagraphs } from "./couch-logic";

export function CouchTvAnswers({ round, sheets }: { round: CouchAnswers; sheets: readonly CharacterSheet[] }) {
  return (
    <section className="couch-tv-answers" aria-label="Everyone's answers">
      <h2 className="couch-label">Everyone&apos;s answers</h2>
      <div className="couch-tv-answer-grid">
        {round.answers.map((answer) => {
          const sheet = sheets.find((entry) => entry.id === answer.characterId);
          return (
            <article key={answer.userId} className="couch-tv-answer">
              <header>
                <CouchFace src={sheet?.portrait?.url} name={answer.name} />
                <h3>{answer.name}</h3>
              </header>
              {couchParagraphs(answer.content).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </article>
          );
        })}
      </div>
    </section>
  );
}
