"use client";

import { Check, Clock, Flame, Snowflake, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { INTENSITY_LABELS, scenarioCover, type ScenarioCard } from "@/lib/couch/scenario-cards";

// Words over a painting keep the night palette's literal gold and white,
// as the title screen's do (world.css): the theme tokens turn dark in the
// day theme, and a painting is night in both.

// One story as a poster: its cover (the opening place, painted ahead of
// time, never the threat), the place and title over it, then what a room
// needs to choose without being spoiled: the hook, how many players and
// how long, how hard it hits, its mood and what it shows. The couch-night
// screen's story picker (src/app/couch/page.tsx) and the home screen's
// ready-made nights (src/app/home/ReadyNights.tsx) both draw it; the
// wrapper (a radio label or a link) is theirs.

const OCCASION_ICON: Record<NonNullable<ScenarioCard["occasion"]>, LucideIcon> = {
  Halloween: Flame,
  Christmas: Snowflake,
};

export function ScenarioTile({ card, selected = false, footer }: { card: ScenarioCard; selected?: boolean; footer?: ReactNode }) {
  const [coverMissing, setCoverMissing] = useState(false);
  const Occasion = card.occasion ? OCCASION_ICON[card.occasion] : null;
  return (
    <TileFrame selected={selected}>
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-950 via-stone-950 to-black">
        {coverMissing ? null : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scenarioCover(card)}
            alt=""
            loading="lazy"
            onError={() => setCoverMissing(true)}
            className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" aria-hidden="true" />
        {Occasion ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-[#e3c15c]/60 bg-black/60 px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-[#f4e0a6] backdrop-blur-sm">
            <Occasion className="size-3.5" aria-hidden="true" />
            {card.occasion}
          </span>
        ) : null}
        <SelectedMark selected={selected} />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#f4e0a6]">{card.setting}</p>
          <h3 className="mt-1 font-display text-xl leading-tight text-white drop-shadow">{card.title}</h3>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm leading-relaxed text-stone-300">{card.blurb}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-stone-200" aria-label="At a glance">
          <Fact icon={Users} label={`${card.players.best} players`} title={`Plays ${card.players.min} to ${card.players.max}, best with ${card.players.best}`} />
          <Fact icon={Clock} label={card.hours} />
          <Fact icon={Flame} label={<Intensity level={card.intensity} />} title={`Intensity: ${INTENSITY_LABELS[card.intensity]}`} />
        </ul>
        <ul className="flex flex-wrap gap-1.5" aria-label="Mood">
          {card.mood.map((mood) => (
            <li key={mood} className="rounded-full border border-amber-500/30 bg-amber-400/5 px-2.5 py-0.5 text-xs text-amber-200">
              {mood}
            </li>
          ))}
        </ul>
        <p className="mt-auto text-xs text-stone-500">Shows: {card.contentNotes.join(", ")}</p>
        {footer}
      </div>
    </TileFrame>
  );
}

function TileFrame({ selected, children }: { selected: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border bg-stone-950/70 shadow-lg transition",
        selected
          ? "border-amber-400 ring-2 ring-amber-400/60 shadow-amber-900/30"
          : "border-stone-700/70 hover:-translate-y-0.5 hover:border-amber-500/60 hover:shadow-xl",
      )}
    >
      {children}
    </span>
  );
}

function SelectedMark({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-[#e3c15c] text-[#14101f] shadow-lg">
      <Check className="size-5" aria-hidden="true" />
    </span>
  ) : null;
}

function Fact({ icon: Icon, label, title }: { icon: LucideIcon; label: ReactNode; title?: string }) {
  return (
    <li className="inline-flex items-center gap-1.5" title={title}>
      <Icon className="size-4 text-amber-400" aria-hidden="true" />
      {label}
    </li>
  );
}

// "Tense" with three pips, two lit: the word for the reader, the pips for
// the eye.
function Intensity({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {INTENSITY_LABELS[level]}
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((pip) => (
          <span key={pip} className={cn("h-2.5 w-1.5 rounded-sm", pip <= level ? "bg-amber-400" : "bg-stone-700")} />
        ))}
      </span>
    </span>
  );
}
