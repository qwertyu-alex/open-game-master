"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { PageSection, PageShell } from "@/components/PageShell";
import { cn } from "@/lib/cn";
import { OFF_LIMITS_MAX, PLAYERS_MAX } from "@/lib/couch/limits";
import { ScenarioTile } from "@/components/couch/ScenarioTile";
import { SCENARIO_CARDS, crewSeats, fitAiCrew, scenarioCard } from "@/lib/couch/scenario-cards";
import { PIXEL_ICONS, ui } from "@/lib/ui";

// Couch night (docs/couch-mode-spec.md Part 1, "Campaign creation and the
// lobby"): one screen instead of the campaign wizard. Three answers, all of
// them with a default that serves most rooms: the story (one of the written
// ones, each played on a map of its site; the home screen's cards open here
// with ?scenario=), how many people will play on their phones (and how many
// AI crewmates make up the rest of the crew, none unless the story needs
// more people than came), and anything off limits, which the room keeps
// before the first scene. Everything else
// is couch mode's own (src/lib/couch/forge-logic.ts couchGameSettings).
// Start makes the night on this device's account, which becomes the TV, and
// opens the TV's screen while the crew is made.

export default function CouchNightPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const asked = use(searchParams).scenario;
  const router = useRouter();
  const limitsId = useId();
  const [story, setStory] = useState(() => (typeof asked === "string" && scenarioCard(asked) ? asked : SCENARIO_CARDS[0].id));
  const card = scenarioCard(story) ?? SCENARIO_CARDS[0];
  const [players, setPlayers] = useState(() => Math.min(Math.max(3, card.players.min), card.players.max));
  // The AI crewmates (src/lib/couch/ai-crew.ts): none by default, and kept
  // inside the story's crew as the head count or the story changes.
  const [aiCrew, setAiCrew] = useState(0);
  const [offLimits, setOffLimits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // An admin can read a ready-made story in full (/couch/stories/[id]), to
  // debug it; nobody else is shown the way in.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: { isAdmin?: boolean } | null } | null) => setAdmin(data?.user?.isAdmin === true))
      .catch(() => undefined);
  }, []);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/couch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: card.id, players, aiCrew, offLimits: offLimits.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as { campaignId?: string; error?: string };
      if (!response.ok || !body.campaignId) {
        setError(response.status === 401 ? "Sign in on this device first: it becomes the TV." : body.error || "The night could not be started. Try again.");
        setBusy(false);
        return;
      }
      router.push(`/campaigns/${body.campaignId}/table`);
    } catch {
      setError("The server could not be reached. Try again.");
      setBusy(false);
    }
  }

  // A story carries a crew of its own size: picking one keeps the head
  // count inside it, with the AI making up a room too small for it.
  function pickStory(id: string) {
    setStory(id);
    const picked = scenarioCard(id);
    if (!picked) return;
    const people = Math.min(players, picked.players.max);
    setPlayers(people);
    setAiCrew(fitAiCrew(picked, people, aiCrew));
  }

  function pickPlayers(count: number) {
    setPlayers(count);
    setAiCrew(fitAiCrew(card, count, aiCrew));
  }

  return (
    <PageShell
      icon={PIXEL_ICONS.story}
      glyph="ui-act"
      width="wide"
      className="max-w-6xl"
      title="Couch night"
      blurb="One TV, everyone's phone, and a sci-fi horror one-shot the AI runs, played on a map of the place."
    >
      <form onSubmit={start} className="space-y-4">
        <PageSection heading="The story">
          <fieldset>
            <legend className="text-sm font-medium text-stone-200">Tonight&apos;s story</legend>
            <p className="mt-1 text-sm text-stone-400">Each one is played on a map of the place, drawn as the crew finds it. Nothing here gives away a twist.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SCENARIO_CARDS.map((entry) => (
                <StoryChoice key={entry.id} id={entry.id} label={entry.title} checked={story === entry.id} onPick={pickStory}>
                  <ScenarioTile
                    card={entry}
                    selected={story === entry.id}
                    footer={
                      admin ? (
                        <a
                          href={`/couch/stories/${entry.id}`}
                          target="_blank"
                          rel="noopener"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex min-h-10 items-center self-start text-sm text-amber-200 underline-offset-4 hover:text-amber-400 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-amber-300"
                        >
                          Read the story (spoilers)
                        </a>
                      ) : null
                    }
                  />
                </StoryChoice>
              ))}
            </div>
          </fieldset>

        </PageSection>

        <PageSection heading="The room">
          <CountPicker
            name="players"
            legend="Players on phones"
            hint={`"${card.title}" needs a crew of ${card.players.min} to ${card.players.max}, best with ${card.players.best}. The TV does not count.`}
            counts={Array.from({ length: PLAYERS_MAX }, (_, index) => index + 1)}
            value={players}
            allowed={(count) => crewSeats(card, count, fitAiCrew(card, count, aiCrew))}
            onPick={pickPlayers}
          />

          <CountPicker
            name="ai-crew"
            legend="AI crewmates"
            hint={
              players < card.players.min
                ? `Not enough people for this crew: the AI plays ${card.players.min - players === 1 ? "one more character, with a secret agenda" : `${card.players.min - players} more characters, each with a secret agenda`} of their own. Phones choose first; the AI takes what is left.`
                : "Short a friend or two? The AI can play more of the crew, each with a secret agenda of their own. Phones choose first; the AI takes what is left."
            }
            counts={Array.from({ length: PLAYERS_MAX }, (_, index) => index)}
            value={aiCrew}
            allowed={(count) => crewSeats(card, players, count)}
            onPick={setAiCrew}
            className="mt-5"
          />

          <label htmlFor={limitsId} className="mt-5 block text-sm font-medium text-stone-200">
            Anything off-limits tonight?
          </label>
          <p id={`${limitsId}-hint`} className="mt-1 text-sm text-stone-400">
            The story never goes there. A word or two each, separated by commas: spiders, needles, drowning.
          </p>
          <input
            id={limitsId}
            aria-describedby={`${limitsId}-hint`}
            value={offLimits}
            onChange={(event) => setOffLimits(event.target.value.slice(0, OFF_LIMITS_MAX))}
            maxLength={OFF_LIMITS_MAX}
            className={cn(ui.input, "mt-2 h-11 text-base focus-visible:ring-2 focus-visible:ring-amber-400/60")}
          />
        </PageSection>

        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={cn(ui.btnPrimary, "h-12 px-6 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950")}>
            {busy ? "Starting..." : "Start the night"}
          </button>
          <p className="text-sm text-stone-400">This device becomes the TV. Friends join from their phones with the code it shows.</p>
        </div>
      </form>
    </PageShell>
  );
}

// A row of numbers to pick one from (how many play on phones, how many
// the AI plays): radios drawn as finger-sized buttons, a count the story
// cannot seat greyed out.
function CountPicker({
  name,
  legend,
  hint,
  counts,
  value,
  allowed,
  onPick,
  className,
}: {
  name: string;
  legend: string;
  hint: string;
  counts: number[];
  value: number;
  allowed: (count: number) => boolean;
  onPick: (count: number) => void;
  className?: string;
}) {
  const hintId = useId();
  return (
    <fieldset className={className} aria-describedby={hintId}>
      <legend className="text-sm font-medium text-stone-200">{legend}</legend>
      <p id={hintId} className="mt-1 text-sm text-stone-400">
        {hint}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {counts.map((count) => (
          <label key={count} className="relative">
            <input
              type="radio"
              name={name}
              value={count}
              checked={value === count}
              disabled={!allowed(count)}
              onChange={() => onPick(count)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-4 font-display text-base",
                "border-stone-600/70 bg-stone-900/50 text-stone-200 hover:border-amber-500/50",
                "peer-checked:border-amber-400 peer-checked:bg-amber-400/15 peer-checked:text-amber-100",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-40 peer-disabled:hover:border-stone-600/70",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-stone-950",
              )}
            >
              {count}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// One choice in the story picker: a radio drawn as the whole tile, named
// by the story's title alone so a screen reader is not read the blurb on
// every arrow press.
function StoryChoice({ id, label, checked, onPick, children }: { id: string; label: string; checked: boolean; onPick: (id: string) => void; children: ReactNode }) {
  return (
    <label className="relative block h-full cursor-pointer">
      <input type="radio" name="story" value={id} checked={checked} onChange={() => onPick(id)} aria-label={label} className="peer sr-only" />
      <span className="block h-full rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-amber-300 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-stone-950">
        {children}
      </span>
    </label>
  );
}
