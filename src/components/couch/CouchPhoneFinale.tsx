"use client";

import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { CouchFace } from "@/components/couch/CouchParts";
import { actName } from "@/lib/couch/prompt-logic";
import { minutesWords, OUTCOME_WORDS, VERDICT_WORDS, type CouchFinale, type FinaleCrew } from "@/lib/couch/finale-logic";

// The night's closing on a phone (src/lib/couch/finale-logic.ts): once the
// night is over the action box has nothing left to do, so the phone turns to
// how its player did. Their own crew member first (two, for a player who
// took someone over after a death): the fate, each agenda with its verdict,
// the story points, the hidden role if it was theirs, their best moment and
// their dice. Then the GM's review, what was really going on, the rest of
// the crew, and the night in numbers. The TV reveals the same things to the
// room one at a time; the phone keeps them to read on the way home.

export function CouchPhoneFinale({ state, onStory }: { state: CampaignState; onStory: () => void }) {
  const view = state.couchFinale;
  const meId = state.me?.id ?? "";
  if (view?.status !== "ready") {
    return (
      <section className="couch-phone-finale" aria-labelledby="couch-finale-title">
        <header className="couch-phone-finale-head">
          <span className="couch-label">{state.campaign?.title}</span>
          <h1 id="couch-finale-title">The end</h1>
          <p className="couch-phone-finale-writing" role="status">
            <span className="couch-pulse" aria-hidden="true" />
            The GM is writing the closing. Watch the TV.
          </p>
        </header>
        <StoryButton onStory={onStory} />
      </section>
    );
  }
  const finale = view.finale;
  const mine = finale.crew.filter((member) => member.userId === meId);
  const others = finale.crew.filter((member) => member.userId !== meId);
  return (
    <section className="couch-phone-finale" aria-labelledby="couch-finale-title" data-outcome={finale.outcome}>
      <header className="couch-phone-finale-head">
        <span className="couch-label">{finale.title} · {OUTCOME_WORDS[finale.outcome]}</span>
        <h1 id="couch-finale-title">The end</h1>
        <p className="couch-phone-finale-headline">{finale.headline}</p>
      </header>
      {mine.map((member) => (
        <YourNight key={member.characterId} member={member} />
      ))}
      {finale.review ? <Review finale={finale} /> : null}
      {finale.recap.length ? (
        <section className="couch-card couch-phone-finale-card" aria-labelledby="couch-finale-recap">
          <h2 id="couch-finale-recap" className="couch-label">What happened</h2>
          <ol className="couch-phone-finale-recap">
            {finale.recap.map((beat, at) => {
              const picture = finale.pictures?.recap[at];
              return (
                <li key={at}>
                  {picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={picture} alt="" loading="lazy" />
                  ) : null}
                  <span>{beat}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {finale.truth ? (
        <section className="couch-card couch-phone-finale-card" aria-labelledby="couch-finale-truth">
          <h2 id="couch-finale-truth" className="couch-label">What was really going on</h2>
          <p>{finale.truth}</p>
        </section>
      ) : null}
      {others.length ? (
        <section className="couch-card couch-phone-finale-card" aria-labelledby="couch-finale-crew">
          <h2 id="couch-finale-crew" className="couch-label">The crew</h2>
          <ul className="couch-phone-finale-crew">
            {others.map((member) => (
              <li key={member.characterId} data-dead={member.dead ? "" : undefined}>
                <CouchFace src={member.portraitUrl} name={member.name} size="44px" />
                <span className="couch-phone-finale-crew-text">
                  <strong>{member.name}</strong>
                  <span>{member.award || member.fate}</span>
                  <span className="couch-phone-finale-crew-tally">
                    {member.dead ? "Dead · " : ""}
                    {member.agendas.filter((agenda) => agenda.verdict === "done").length} of {member.agendas.length} agendas · {member.storyPoints} story {member.storyPoints === 1 ? "point" : "points"}
                  </span>
                  {member.hiddenRole ? <span className="couch-phone-finale-crew-hidden">Secretly {member.hiddenRole}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Numbers finale={finale} />
      <StoryButton onStory={onStory} />
    </section>
  );
}

function YourNight({ member }: { member: FinaleCrew }) {
  return (
    <section className="couch-card couch-phone-finale-you" aria-labelledby={`couch-finale-you-${member.characterId}`} data-dead={member.dead ? "" : undefined}>
      <div className="couch-phone-finale-you-head">
        <CouchFace src={member.portraitUrl} name={member.name} size="64px" />
        <span className="couch-phone-finale-you-name">
          <span className="couch-label">You played{member.crewRole ? ` · ${member.crewRole}` : ""}</span>
          <h2 id={`couch-finale-you-${member.characterId}`}>{member.name}</h2>
          {member.award ? <span className="couch-phone-finale-award">{member.award}</span> : null}
        </span>
      </div>
      <p className="couch-phone-finale-fate">{member.dead ? <b>Dead. </b> : null}{member.fate}</p>
      {member.agendas.length ? (
        <ol className="couch-phone-finale-agendas" aria-label="Your secret agendas">
          {member.agendas.map((agenda) => (
            <li key={agenda.act}>
              <span className="couch-phone-finale-agenda-top">
                <span className="couch-label">{actName(agenda.act)}</span>
                {agenda.verdict ? (
                  <span className="couch-phone-finale-verdict" data-verdict={agenda.verdict}>
                    {VERDICT_WORDS[agenda.verdict]}
                  </span>
                ) : null}
              </span>
              <span className="couch-phone-finale-agenda-text">{agenda.text}</span>
              {agenda.line ? <span className="couch-phone-finale-agenda-line">{agenda.line}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {member.hiddenRole ? (
        <p className="couch-phone-finale-hidden">
          <span className="couch-label">Your secret</span>
          {member.hiddenRole}
        </p>
      ) : null}
      {member.highlight ? (
        <p className="couch-phone-finale-highlight">
          <span className="couch-label">Your moment</span>
          {member.moment ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.moment} alt="" loading="lazy" />
          ) : null}
          {member.highlight}
        </p>
      ) : null}
      <dl className="couch-phone-finale-stats">
        <div><dt>Story points</dt><dd>{member.storyPoints}</dd></div>
        <div><dt>Moves</dt><dd>{member.moves}</dd></div>
        <div><dt>Rolls</dt><dd>{member.rolls}</dd></div>
        <div><dt>Natural 20s</dt><dd>{member.nat20s}</dd></div>
        <div><dt>Natural 1s</dt><dd>{member.nat1s}</dd></div>
      </dl>
    </section>
  );
}

function Review({ finale }: { finale: CouchFinale }) {
  const review = finale.review!;
  return (
    <section className="couch-card couch-phone-finale-card couch-phone-finale-review" aria-labelledby="couch-finale-review">
      <div className="couch-phone-finale-review-head">
        <span className="couch-phone-finale-grade" data-grade={review.grade} aria-hidden="true">{review.grade}</span>
        <span>
          <h2 id="couch-finale-review" className="couch-label">The GM&rsquo;s review<span className="sr-only">, grade {review.grade}</span></h2>
          {review.title ? <strong className="couch-phone-finale-review-title">{review.title}</strong> : null}
        </span>
      </div>
      <p>{review.commentary}</p>
      {review.bestMove ? (
        <p className="couch-phone-finale-review-line">
          <span className="couch-label">Best call</span>
          {review.bestMove}
        </p>
      ) : null}
      {review.missed ? (
        <p className="couch-phone-finale-review-line">
          <span className="couch-label">You missed</span>
          {review.missed}
        </p>
      ) : null}
    </section>
  );
}

function Numbers({ finale }: { finale: CouchFinale }) {
  const stats = finale.stats;
  return (
    <section className="couch-card couch-phone-finale-card" aria-labelledby="couch-finale-numbers">
      <h2 id="couch-finale-numbers" className="couch-label">The night in numbers</h2>
      <dl className="couch-phone-finale-stats">
        <div><dt>Played</dt><dd>{minutesWords(stats.minutes)}</dd></div>
        <div><dt>Ended in</dt><dd>{actName(stats.act)}</dd></div>
        <div><dt>Rolls</dt><dd>{stats.rolls}</dd></div>
        <div><dt>Natural 20s</dt><dd>{stats.nat20s}</dd></div>
        <div><dt>Fights</dt><dd>{stats.fights}</dd></div>
        <div><dt>Dead</dt><dd>{stats.deaths}</dd></div>
      </dl>
    </section>
  );
}

function StoryButton({ onStory }: { onStory: () => void }) {
  return (
    <button type="button" className="couch-btn couch-phone-finale-story" onClick={onStory}>
      Read back the story
    </button>
  );
}
