"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { effectiveMaxHp } from "@/lib/dm/condition-logic";
import { iconCandidates } from "@/lib/icons";
import { variantUrl } from "@/lib/image-format";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { AgendaCard, CouchFace, CouchHp } from "@/components/couch/CouchParts";
import { CouchRules } from "@/components/couch/CouchRules";
import {
  aboutParts,
  signed,
  type CharacterSection,
  type CouchCharacter as CouchCharacterView,
  type CouchItem,
  type CouchWeapon,
} from "@/components/couch/character-logic";

// The phone's Character view (docs/couch-mode-spec.md 2.7): everything that
// is yours, sorted by when a player reaches for it. Who you are and how you
// are doing stay on top (face, health, armour, conditions); below, three
// sections, each for a moment in the night. Gear is what you can use, and
// changes as things are found and spent, so it is pictures you can scan.
// Skills is what you are good at, for weighing what to try. About is who
// you are and what you secretly want, read closely at the start and again
// when an act changes the agenda. Which section opens is the phone's call
// (sectionOnEntry in character-logic.ts).
export function CouchCharacter({
  sheet,
  view,
  crew,
  section,
  onSection,
  art,
  newGear,
  agendaFresh,
  onAgendaSeen,
  onUse,
}: {
  sheet: CharacterSheet;
  view: CouchCharacterView;
  // The other crew members, for the faces beside your ties to them.
  crew: CharacterSheet[];
  section: CharacterSection;
  onSection: (section: CharacterSection) => void;
  // The pictures the night painted, by item key (useItemArt).
  art: Record<string, string>;
  newGear: ReadonlySet<string>;
  agendaFresh: boolean;
  onAgendaSeen: () => void;
  // Start a move with this item in the action box.
  onUse: (item: CouchItem) => void;
}) {
  const [open, setOpen] = useState<CouchItem | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const max = effectiveMaxHp(sheet);
  const hp = Math.max(0, sheet.currentHp);
  const role = sheet.crewRole?.trim() ?? "";
  const conditions = sheet.conditions.filter(Boolean);
  const choose = (next: CharacterSection) => {
    onSection(next);
    // A section chosen from below its tabs starts at its top.
    const tabs = sectionsRef.current;
    if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: "start" });
  };
  return (
    <div className="couch-sheet">
      <section className="couch-sheet-hero" aria-label="Who you are">
        <CouchFace src={sheet.portrait?.url} name={sheet.name} size="84px" />
        <div className="couch-hero-text">
          <span className="couch-me-name">{sheet.name}</span>
          {role ? <span className="couch-me-role">{role}</span> : null}
          <div className="couch-hero-hp">
            <CouchHp current={sheet.currentHp} max={max} />
            <b>
              {hp}
              <small>/{max}</small>
            </b>
          </div>
        </div>
        <div className="couch-pills couch-hero-pills">
          <Pill label="Armour" hint="What an attack must reach to hit you">
            {sheet.ac}
          </Pill>
          {sheet.tempHp > 0 ? (
            <Pill tone="good" label="Extra health" hint="Lost before your health, and gone after a rest">
              +{sheet.tempHp}
            </Pill>
          ) : null}
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

      <SectionTabs
        refEl={sectionsRef}
        section={section}
        onSection={choose}
        marks={{ gear: newGear.size > 0, about: agendaFresh }}
      />

      <div id="couch-section-gear" role="tabpanel" aria-labelledby="couch-section-tab-gear" className="couch-section" hidden={section !== "gear"}>
        <GearSection view={view} art={art} newGear={newGear} onOpen={setOpen} />
      </div>
      <div id="couch-section-skills" role="tabpanel" aria-labelledby="couch-section-tab-skills" className="couch-section" hidden={section !== "skills"}>
        <SkillsSection sheet={sheet} view={view} />
      </div>
      <div id="couch-section-about" role="tabpanel" aria-labelledby="couch-section-tab-about" className="couch-section" hidden={section !== "about"}>
        <AboutSection sheet={sheet} crew={crew} agendaFresh={agendaFresh} onAgendaSeen={onAgendaSeen} />
      </div>

      <ItemSheet
        item={open}
        sheet={sheet}
        view={view}
        art={art}
        fresh={open ? newGear.has(open.key) : false}
        onClose={close}
        onUse={(item) => {
          setOpen(null);
          onUse(item);
        }}
      />
    </div>
  );
}

const SECTIONS: Array<{ id: CharacterSection; label: string; mark: string }> = [
  { id: "gear", label: "Gear", mark: "something new picked up" },
  { id: "skills", label: "Skills", mark: "" },
  { id: "about", label: "About", mark: "a new agenda to read" },
];

// The three sections as a segmented control (the ARIA tabs pattern, as the
// Story and Character tabs above it).
function SectionTabs({
  refEl,
  section,
  onSection,
  marks,
}: {
  refEl: RefObject<HTMLDivElement | null>;
  section: CharacterSection;
  onSection: (section: CharacterSection) => void;
  marks: Partial<Record<CharacterSection, boolean>>;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const at = SECTIONS.findIndex((entry) => entry.id === section);
    const next = SECTIONS[(at + (event.key === "ArrowRight" ? 1 : SECTIONS.length - 1)) % SECTIONS.length].id;
    onSection(next);
    document.getElementById(`couch-section-tab-${next}`)?.focus();
  };
  return (
    <div ref={refEl} className="couch-sections" role="tablist" aria-label="Your character">
      {SECTIONS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          id={`couch-section-tab-${entry.id}`}
          role="tab"
          className="couch-section-tab"
          aria-selected={section === entry.id}
          aria-controls={`couch-section-${entry.id}`}
          tabIndex={section === entry.id ? 0 : -1}
          onClick={() => onSection(entry.id)}
          onKeyDown={onKeyDown}
        >
          {entry.label}
          {marks[entry.id] ? (
            <>
              <i className="couch-dot" aria-hidden="true" />
              <span className="sr-only">, {entry.mark}</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ---- Gear: what you can use ----

function GearSection({
  view,
  art,
  newGear,
  onOpen,
}: {
  view: CouchCharacterView;
  art: Record<string, string>;
  newGear: ReadonlySet<string>;
  onOpen: (item: CouchItem) => void;
}) {
  const { signature, weapons, worn, gear } = view;
  if (!signature && !weapons.length && !worn.length && !gear.length) {
    return <p className="couch-sheet-hint">You carry nothing yet. What you find in the story lands here.</p>;
  }
  return (
    <>
      {signature ? (
        <button type="button" className="couch-signature" onClick={() => onOpen(signature)}>
          <ItemPicture item={signature} art={art} />
          <span className="couch-signature-text">
            <span className="couch-label">Yours alone</span>
            <span className="couch-signature-name">{signature.title}</span>
            {signature.rest ? <span className="couch-signature-full">{signature.rest}</span> : null}
          </span>
        </button>
      ) : null}

      {weapons.length ? (
        <Block title="Weapons" hint="Tap one to attack with it.">
          <ul className="couch-weapons">
            {weapons.map((weapon) => (
              <li key={weapon.key}>
                <button type="button" className="couch-weapon" onClick={() => onOpen(weapon)}>
                  <ItemPicture item={weapon} art={art} size="sm" fresh={newGear.has(weapon.key)} />
                  <span className="couch-weapon-text">
                    <span className="couch-row-name">{weapon.title}</span>
                    <span className="couch-row-numbers">
                      {weapon.damage}
                      {weapon.type ? ` ${weapon.type}` : ""}
                    </span>
                  </span>
                  <span className="couch-weapon-hit">
                    <b>{signed(weapon.toHit)}</b>
                    <span>to hit</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {worn.length || gear.length ? (
        <Block title={`Carrying · ${worn.length + gear.length}`} hint="Tap a thing to see it, or to use it.">
          <ul className="couch-items">
            {[...worn, ...gear].map((item) => (
              <li key={item.key}>
                <button type="button" className="couch-item" onClick={() => onOpen(item)}>
                  <ItemPicture item={item} art={art} fresh={newGear.has(item.key)} />
                  <span className="couch-item-name">{item.title}</span>
                  {worn.includes(item) ? <span className="couch-item-tag">Worn</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

// An item's picture: the painted icon, else the one the night painted,
// else its first letter while that paints (or where no painter runs). A
// count rides in the corner, and a new thing says so.
function ItemPicture({
  item,
  art,
  size = "md",
  fresh = false,
}: {
  item: CouchItem;
  art: Record<string, string>;
  size?: "sm" | "md" | "lg";
  fresh?: boolean;
}) {
  const night = art[item.key];
  const painted = item.icon ?? (night ? variantUrl(night, size === "lg" ? 1024 : 256) : null);
  const [failed, setFailed] = useState<string | null>(null);
  const src = painted && failed !== painted ? painted : null;
  return (
    <span className="couch-pic" data-size={size} data-fit={item.icon ? "icon" : "art"} aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <span className="couch-pic-letter">{Array.from(item.title)[0] ?? "?"}</span>
      )}
      {item.qty > 1 ? <span className="couch-pic-qty">×{item.qty}</span> : null}
      {fresh ? <span className="couch-pic-new">New</span> : null}
    </span>
  );
}

// One item up close, as a sheet from the foot of the screen (the Map's
// sheet): the picture large, what it is, the rules' own words for it when
// the content pack knows it, and Use, which starts the move in the action
// box. Back, Done, a tap outside or a drag down closes it.
function ItemSheet({
  item,
  sheet,
  view,
  art,
  fresh,
  onClose,
  onUse,
}: {
  item: CouchItem | null;
  sheet: CharacterSheet;
  view: CouchCharacterView;
  art: Record<string, string>;
  fresh: boolean;
  onClose: () => void;
  onUse: (item: CouchItem) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = item !== null;
  // The last item shown stays in the sheet while it slides away.
  const [shown, setShown] = useState<CouchItem | null>(item);
  if (item && item !== shown) setShown(item);
  const rules = useItemRules(item?.name ?? null, !item || item.key === view.signature?.key);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Back closes the sheet instead of leaving the table, as the Map's does.
  useEffect(() => {
    if (!open) return;
    let pushed = false;
    let popped = false;
    const timer = window.setTimeout(() => {
      window.history.pushState(window.history.state, "");
      pushed = true;
    }, 0);
    const onPop = () => {
      popped = true;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    const root = document.documentElement;
    root.dataset.sheet = "open";
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      delete root.dataset.sheet;
      if (pushed && !popped) window.history.back();
    };
  }, [open, onClose]);

  const drag = useRef<{ startY: number; lastY: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  const shownItem = item ?? shown;
  const weapon = shownItem ? view.weapons.find((entry) => entry.key === shownItem.key) : undefined;
  const worn = shownItem ? view.worn.some((entry) => entry.key === shownItem.key) : false;
  const signature = Boolean(shownItem && view.signature?.key === shownItem.key);
  return (
    <dialog
      ref={ref}
      className="couch-map-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {shownItem ? (
        <div className="couch-map-panel" style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
          <div
            className="couch-map-head"
            onPointerDown={(event) => {
              if (event.target instanceof HTMLElement && event.target.closest("button")) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { startY: event.clientY, lastY: event.clientY };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              drag.current.lastY = event.clientY;
              setDragY(Math.max(0, event.clientY - drag.current.startY));
            }}
            onPointerUp={() => {
              const started = drag.current;
              drag.current = null;
              setDragY(0);
              if (started && started.lastY - started.startY > 90) onClose();
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragY(0);
            }}
          >
            <span className="couch-map-grabber" aria-hidden="true" />
            <div className="couch-map-titles">
              <h2 id={titleId} className="couch-map-title">
                {shownItem.title}
              </h2>
              <p className="couch-map-sub">
                {signature ? "Yours alone, from your story" : weapon ? "Weapon" : worn ? "Worn" : (rules.type ?? "Carried")}
                {shownItem.qty > 1 ? ` · ${shownItem.qty} of them` : ""}
                {fresh ? " · new" : ""}
              </p>
            </div>
            <button type="button" className="couch-map-done" onClick={onClose}>
              Done
            </button>
          </div>
          <div className="couch-map-body couch-item-body">
            <ItemPicture item={shownItem} art={art} size="lg" />
            {shownItem.full ? <p className="couch-item-full">{shownItem.full}</p> : null}
            {weapon ? <WeaponFacts weapon={weapon} /> : null}
            {worn ? (
              <p className="couch-sheet-text">
                You are wearing it. With it on, an attack must reach <b>{sheet.ac}</b> to hit you.
              </p>
            ) : null}
            {rules.text ? <p className="couch-sheet-text couch-item-rules">{rules.text}</p> : null}
            <button type="button" className="couch-btn couch-btn-primary" onClick={() => onUse(shownItem)}>
              {weapon ? `Attack with the ${shownItem.title.toLowerCase()}` : "Use it"}
            </button>
            <p className="couch-sheet-hint">Starts your move in the action box. Say what you do with it, then send.</p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function WeaponFacts({ weapon }: { weapon: CouchWeapon }) {
  return (
    <div className="couch-item-facts">
      <span>
        <b>{signed(weapon.toHit)}</b>
        <span className="couch-label">to hit</span>
      </span>
      <span>
        <b>{weapon.damage}</b>
        <span className="couch-label">{weapon.type || "damage"}</span>
      </span>
    </div>
  );
}

// What the rules say an item is and does, from the content pack (the
// table's item card reads the same rows, src/lib/help/item-sheet.ts).
// Nothing is looked up for the signature item, which is the story's own.
function useItemRules(name: string | null, skip: boolean): { type: string | null; text: string | null } {
  const [found, setFound] = useState<{ name: string; type: string | null; text: string | null } | null>(null);
  useEffect(() => {
    if (!name || skip) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ buildItemSheet }, { textKey }] = await Promise.all([import("@/lib/help/item-sheet"), import("@/lib/language/text-logic")]);
        const wanted = textKey(name);
        const response = await fetch(`/api/content/items?q=${encodeURIComponent(wanted)}&limit=20`);
        const data = response.ok ? ((await response.json()) as { results?: Array<{ name: string; data?: Record<string, unknown> }> }) : null;
        const rows = (data?.results ?? []).filter((entry) => textKey(entry.name) === wanted).map((entry) => entry.data);
        const card = buildItemSheet(name, rows);
        if (!cancelled) setFound({ name, type: card?.type ?? null, text: card?.description ?? null });
      } catch {
        if (!cancelled) setFound({ name, type: null, text: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, skip]);
  return found && found.name === name && !skip ? found : { type: null, text: null };
}

// ---- Skills: what you are good at ----

function SkillsSection({ sheet, view }: { sheet: CharacterSheet; view: CouchCharacterView }) {
  const [allChecks, setAllChecks] = useState(false);
  const trained = view.checks.filter((check) => check.training);
  const checks = allChecks || !trained.length ? view.checks : trained;
  return (
    <>
      <Block
        title={allChecks || !trained.length ? "Checks" : "Your best checks"}
        hint="When you try something uncertain, the GM rolls a twenty-sided die and adds this. Trained adds your training once, Expert twice."
      >
        <ul className="couch-checks">
          {checks.map((check) => (
            <li key={check.id} className="couch-check" data-training={check.training ?? undefined}>
              <Glyph sources={[`/assets/icons/glyph/skill-${check.id.replace(/_/g, "-")}.webp`]} />
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
          <button type="button" className="couch-more" onClick={() => setAllChecks((all) => !all)}>
            {allChecks ? "Only your best checks" : `All ${view.checks.length} checks`}
          </button>
        ) : null}
      </Block>

      {view.features.length ? (
        <Block title="What you can do">
          <ul className="grid">
            {view.features.map((feature) => (
              <li key={feature.name} className="couch-feature">
                <Glyph sources={iconCandidates({ kind: "feature", key: feature.name, family: `class-${sheet.class}` })} size="lg" />
                <span className="grid gap-1">
                  <span className="couch-row-name">{feature.name}</span>
                  {feature.text ? <p>{feature.text}</p> : null}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

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
        <div className="couch-pills">
          <Pill label="Initiative" hint="Added when a fight decides who acts first">
            {signed(view.initiative)}
          </Pill>
        </div>
      </Block>
    </>
  );
}

// A small painting beside a line, trying each source in turn and leaving
// the space empty when none paints.
function Glyph({ sources, size = "sm" }: { sources: string[]; size?: "sm" | "lg" }) {
  const [attempt, setAttempt] = useState(0);
  const src = sources[attempt];
  return (
    <span className="couch-glyph" data-size={size} aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setAttempt((n) => n + 1)} />
      ) : null}
    </span>
  );
}

// ---- About: who you are ----

function AboutSection({
  sheet,
  crew,
  agendaFresh,
  onAgendaSeen,
}: {
  sheet: CharacterSheet;
  crew: CharacterSheet[];
  agendaFresh: boolean;
  onAgendaSeen: () => void;
}) {
  const { story, ties, personality } = aboutParts(sheet.backstory, sheet.notes);
  const faceOf = (name: string) => crew.find((member) => member.name.trim().toLowerCase() === name.trim().toLowerCase());
  return (
    <>
      {sheet.agenda ? (
        <div onPointerDown={onAgendaSeen} onFocus={onAgendaSeen}>
          <AgendaCard agenda={sheet.agenda} fresh={agendaFresh} />
        </div>
      ) : null}

      {story.length ? (
        <Block title="Your story" hint="The crew knows this much about you.">
          {story.map((paragraph, index) => (
            <p key={index} className="couch-sheet-text couch-story-text">
              {paragraph}
            </p>
          ))}
        </Block>
      ) : null}

      {ties.length ? (
        <Block title="You and the crew">
          <ul className="couch-ties">
            {ties.map((tie) => {
              const member = faceOf(tie.to);
              return (
                <li key={tie.to} className="couch-tie">
                  <CouchFace src={member?.portrait?.url} name={tie.to} size="44px" />
                  <span className="grid gap-0.5">
                    <span className="couch-row-name">{tie.to}</span>
                    <span className="couch-tie-line">{tie.line}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Block>
      ) : null}

      {personality ? (
        <Block title="How you play them">
          <p className="couch-sheet-text couch-story-text">{personality}</p>
        </Block>
      ) : null}

      <details className="couch-sheet-block couch-sheet-rules">
        <summary>How to play · rules and dice</summary>
        <CouchRules />
      </details>
    </>
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

function Pill({ label, hint, tone, children }: { label: string; hint?: string; tone?: "warn" | "good"; children?: ReactNode }) {
  return (
    <span className="couch-pill" data-tone={tone} title={hint}>
      {label}
      {children !== undefined ? <b>{children}</b> : null}
    </span>
  );
}
