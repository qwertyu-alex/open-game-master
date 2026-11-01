"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import type { EncounterSummary } from "@/lib/dm/encounter-summary";
import { CouchFace } from "@/components/couch/CouchParts";
import { CouchTvTruce } from "@/components/couch/CouchTruce";
import { distanceWords } from "@/lib/couch/fight-map-logic";
import { fightOpponents, fightOver, type CouchFight, type FightEnemy, type FightSeat } from "@/lib/couch/fight-logic";
import type { CouchTruce } from "@/lib/couch/truce-logic";

// The TV in a fight (docs/couch-mode-spec.md 2.11), laid out like a
// turn-based game so the room reads who fights whom at a glance: the turn
// order across the top, the enemy side down the right (each creature with
// the picture the night painted of it, swapped for its hurt and down
// pictures as it takes damage), the crew's side along the bottom, and whose
// move it is in the bottom right corner. The story shrinks to one line in
// the clear middle. Each part has its own zone, so none covers another or
// the faces in the scene. Health is words and lit pips, never a number.
// When the fight ends the TV holds up how it went before the story picks up
// again.

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

export function enemyArt(art: FightArtMap, enemy: Pick<FightEnemy, "artKey" | "stage" | "portrait">): string | null {
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
  diceHold = false,
  truce = null,
  slotRef,
}: {
  fight: CouchFight;
  art: FightArtMap;
  sheets: readonly CharacterSheet[];
  gmBusy: boolean;
  // A roll is called or on its card: the slot is the roll's.
  rollsWaiting: boolean;
  // Dice are in the air: the creatures' cards keep what they showed until
  // the dice land, so the number comes before the wound.
  diceHold?: boolean;
  // A truce the crew is answering (src/lib/couch/truce.ts): it takes the
  // move's place, even while the GM narrates the offer.
  truce?: CouchTruce | null;
  // The card slot under the creatures, where CouchRolls puts a roll's card.
  slotRef?: (element: HTMLElement | null) => void;
}) {
  const living = fight.enemies.filter((enemy) => enemy.tone !== "down" && enemy.tone !== "fled").length;
  const layout = fight.enemies.length === 1 ? "solo" : fight.enemies.length === 2 ? "pair" : fight.enemies.length <= 4 ? "grid" : "list";
  return (
    <>
      <div className="couch-fight-edge" aria-hidden="true" />
      {/* The right-hand column: the creatures, and under them one card at a
          time (a roll called or thrown, then a truce), which the creatures
          make room for. Nothing in a fight sits over the grid. */}
      <div className="couch-fight-side">
        <section className="couch-fight-foes" data-layout={layout} data-gm-busy={gmBusy ? "" : undefined} aria-label={`In the fight: ${living} of ${fight.enemies.length} still standing`}>
          <span className="couch-label couch-fight-foes-label" aria-hidden="true">
            {fight.enemies.length === 1 ? "Enemy" : living === fight.enemies.length ? `Enemies · ${living}` : `Enemies · ${living} of ${fight.enemies.length} standing`}
          </span>
          {fight.enemies.map((enemy) => (
            <FoeCard key={enemy.id} enemy={enemy} art={art} hold={diceHold} />
          ))}
        </section>
        <div className="couch-fight-slot">
          <div className="couch-fight-slot-rolls" ref={slotRef} />
          {rollsWaiting || !truce ? null : <CouchTvTruce truce={truce} sheets={sheets} />}
        </div>
      </div>
      {/* The move the room is waiting on, while nothing else holds the eye:
          not while the GM answers, a roll is up or a truce is asked. */}
      {rollsWaiting || truce || gmBusy ? null : <FightTurn fight={fight} />}
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
export function seatName(name: string): string {
  const words = name.trim().split(/\s+/);
  const number = words.length > 1 && /^#?\d+$/.test(words.at(-1) ?? "") ? ` ${words.at(-1)}` : "";
  return `${words[0]}${number}`;
}

function FoeCard({ enemy: live, art, hold }: { enemy: FightEnemy; art: FightArtMap; hold: boolean }) {
  // A blow that lands flashes the card; one that fells it stamps it. Only a
  // change seen on this screen, so a reload does not replay the last hit.
  // While dice are in the air the card keeps what it showed: the wound
  // lands with the number, not before it.
  const [seen, setSeen] = useState({ enemy: live, hits: 0 });
  if (!hold && seen.enemy !== live) {
    setSeen({ enemy: live, hits: live.pips < seen.enemy.pips ? seen.hits + 1 : seen.hits });
  }
  const enemy = seen.enemy;
  const src = enemyArt(art, enemy);
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
        {enemy.acting ? <span className="couch-fight-foe-tag">Their move</span> : null}
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

// Whose move it is, in the bottom right corner beside the crew: the crew
// card it names is lit too, so the words only say what to do.
function FightTurn({ fight }: { fight: CouchFight }) {
  const turn = fight.turn;
  if (fight.rolling) {
    return (
      <div className="couch-fight-turn" data-kind="rolling" role="status">
        <strong>Roll for initiative</strong>
        <span>Everyone throws from their phone</span>
      </div>
    );
  }
  if (!turn) return null;
  const next = fight.upNext ? seatName(fight.upNext.name) : "";
  if (turn.kind === "enemy") {
    return (
      <div className="couch-fight-turn" data-kind="enemy" role="status">
        <strong>{turn.names.length === 1 ? `${turn.names[0]} moves` : "The enemies move"}</strong>
        {next ? <span>Then {next}</span> : null}
      </div>
    );
  }
  // A crew member who turned on the others moves in the foes' red.
  const against = turn.side === "foe";
  return (
    <div className="couch-fight-turn" data-kind={against ? "enemy" : "crew"} role="status">
      <strong>{seatName(turn.name)}, what do you do?</strong>
      <span>{against ? "Against the crew · " : ""}Say it on your phone{next ? ` · then ${next}` : ""}</span>
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
// With the phone's own board, each row also says how far it stands from
// the player's character, and on their move how far they can still walk.
export function CouchPhoneFight({
  fight,
  myCharacterIds = NO_IDS,
  distances,
  moveFeet = null,
}: {
  fight: CouchFight | null;
  myCharacterIds?: ReadonlySet<string>;
  distances?: ReadonlyMap<string, number>;
  moveFeet?: number | null;
}) {
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
            {distances?.has(enemy.id) && enemy.tone !== "down" && enemy.tone !== "fled" ? (
              <span className="couch-phone-fight-far" data-near={distances.get(enemy.id)! <= 5 ? "" : undefined}>
                {distanceWords(distances.get(enemy.id)!)}
              </span>
            ) : null}
            <span className="couch-fight-pips" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => <i key={index} data-on={index < enemy.pips ? "" : undefined} />)}
            </span>
            <span className="couch-phone-fight-state">{enemy.words}</span>
          </li>
        ))}
      </ul>
      {moveFeet !== null ? (
        <p className="couch-phone-fight-move">
          {moveFeet > 0 ? `You can move ${moveFeet} ft this turn · 1 square = 5 ft` : "You have no movement left this turn"}
        </p>
      ) : null}
    </section>
  );
}
