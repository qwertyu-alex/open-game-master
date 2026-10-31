"use client";

import { useRouter } from "next/navigation";
import { use, useId, useState, type FormEvent, type ReactNode } from "react";
import { PageSection, PageShell } from "@/components/PageShell";
import { cn } from "@/lib/cn";
import { OFF_LIMITS_MAX, PLAYERS_MAX, SEED_MAX } from "@/lib/couch/limits";
import { NewStoryTile, ScenarioTile } from "@/components/couch/ScenarioTile";
import { SCENARIO_CARDS, scenarioCard, scenarioSeats } from "@/lib/couch/scenario-cards";
import { PIXEL_ICONS, ui } from "@/lib/ui";

// Couch night (docs/couch-mode-spec.md Part 1, "Campaign creation and the
// lobby"): one screen instead of the campaign wizard. Three answers, all of
// them with a default that serves most rooms: the story (a new one the AI
// writes from a seed, where empty is "surprise us", or one of the
// ready-made ones, which the home screen's cards open here with
// ?scenario=), how many people will play on their phones, and anything off
// limits, which the repo keeps before the first scene. Everything else
// is couch mode's own (src/lib/couch/forge-logic.ts couchGameSettings).
// Start makes the night on this device's account, which becomes the TV, and
// opens the TV's screen while the AI writes the story and the crew.

const SEED_PLACEHOLDER =
  "Surprise us, or give a line: a salvage crew boards a research ship that stopped answering; the night shift on a mining moon goes quiet; a colony's only doctor sends a distress call and then a second one, in a different voice.";

// The new story's choice in the story picker; any other value is a card's id.
const NEW_STORY = "new";

export default function CouchNightPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const asked = use(searchParams).scenario;
  const router = useRouter();
  const seedId = useId();
  const limitsId = useId();
  const [story, setStory] = useState(() => (typeof asked === "string" && scenarioCard(asked) ? asked : NEW_STORY));
  const card = scenarioCard(story);
  const [seed, setSeed] = useState("");
  const [players, setPlayers] = useState(3);
  const [offLimits, setOffLimits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/couch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed: card ? "" : seed.trim(), players, offLimits: offLimits.trim(), scenario: card?.id ?? "" }),
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

  // A ready-made story carries a crew of its own size: picking one keeps
  // the head count inside it.
  function pickStory(id: string) {
    setStory(id);
    const picked = scenarioCard(id);
    if (picked && !scenarioSeats(picked, players)) {
      setPlayers(Math.min(Math.max(players, picked.players.min), picked.players.max));
    }
  }

  return (
    <PageShell
      icon={PIXEL_ICONS.story}
      glyph="ui-act"
      width="wide"
      className="max-w-6xl"
      title="Couch night"
      blurb="One TV, everyone's phone, and a sci-fi horror one-shot the AI runs: a new one it writes tonight, or one already written."
    >
      <form onSubmit={start} className="space-y-4">
        <PageSection heading="The story">
          <fieldset>
            <legend className="text-sm font-medium text-stone-200">Tonight&apos;s story</legend>
            <p className="mt-1 text-sm text-stone-400">Pick one already written, or let the AI write a new one. Nothing here gives away a twist.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StoryChoice id={NEW_STORY} label="Write a new one" checked={story === NEW_STORY} onPick={pickStory}>
                <NewStoryTile selected={story === NEW_STORY} />
              </StoryChoice>
              {SCENARIO_CARDS.map((entry) => (
                <StoryChoice key={entry.id} id={entry.id} label={entry.title} checked={story === entry.id} onPick={pickStory}>
                  <ScenarioTile card={entry} selected={story === entry.id} />
                </StoryChoice>
              ))}
            </div>
          </fieldset>

          {card ? null : (
            <>
              <label htmlFor={seedId} className="mt-5 block text-sm font-medium text-stone-200">
                Story seed
              </label>
              <p id={`${seedId}-hint`} className="mt-1 text-sm text-stone-400">
                Leave it empty and the AI surprises you.
              </p>
              <textarea
                id={seedId}
                aria-describedby={`${seedId}-hint`}
                value={seed}
                onChange={(event) => setSeed(event.target.value.slice(0, SEED_MAX))}
                maxLength={SEED_MAX}
                rows={4}
                placeholder={SEED_PLACEHOLDER}
                className={cn(ui.input, "mt-2 min-h-[6rem] text-base focus-visible:ring-2 focus-visible:ring-amber-400/60")}
              />
            </>
          )}
        </PageSection>

        <PageSection heading="The room">
          <fieldset>
            <legend className="text-sm font-medium text-stone-200">Players on phones</legend>
            <p className="mt-1 text-sm text-stone-400">
              {card ? `"${card.title}" is written for ${card.players.min} to ${card.players.max}, best with ${card.players.best}.` : "One crew member is written for each."} The TV does not count.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: PLAYERS_MAX }, (_, index) => index + 1).map((count) => (
                <label key={count} className="relative">
                  <input
                    type="radio"
                    name="players"
                    value={count}
                    checked={players === count}
                    disabled={card ? !scenarioSeats(card, count) : false}
                    onChange={() => setPlayers(count)}
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
