"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { AgendaCard, CouchFace, CouchHp } from "@/components/couch/CouchParts";
import { CouchRules } from "@/components/couch/CouchRules";
import { couchCharacter, signed } from "@/components/couch/character-logic";

// The phone's Character view (docs/couch-mode-spec.md 2.7): everything that
// is yours, laid out for deciding what to try. The TV shows the room what
// it shares (names, health, the picture, the route); this is what nobody
// else needs to see. Health and armour first, then the secret agenda, the
// checks you are best at, the six abilities, what you swing, what your
// features do and what you carry. Who you are and how to play close it.
export function CouchCharacter({
  sheet,
  agendaFresh,
  onAgendaSeen,
}: {
  sheet: CharacterSheet;
  agendaFresh: boolean;
  onAgendaSeen: () => void;
}) {
  const view = useMemo(() => couchCharacter(sheet), [sheet]);
  const [allChecks, setAllChecks] = useState(false);
  const max = effectiveMaxHp(sheet);
  const hp = Math.max(0, sheet.currentHp);
  const role = sheet.crewRole?.trim() ?? "";
  const trained = view.checks.filter((check) => check.training);
  const checks = allChecks || !trained.length ? view.checks : trained;
  const conditions = sheet.conditions.filter(Boolean);
  return (
    <div className="couch-sheet">
      <section className="couch-sheet-hero" aria-label="Who you are">
        <CouchFace src={sheet.portrait?.url} name={sheet.name} size="72px" />
        <span className="grid min-w-0 gap-1">
          <span className="couch-me-name">{sheet.name}</span>
          {role ? <span className="couch-me-role">{role}</span> : null}
        </span>
      </section>

      <section className="couch-sheet-block couch-vitals" aria-label="Health and defence">
        <div className="couch-vitals-hp">
          <span className="couch-label">Health</span>
          <b>
            {hp}
            <small> / {max}</small>
            {sheet.tempHp > 0 ? <small className="couch-vitals-temp"> +{sheet.tempHp} temporary</small> : null}
          </b>
        </div>
        <CouchHp current={sheet.currentHp} max={max} />
        <div className="couch-pills">
          <Pill label="Armour" hint="What an attack must reach to hit you">
            {sheet.ac}
          </Pill>
          <Pill label="Initiative" hint="Added when a fight decides who acts first">
            {signed(view.initiative)}
          </Pill>
          {conditions.map((condition) => (
            <Pill key={condition} tone="warn" label={condition.replace(/^./, (letter) => letter.toUpperCase())} />
          ))}
          {sheet.exhaustion > 0 ? (
            <Pill tone="warn" label="Exhaustion">
              {sheet.exhaustion}
            </Pill>
          ) : null}
        </div>
      </section>

      {sheet.agenda ? (
        <div onPointerDown={onAgendaSeen} onFocus={onAgendaSeen}>
          <AgendaCard agenda={sheet.agenda} fresh={agendaFresh} />
        </div>
      ) : null}

      <Block title="Checks" hint="When you try something uncertain, the GM rolls a twenty-sided die and adds this. Trained adds your training once, Expert twice.">
        <ul className="couch-checks">
          {checks.map((check) => (
            <li key={check.id} className="couch-check" data-training={check.training ?? undefined}>
              <span className="couch-check-name">
                {check.name}
                <span className="couch-check-ability"> · {check.ability}</span>
              </span>
              {check.training ? <span className="couch-check-tag">{check.training === "expert" ? "Expert" : "Trained"}</span> : null}
              <b className="couch-check-bonus">{signed(check.bonus)}</b>
            </li>
          ))}
        </ul>
        {trained.length ? (
          <button type="button" className="couch-link justify-self-start text-sm" onClick={() => setAllChecks((all) => !all)}>
            {allChecks ? "Only your trained checks" : `All ${view.checks.length} checks`}
          </button>
        ) : null}
      </Block>

      <Block title="Abilities" hint="The big number is added to checks of that kind; a save resists something done to you.">
        <div className="couch-abilities">
          {view.abilities.map((ability) => (
            <div key={ability.key} className="couch-ability" data-trained={ability.saveTrained ? "" : undefined}>
              <b>{signed(ability.mod)}</b>
              <span className="couch-ability-name">{ability.name}</span>
              <span className="couch-ability-save">
                save {signed(ability.save)}
                {ability.saveTrained ? <span className="sr-only"> (trained)</span> : null}
              </span>
            </div>
          ))}
        </div>
      </Block>

      {view.weapons.length ? (
        <Block title="Weapons">
          <ul className="grid">
            {view.weapons.map((weapon) => (
              <li key={weapon.name} className="couch-row">
                <span className="couch-row-name">{weapon.name}</span>
                <span className="couch-row-numbers">
                  {signed(weapon.toHit)} to hit · {weapon.damage}
                  {weapon.type ? ` ${weapon.type}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.features.length ? (
        <Block title="What you can do">
          <ul className="grid">
            {view.features.map((feature) => (
              <li key={feature.name} className="couch-feature">
                <span className="couch-row-name">{feature.name}</span>
                {feature.text ? <p>{feature.text}</p> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.gear.length ? (
        <Block title="Carrying">
          <ul className="couch-gear">
            {view.gear.map((item, index) => (
              <li key={`${item.name}:${index}`}>
                {item.name}
                {item.qty > 1 ? <span className="couch-gear-qty"> ×{item.qty}</span> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {sheet.backstory.trim() || sheet.personality.trim() ? (
        <Block title={`About ${sheet.name}`}>
          {sheet.backstory.trim() ? <p className="couch-sheet-text">{sheet.backstory}</p> : null}
          {sheet.personality.trim() ? <p className="couch-sheet-text">{sheet.personality}</p> : null}
        </Block>
      ) : null}

      <details className="couch-sheet-block couch-sheet-rules">
        <summary>How to play · rules and dice</summary>
        <CouchRules />
      </details>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="couch-sheet-block" aria-labelledby={titleId}>
      <h2 id={titleId} className="couch-label">
        {title}
      </h2>
      {hint ? <p className="couch-sheet-hint">{hint}</p> : null}
      {children}
    </section>
  );
}

function Pill({ label, hint, tone, children }: { label: string; hint?: string; tone?: "warn"; children?: ReactNode }) {
  return (
    <span className="couch-pill" data-tone={tone} title={hint}>
      {label}
      {children !== undefined ? <b>{children}</b> : null}
    </span>
  );
}
