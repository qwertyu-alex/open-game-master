"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { fxTone, type FxEvent } from "@/lib/battlemap/fx-plan";
import type { XY } from "@/lib/battlemap/types";
import { effectiveSpeed } from "@/lib/dm/condition-logic";
import type { CouchFight } from "@/lib/couch/fight-logic";
import {
  BEAT_MS,
  feetBetween,
  fightAct,
  fightSteps,
  heldSquares,
  inReach,
  missingCrew,
  moveRange,
  queueBeats,
  stepWords,
  type CouchFightMap,
  type FightBeat,
  type FightActLook,
  type FightMapToken,
} from "@/lib/couch/fight-map-logic";
import { CouchFace } from "@/components/couch/CouchParts";
import { enemyArt, seatName, type FightArtMap } from "@/components/couch/CouchTvFight";

// Where everyone stands in a fight, on the TV (docs/couch-mode-spec.md
// 2.11): the squares around the fighters from the fight's own battle map,
// each crew member and creature on theirs, each creature's reach, where the
// crew member whose move it is can get to, and how far they are from each
// creature, so the room can tell a swing from a shot. What happens plays on
// it: an attack lunges or fires at its target and lands Hit or Miss, a spell
// bursts, a walk leaves a trail, a check talked or sneaked plays on the
// figure who threw it. Every effect comes from an outcome the server
// resolved (the board's fx events, the rolls, the tokens' squares); the TV
// never guesses one.

// The fight's grid (GET /api/campaigns/[id]/couch/fight-map), asked again
// whenever the board, the fight or an effect says something changed.
function useFightMap(campaignId: string, active: boolean, refreshKey: unknown): CouchFightMap | null {
  const [map, setMap] = useState<CouchFightMap | null>(null);
  useEffect(() => {
    if (!campaignId || !active) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/couch/fight-map`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { map?: CouchFightMap | null };
        if (!cancelled) setMap(data.map ?? null);
      } catch {
        // Offline for a moment: the last grid stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, active, refreshKey]);
  return active ? map : null;
}

type Effect = {
  key: string;
  kind: "shot" | "slash" | "burst" | "word" | "trail" | "lunge" | "shake" | "act";
  // Whole-map squares.
  at: XY;
  to?: XY;
  tokenId?: string;
  words?: string;
  tone?: string;
  look?: FightActLook;
  // Milliseconds before it starts: a hit lands once the shot gets there.
  delay?: number;
  // A walk's trail: the square its figure set out from, where the figure
  // stays drawn until the walk's beat plays (heldSquares).
  walk?: XY;
};

type Beat = FightBeat<Effect>;

let effectCount = 0;
const effectKey = (kind: string) => `${kind}:${(effectCount += 1)}`;

const OUTCOME_WORDS: Record<string, string> = {
  hit: "Hit",
  crit: "Critical!",
  miss: "Miss",
  fumble: "Fumble",
  save: "Saved",
  fail: "Hit",
  half: "Half",
};

// One board effect (src/lib/battlemap/fx-plan.ts) as what the TV plays.
function effectsFor(fx: FxEvent): Effect[] {
  const tone = fxTone(fx);
  const targets = fx.to ? (Array.isArray(fx.to) ? fx.to : [fx.to]) : [];
  const targetIds = fx.toTokenId ? (Array.isArray(fx.toTokenId) ? fx.toTokenId : [fx.toTokenId]) : [];
  const out: Effect[] = [];
  const travels = Boolean(fx.from) && (fx.kind === "spell" || (fx.kind === "attack" && fx.ranged));
  const delay = travels ? 420 : 160;
  if (fx.kind === "attack" || fx.kind === "spell") {
    if (fx.kind === "attack" && !fx.ranged && fx.fromTokenId && fx.from && targets[0]) {
      out.push({ key: effectKey("lunge"), kind: "lunge", tokenId: fx.fromTokenId, at: fx.from, to: targets[0] });
    }
    targets.forEach((target, index) => {
      const outcome = fx.outcomes?.[index] ?? fx.outcome;
      const landed = outcome !== "miss" && outcome !== "fumble" && outcome !== "save";
      if (travels && fx.from) out.push({ key: effectKey("shot"), kind: "shot", at: fx.from, to: target, tone });
      if (landed) {
        out.push({ key: effectKey(fx.kind === "attack" && !fx.ranged ? "slash" : "burst"), kind: fx.kind === "attack" && !fx.ranged ? "slash" : "burst", at: target, tone, delay });
        const id = targetIds[index];
        if (id) out.push({ key: effectKey("shake"), kind: "shake", tokenId: id, at: target, delay });
      }
      const words = outcome ? OUTCOME_WORDS[outcome] : fx.kind === "spell" ? fx.label : "";
      if (words) out.push({ key: effectKey("word"), kind: "word", at: target, words, tone: landed ? tone : "#c9d2cc", delay });
    });
  } else if (fx.kind === "heal") {
    for (const target of targets) {
      out.push({ key: effectKey("burst"), kind: "burst", at: target, tone });
      out.push({ key: effectKey("word"), kind: "word", at: target, words: "Healed", tone });
    }
  } else if (fx.kind === "condition") {
    for (const target of targets) out.push({ key: effectKey("word"), kind: "word", at: target, words: fx.label ?? "", tone: "#ffc46b" });
  } else if (fx.kind === "death") {
    for (const target of targets) {
      out.push({ key: effectKey("burst"), kind: "burst", at: target, tone: "#ff5a4e" });
      out.push({ key: effectKey("word"), kind: "word", at: target, words: "Down", tone: "#ff5a4e" });
    }
  } else if (fx.kind === "teleport" && fx.from) {
    out.push({ key: effectKey("burst"), kind: "burst", at: fx.from, tone });
    for (const target of targets) out.push({ key: effectKey("burst"), kind: "burst", at: target, tone, delay: 200 });
  }
  return out.filter((effect) => effect.kind !== "word" || effect.words);
}

const positions = (map: CouchFightMap | null) => new Map((map?.tokens ?? []).map((token) => [token.id, { x: token.x, y: token.y }]));

function speedOf(sheet: CharacterSheet | undefined): number | null {
  return sheet ? effectiveSpeed(sheet.conditions ?? [], sheet.speed ?? 30) : null;
}

export function CouchTvFightMap({ state, fight, art, sheets, hold = false }: {
  state: CampaignState;
  fight: CouchFight;
  art: FightArtMap;
  sheets: readonly CharacterSheet[];
  // Dice are in the air (CouchRolls): what they decide waits for them to
  // land, so a Hit never shows before the number that made it.
  hold?: boolean;
}) {
  const campaignId = state.campaign?.id ?? "";
  // The order is in the key: a fight starts before initiative with nobody in
  // it, and the crew only stand on the grid once they take a place in it.
  // The crew in the order the TV shows are in it too, and so is a retry: a
  // grid that came back without someone the order names (asked before the
  // order was in, or a request lost on the way) is asked for once more, so
  // the room never plays a fight against a creature alone on the board.
  // The last message and the crew's conditions are in it too: a Dash, a
  // fall prone or a slow changes how far the one acting can still walk.
  const crewInOrder = fight.order.filter((seat) => seat.kind === "crew" && !seat.out).map((seat) => seat.id);
  const [retry, setRetry] = useState({ missing: "", count: 0 });
  const map = useFightMap(campaignId, true, `${state.encounter?.id}:${state.encounter?.round}:${state.encounter?.turnIndex}:${state.encounter?.order.map((entry) => entry.id).join(",") ?? ""}:${crewInOrder.join(",")}:${state.fx.at(-1)?.id ?? ""}:${JSON.stringify(state.battleMap?.tokens.map((token) => [token.id, token.x, token.y]) ?? [])}:${fight.enemies.map((enemy) => enemy.tone).join(",")}:${retry.count}:${state.messages.at(-1)?.id ?? ""}:${sheets.map((sheet) => sheet.conditions?.join("+") ?? "").join(",")}`);
  const missing = map ? missingCrew(map, crewInOrder).join(",") : "";
  if (missing && missing !== retry.missing) setRetry({ missing, count: retry.count + 1 });
  const sheetsById = useMemo(() => new Map(sheets.map((sheet) => [sheet.id, sheet])), [sheets]);
  // What is playing now, and what waits its turn (fight-map-logic.ts
  // queueBeats): one beat at a time, in the order it happened.
  const [effects, setEffects] = useState<Effect[]>([]);
  const [queue, setQueue] = useState<Beat[]>([]);
  const [beatOn, setBeatOn] = useState<Beat | null>(null);
  const drop = (key: string) => setEffects((current) => current.filter((effect) => effect.key !== key));
  const arrivals: Beat[] = [];

  // What the board planned since this screen came up, each effect a beat.
  const [fxSeen, setFxSeen] = useState(() => new Set(state.fx.map((entry) => entry.id)));
  const freshFx = state.fx.filter((entry) => !fxSeen.has(entry.id));
  if (freshFx.length) {
    setFxSeen(new Set([...fxSeen, ...freshFx.map((entry) => entry.id)]));
    for (const fx of freshFx) {
      const items = effectsFor(fx);
      if (items.length) arrivals.push({ key: `fx:${fx.id}`, at: fx.at, ms: fx.kind === "attack" || fx.kind === "spell" ? BEAT_MS.attack : BEAT_MS.other, items });
    }
  }

  // A check thrown in the fight plays on the figure who threw it.
  const [rollsThrough, setRollsThrough] = useState(() => state.couchRolls.at(-1)?.seq ?? 0);
  const freshRolls = state.couchRolls.filter((entry) => entry.seq > rollsThrough);
  if (freshRolls.length) {
    setRollsThrough(freshRolls.at(-1)!.seq);
    for (const entry of freshRolls) {
      const act = fightAct(entry.roll);
      const token = map?.tokens.find((candidate) => candidate.kind === "pc" && candidate.refId === entry.roll.characterId);
      if (!act || !token) continue;
      const verdict = entry.good ? " · success" : entry.bad ? " · fails" : "";
      arrivals.push({
        key: `act:${entry.roll.id}`,
        // A roll with no time on it goes to the back of the queue.
        at: Date.parse(entry.roll.createdAt) || Number.MAX_SAFE_INTEGER,
        ms: BEAT_MS.act,
        items: [
          { key: effectKey("act"), kind: "act", tokenId: token.id, at: token, look: act.look },
          { key: effectKey("word"), kind: "word", at: token, words: `${act.words}${verdict}`, tone: entry.good ? "#7fe0a8" : entry.bad ? "#ff5a4e" : "#ffc46b" },
        ],
      });
    }
  }

  // A figure on a new square walked or ran there: a trail behind it, a
  // beat of its own, and the figure stays where it was until then.
  const [placed, setPlaced] = useState(map);
  if (map !== placed) {
    setPlaced(map);
    if (placed && map && placed.mapId === map.mapId) {
      const steps = fightSteps(positions(placed), map.tokens, (token) => (token.kind === "pc" ? speedOf(sheetsById.get(token.refId)) : null));
      for (const step of steps) {
        arrivals.push({
          key: effectKey("walk"),
          at: step.at,
          ms: BEAT_MS.step,
          items: [
            { key: effectKey("trail"), kind: "trail", at: step.from, to: step.to, tokenId: step.id, walk: step.from },
            { key: effectKey("word"), kind: "word", at: step.to, words: stepWords(step), tone: step.ran ? "#ffc46b" : "#e6f0ea", delay: 500 },
          ],
        });
      }
    }
  }
  if (arrivals.length) setQueue((current) => queueBeats(current, arrivals));

  // The next beat starts once the last has had its time and no dice are in
  // the air.
  if (!beatOn && !hold && queue.length) {
    const [next, ...rest] = queue;
    setQueue(rest);
    setBeatOn(next);
    setEffects((current) => [...current, ...next.items]);
  }
  useEffect(() => {
    if (!beatOn) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setBeatOn(null), reduced ? Math.min(beatOn.ms, 600) : beatOn.ms);
    return () => window.clearTimeout(timer);
  }, [beatOn]);

  // An effect whose animation never ends (a hidden tab) still goes.
  useEffect(() => {
    if (!effects.length) return;
    const timer = window.setTimeout(() => setEffects((current) => current.slice(effects.length)), 6000);
    return () => window.clearTimeout(timer);
  }, [effects.length]);

  if (!map) return null;
  // A figure whose walk is still waiting its beat is drawn where it set out.
  const held = heldSquares(queue);
  const figures = map.tokens.map((token) => {
    const square = held.get(token.id);
    return square ? { ...token, x: square.x, y: square.y } : token;
  });
  const turn = fight.turn;
  const actingCrew = turn?.kind === "crew" ? figures.find((token) => token.kind === "pc" && token.refId === turn.characterId) ?? null : null;
  const actingEnemies = new Set(fight.enemies.filter((enemy) => enemy.acting).map((enemy) => enemy.id));
  const enemies = figures.filter((token) => token.kind === "enemy");
  const enemyById = new Map(fight.enemies.map((enemy) => [enemy.id, enemy]));
  // The crew member whose move it is: where they can get to, and how far
  // each creature is from them.
  const actingSheet = actingCrew ? sheetsById.get(actingCrew.refId) : undefined;
  // The engine's own answer when the server sent one (movement already
  // spent counts); the base speed walked out here only for an older server.
  const plan = actingCrew && map.move?.refId === actingCrew.refId ? map.move : null;
  const feetLeft = actingCrew ? plan?.feetLeft ?? speedOf(actingSheet) ?? 30 : 0;
  const range = !actingCrew
    ? new Set<string>()
    : plan?.squares
      ? new Set(plan.squares)
      : moveRange(map, actingCrew, feetLeft, enemies);
  const px = (tile: XY) => `${((tile.x - map.x + 0.5) / map.width) * 100}%`;
  const py = (tile: XY) => `${((tile.y - map.y + 0.5) / map.height) * 100}%`;
  const vx = (tile: XY) => tile.x - map.x + 0.5;
  const vy = (tile: XY) => tile.y - map.y + 0.5;
  const tokenAnim = new Map<string, Effect>();
  for (const effect of effects) {
    if (effect.tokenId && (effect.kind === "lunge" || effect.kind === "shake" || effect.kind === "act")) tokenAnim.set(effect.tokenId, effect);
  }
  const who = actingCrew ? seatName(actingCrew.name) : "";
  const cells: Array<{ x: number; y: number; ground: string }> = [];
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const ground = map.terrain[row * map.width + col] ?? ".";
      if (ground !== ".") cells.push({ x: col, y: row, ground });
    }
  }
  return (
    <section className="couch-fight-map" aria-label="Where everyone stands">
      <div className="couch-fight-map-board" style={{ "--cols": map.width, "--rows": map.height } as CSSProperties}>
        <svg className="couch-fight-map-ground" viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true">
          {cells.map((cell) => (
            <rect key={`${cell.x},${cell.y}`} x={cell.x} y={cell.y} width={1} height={1} data-ground={cell.ground} />
          ))}
          {[...range].map((key) => {
            const [x, y] = key.split(",").map(Number);
            return <rect key={`m${key}`} className="couch-fight-map-move" x={x - map.x} y={y - map.y} width={1} height={1} />;
          })}
          {enemies.map((enemy) => (
            <rect
              key={`r${enemy.id}`}
              className="couch-fight-map-reach"
              data-acting={actingEnemies.has(enemy.refId) ? "" : undefined}
              x={enemy.x - map.x - 1 + 0.06}
              y={enemy.y - map.y - 1 + 0.06}
              width={2.88}
              height={2.88}
              rx={0.18}
            />
          ))}
          {effects.filter((effect) => effect.kind === "trail" && effect.to).map((effect) => (
            <line
              key={effect.key}
              className="couch-fight-map-trail"
              x1={vx(effect.at)}
              y1={vy(effect.at)}
              x2={vx(effect.to!)}
              y2={vy(effect.to!)}
              onAnimationEnd={() => drop(effect.key)}
            />
          ))}
          {actingCrew
            ? enemies.map((enemy) => {
                const close = inReach(actingCrew, enemy);
                return (
                  <g key={`d${enemy.id}`} className="couch-fight-map-ray" data-close={close ? "" : undefined}>
                    <line x1={vx(actingCrew)} y1={vy(actingCrew)} x2={vx(enemy)} y2={vy(enemy)} />
                    {/* Next to each other, the line is under the two figures:
                        the words go over them. */}
                    <text x={(vx(actingCrew) + vx(enemy)) / 2} y={close ? Math.min(vy(actingCrew), vy(enemy)) - 0.75 : (vy(actingCrew) + vy(enemy)) / 2 - 0.25}>
                      {close ? "In reach" : `${feetBetween(actingCrew, enemy)} ft`}
                    </text>
                  </g>
                );
              })
            : null}
        </svg>
        {figures.map((token) => (
          <MapToken
            key={token.id}
            token={token}
            src={tokenPicture(token, sheetsById, enemyById, art)}
            current={token === actingCrew || (token.kind === "enemy" && actingEnemies.has(token.refId))}
            anim={tokenAnim.get(token.id)}
            left={px(token)}
            top={py(token)}
            onDone={drop}
          />
        ))}
        <div className="couch-fight-map-fx" aria-hidden="true">
          {effects.filter((effect) => effect.kind === "shot" || effect.kind === "slash" || effect.kind === "burst" || effect.kind === "word").map((effect) => (
            <span
              key={effect.key}
              className={`couch-fight-map-${effect.kind}`}
              style={{
                left: px(effect.at),
                top: py(effect.at),
                "--tone": effect.tone ?? "#fff",
                "--dx": effect.to ? effect.to.x - effect.at.x : 0,
                "--dy": effect.to ? effect.to.y - effect.at.y : 0,
                animationDelay: effect.delay ? `${effect.delay}ms` : undefined,
              } as CSSProperties}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) drop(effect.key);
              }}
            >
              {effect.kind === "word" ? effect.words : null}
            </span>
          ))}
        </div>
      </div>
      <p className="couch-fight-map-legend" aria-hidden="true">
        <span data-key="reach">Enemy reach</span>
        {who ? (
          feetLeft > 0 ? <span data-key="move">{who} can move {feetLeft} ft</span> : <span>{who} has no movement left</span>
        ) : null}
        <span>1 square = 5 ft</span>
      </p>
    </section>
  );
}

function tokenPicture(
  token: FightMapToken,
  sheets: ReadonlyMap<string, CharacterSheet>,
  enemies: ReadonlyMap<string, CouchFight["enemies"][number]>,
  art: FightArtMap,
): string | null {
  if (token.kind === "pc") return sheets.get(token.refId)?.portrait?.url ?? null;
  const enemy = enemies.get(token.refId);
  return enemy ? enemyArt(art, enemy) : null;
}

function MapToken({ token, src, current, anim, left, top, onDone }: {
  token: FightMapToken;
  src: string | null;
  current: boolean;
  anim: Effect | undefined;
  left: string;
  top: string;
  onDone: (key: string) => void;
}) {
  const toward = anim?.kind === "lunge" && anim.to ? { x: Math.sign(anim.to.x - anim.at.x), y: Math.sign(anim.to.y - anim.at.y) } : { x: 0, y: 0 };
  return (
    <div
      className="couch-fight-map-token"
      data-kind={token.kind}
      data-current={current ? "" : undefined}
      data-down={token.down ? "" : undefined}
      style={{ left, top }}
    >
      <span
        key={anim?.key ?? "still"}
        className="couch-fight-map-figure"
        data-anim={anim?.kind}
        data-look={anim?.look}
        style={{ "--tx": toward.x, "--ty": toward.y, animationDelay: anim?.delay ? `${anim.delay}ms` : undefined } as CSSProperties}
        onAnimationEnd={(event) => {
          if (anim && event.target === event.currentTarget) onDone(anim.key);
        }}
      >
        <CouchFace src={src} name={token.name} />
      </span>
      <span className="couch-fight-map-name">{seatName(token.name)}</span>
    </div>
  );
}
