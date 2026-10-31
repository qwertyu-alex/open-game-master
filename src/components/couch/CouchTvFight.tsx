"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import type { EncounterSummary } from "@/lib/dm/encounter-summary";
import { CouchFace } from "@/components/couch/CouchParts";
import { CouchTvTruce } from "@/components/couch/CouchTruce";
import { fightOpponents, fightOver, type CouchFight, type FightEnemy, type FightSeat } from "@/lib/couch/fight-logic";
import type { CouchTruce } from "@/lib/couch/truce-logic";

// The TV in a fight (docs/couch-mode-spec.md 2.11). The story waits while
// the fight is on, so the screen says so: whose move it is, in what order
// everyone acts, and each creature big down the right with the picture the
// night painted of it, swapped for its hurt and down pictures as it takes
// damage. Health is words and lit pips, never a number. When the fight ends
// the TV holds up how it went before the story picks up again.

export type FightArtMap = Record<string, Partial<Record<"whole" | "hurt" | "down", string>>>;

const ART_POLL_MS = 4000;
const ART_POLL_LIMIT = 90;

// The night's pictures of the creatures in the running fight
// (GET /api/campaigns/[id]/couch/fight-art): asked when the fight starts,
// when a creature joins it, and again every few seconds while some are
// still being painted. The last fight's pictures are kept once it ends, for
// the card that closes it.
export function useFightArt(campaignId: string, fightKey: string): FightArtMap {
  const [art, setArt] = useState<FightArtMap>({});
  useEffect(() => {
    if (!campaignId || !fightKey) return;
    let cancelled = false;
    let timer: number | undefined;
    let tries = 0;
    const read = async () => {
      tries += 1;
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/couch/fight-art`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { art?: FightArtMap; pending?: boolean };
        if (cancelled) return;
        setArt((current) => ({ ...current, ...data.art }));
        if (data.pending && tries < ART_POLL_LIMIT) timer = window.setTimeout(read, ART_POLL_MS);
      } catch {
        // Offline for a moment: the creature's letter stands in.
      }
    };
    void read();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [campaignId, fightKey]);
  return art;
}

function enemyArt(art: FightArtMap, enemy: Pick<FightEnemy, "artKey" | "stage" | "portrait">): string | null {
  const set = art[enemy.artKey] ?? {};
  // A stage still being painted shows the picture before it, under the
  // card's own treatment for how hurt it is. A crew member on the other side
  // shows their own face until the night has painted them for the fight.
  const painted = enemy.stage === "down" ? (set.down ?? set.hurt ?? set.whole) : enemy.stage === "hurt" ? (set.hurt ?? set.whole) : set.whole;
  return painted ?? enemy.portrait ?? null;
}

// ---- during the fight ----

export function CouchTvFightHud({
  fight,
  art,
  sheets,
  gmBusy,
  rollsWaiting,
  truce = null,
}: {
  fight: CouchFight;
  art: FightArtMap;
  sheets: readonly CharacterSheet[];
  gmBusy: boolean;
  rollsWaiting: boolean;
  // A truce the crew is answering (src/lib/couch/truce.ts): it takes the
  // move's place, even while the GM narrates the offer.
  truce?: CouchTruce | null;
}) {
  const living = fight.enemies.filter((enemy) => enemy.tone !== "down" && enemy.tone !== "fled").length;
  const layout = fight.enemies.length === 1 ? "solo" : fight.enemies.length === 2 ? "pair" : fight.enemies.length <= 4 ? "grid" : "list";
  return (
    <>
      <div className="couch-fight-edge" aria-hidden="true" />
      <section className="couch-fight-foes" data-layout={layout} aria-label={`In the fight: ${living} of ${fight.enemies.length} still standing`}>
        {fight.enemies.map((enemy) => (
          <FoeCard key={enemy.id} enemy={enemy} src={enemyArt(art, enemy)} />
        ))}
      </section>
      {/* The move the room is waiting on, while nothing else holds the eye:
          not while the GM answers, and not while a roll is called. */}
      {rollsWaiting ? null : truce ? (
        <CouchTvTruce truce={truce} sheets={sheets} />
      ) : !gmBusy ? (
        <FightTurn fight={fight} sheets={sheets} art={art} />
      ) : null}
    </>
  );
}

// Who acts, in order, along the top right: crew faces and the creatures'
// pictures, the one acting lit, the fallen greyed.
export function CouchTvFightOrder({ fight, art, sheets }: { fight: CouchFight; art: FightArtMap; sheets: readonly CharacterSheet[] }) {
  const enemies = new Map(fight.enemies.map((enemy) => [enemy.id, enemy]));
  return (
    <div className="couch-fight-order" role="group" aria-label={fight.rolling ? "Turn order: being thrown" : `Turn order, round ${fight.round}`}>
      <span className="couch-label">{fight.rolling ? "Fight · rolling initiative" : `Fight · round ${fight.round}`}</span>
      {fight.order.length ? (
        <ol>
          {fight.order.map((seat) => (
            <OrderSeat key={seat.key} seat={seat} sheets={sheets} enemy={enemies.get(seat.id)} art={art} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function OrderSeat({ seat, sheets, enemy, art }: { seat: FightSeat; sheets: readonly CharacterSheet[]; enemy?: FightEnemy; art: FightArtMap }) {
  const src = seat.kind === "crew" ? sheets.find((sheet) => sheet.id === seat.id)?.portrait?.url : enemy ? enemyArt(art, enemy) : null;
  return (
    <li className="couch-fight-seat" data-kind={seat.kind} data-side={seat.side} data-current={seat.current ? "" : undefined} data-out={seat.out ? "" : undefined} aria-current={seat.current ? "step" : undefined}>
      <CouchFace src={src} name={seat.name} />
      <span className="couch-fight-seat-name">{seatName(seat.name)}</span>
    </li>
  );
}

// A first name under a face; a pack keeps its number ("Hunter 2"), or the
// order would name the same creature twice.
function seatName(name: string): string {
  const words = name.trim().split(/\s+/);
  const number = words.length > 1 && /^#?\d+$/.test(words.at(-1) ?? "") ? ` ${words.at(-1)}` : "";
  return `${words[0]}${number}`;
}

function FoeCard({ enemy, src }: { enemy: FightEnemy; src: string | null }) {
  // A blow that lands flashes the card; one that fells it stamps it. Only a
  // change seen on this screen, so a reload does not replay the last hit.
  const [seen, setSeen] = useState({ pips: enemy.pips, hits: 0 });
  if (seen.pips !== enemy.pips) {
    setSeen({ pips: enemy.pips, hits: enemy.pips < seen.pips ? seen.hits + 1 : seen.hits });
  }
  return (
    <article className="couch-fight-foe" data-tone={enemy.tone} data-acting={enemy.acting ? "" : undefined} data-crew={enemy.crewId ? "" : undefined}>
      <div className="couch-fight-foe-art">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" />
        ) : (
          <span className="couch-fight-foe-letter" aria-hidden="true">{Array.from(enemy.name.trim())[0] ?? "?"}</span>
        )}
        {seen.hits ? <span key={seen.hits} className="couch-fight-hit" aria-hidden="true" /> : null}
        {enemy.tone === "down" || enemy.tone === "fled" ? <span className="couch-fight-stamp">{enemy.words}</span> : null}
      </div>
      <div className="couch-fight-foe-text">
        <h3>{enemy.name}</h3>
        {enemy.crewId ? <p className="couch-fight-foe-turned">Turned on the crew</p> : null}
        <p className="couch-fight-foe-state">
          <span className="couch-fight-pips" role="img" aria-label={`${enemy.name}: ${enemy.words}`} style={{ "--lit": enemy.pips } as CSSProperties}>
            {[0, 1, 2, 3].map((index) => <i key={index} data-on={index < enemy.pips ? "" : undefined} />)}
          </span>
          <span>{enemy.words}</span>
        </p>
        {enemy.conditions.length ? <p className="couch-fight-foe-conditions">{enemy.conditions.join(" · ")}</p> : null}
      </div>
    </article>
  );
}

function FightTurn({ fight, sheets, art }: { fight: CouchFight; sheets: readonly CharacterSheet[]; art: FightArtMap }) {
  const turn = fight.turn;
  if (fight.rolling) {
    return (
      <div className="couch-fight-turn" data-kind="rolling" role="status">
        <strong>Roll for initiative</strong>
        <span>Everyone throws from their phone: highest acts first.</span>
      </div>
    );
  }
  if (!turn) return null;
  if (turn.kind === "enemy") {
    const first = fight.enemies.find((enemy) => enemy.acting);
    return (
      <div className="couch-fight-turn" data-kind="enemy" role="status">
        {first ? <CouchFace src={enemyArt(art, first)} name={first.name} /> : null}
        <span className="couch-fight-turn-text">
          <strong>{turn.names.length === 1 ? `${turn.names[0]} moves` : "The creatures move"}</strong>
          {fight.upNext ? <span>Then {fight.upNext.name}</span> : null}
        </span>
      </div>
    );
  }
  const sheet = sheets.find((entry) => entry.id === turn.characterId);
  // A crew member who turned on the others moves in the foes' red.
  const against = turn.side === "foe";
  return (
    <div className="couch-fight-turn" data-kind={against ? "enemy" : "crew"} role="status">
      <CouchFace src={sheet?.portrait?.url} name={turn.name} />
      <span className="couch-fight-turn-text">
        <strong>{turn.name}&apos;s move</strong>
        <span>{against ? "Against the crew · " : ""}Say it on your phone{fight.upNext ? ` · then ${fight.upNext.name}` : ""}</span>
      </span>
    </div>
  );
}

// ---- after the fight ----

const OVER_MS = 16000;

// The card a fight's end puts up for a moment: how it ended, how long it
// ran, what each crew member dealt and took, over the creature as it fell.
// Only for an end seen live: a reload does not bring an old fight back.
export function CouchTvFightOver({
  summary,
  sheets,
  art,
  lastFight,
}: {
  summary: EncounterSummary | null;
  sheets: readonly CharacterSheet[];
  art: FightArtMap;
  lastFight: CouchFight | null;
}) {
  const [shown, setShown] = useState<EncounterSummary | null>(null);
  // The summary the screen opened with is an old fight's.
  const [opened] = useState(summary);
  const [last, setLast] = useState(summary);
  if (summary !== last) {
    setLast(summary);
    if (summary && summary !== opened) setShown(summary);
  }
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), OVER_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  const over = fightOver(shown, new Set(sheets.filter((sheet) => !sheet.isCompanion).map((sheet) => sheet.id)), lastFight?.turned ?? []);
  const foe = lastFight?.enemies[0];
  const backdrop = foe ? art[foe.artKey]?.down ?? art[foe.artKey]?.hurt ?? art[foe.artKey]?.whole ?? null : null;
  return (
    <section className="couch-fight-over" aria-label="The fight is over" data-outcome={shown.outcome}>
      {/* The last creature's fall ends the fight at once, so its card never
          shows it down: the closing card does, stamped. */}
      {backdrop ? (
        <div className="couch-fight-over-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backdrop} alt="" />
          {shown.outcome === "victory" ? <span className="couch-fight-stamp">Down</span> : null}
        </div>
      ) : null}
      <div className="couch-fight-over-card">
        <span className="couch-label">Fight over · {over.rounds} {over.rounds === 1 ? "round" : "rounds"}</span>
        <h2>{over.title}</h2>
        {over.line ? <p className="couch-fight-over-line">{over.line}</p> : null}
        {over.crew.length ? (
          <ul>
            {over.crew.map((line) => {
              const sheet = sheets.find((entry) => entry.id === line.characterId);
              return (
                <li key={line.characterId}>
                  <CouchFace src={sheet?.portrait?.url} name={line.name} />
                  <span className="couch-fight-over-name">{line.name}</span>
                  <span className="couch-fight-over-stat"><b>{line.dealt}</b> dealt</span>
                  <span className="couch-fight-over-stat"><b>{line.taken}</b> taken</span>
                  {line.crits ? <span className="couch-fight-over-crit">{line.crits === 1 ? "a natural 20" : `${line.crits} natural 20s`}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

// ---- on a phone ----

const NO_IDS: ReadonlySet<string> = new Set();

// The fight in one strip at the foot of a phone's story, over the line that
// says whose move it is: the round and each creature with how it is doing,
// so a player deciding what to try needs no look up at the TV.
// A crew member who turned on the others sees the crew there instead: the
// side they are fighting.
export function CouchPhoneFight({ fight, myCharacterIds = NO_IDS }: { fight: CouchFight | null; myCharacterIds?: ReadonlySet<string> }) {
  if (!fight) return null;
  const { against, rows } = fightOpponents(fight, myCharacterIds);
  return (
    <section className="couch-phone-fight" aria-label={against ? "The fight: you against the crew" : "The fight"} data-against={against ? "" : undefined}>
      <span className="couch-label">
        {fight.rolling ? "Fight · rolling initiative" : `Fight · round ${fight.round}`}
        {against ? " · you against the crew" : ""}
      </span>
      <ul>
        {rows.map((enemy) => (
          <li key={enemy.id} data-tone={enemy.tone}>
            <span className="couch-phone-fight-name">{enemy.name}</span>
            <span className="couch-fight-pips" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => <i key={index} data-on={index < enemy.pips ? "" : undefined} />)}
            </span>
            <span className="couch-phone-fight-state">{enemy.words}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
