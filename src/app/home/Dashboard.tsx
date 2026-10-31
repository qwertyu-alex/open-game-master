"use client";

import { appConfirm } from "@/components/ui/ConfirmDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/campaign-types";
import { offersStoryModel, useCapabilities, type ClientCapabilities } from "@/lib/use-capabilities";
import { AccountMenu, AppBrand, AppHomeButton } from "@/components/AccountMenu";
import { DeletionBanner } from "@/components/DeletionBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { YourTables } from "@/app/home/CampaignList";
import { ContinueHero, EmptyHero, FailedHero, LoadingHero, RecapPanel, ScreenBackdrop } from "@/app/home/ContinueHero";
import { HomeFooter } from "@/app/home/HomeFooter";
import { JoinCard } from "@/app/home/JoinCard";
import { ReadyNights } from "@/app/home/ReadyNights";
import { HomeMenu } from "@/app/home/QuickTiles";
import { SetupNudge } from "@/app/home/SetupNudge";
import { pickContinue, type HomeCampaign } from "@/app/home/types";
import { currentQuery, navigateTo } from "@/lib/navigation";

// The desktop and Android shells' quick tiles land here with ?new=1,
// ?new=solo or ?new=starter and expect a way to start a game. This fork
// starts couch nights only (AGENTS.md, "This fork"), so each of them opens
// the couch night's one screen instead of the upstream wizards.
function requestedNew(): boolean {
  return typeof window !== "undefined" && currentQuery().has("new");
}

// The home is a title screen (docs: "ODM World Concepts", round 3a): the
// table you were last at fills the screen behind a Continue, the menu runs
// down the left like a game's main menu, the recap and your tables sit
// as raised night panels, and the bench, the sigil and the small print wait
// below the fold. In this fork the only ways in are starting a couch night
// and joining one (AGENTS.md, "This fork"): the upstream campaign wizard,
// Quick start, solo adventures, the workshop and the rulebook are not
// offered from home.
export function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [campaigns, setCampaigns] = useState<HomeCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed list fetch must not read as "no campaigns": the empty-table
  // words are a statement about the account, not about the network.
  const [loadFailed, setLoadFailed] = useState(false);
  // Clone and delete failures, shown beside the save slots.
  const [actionError, setActionError] = useState("");
  const [cloningId, setCloningId] = useState("");
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const capabilities = useCapabilities();

  useEffect(() => {
    if (requestedNew()) {
      navigateTo("/couch");
    }
  }, []);

  // The state lands in .then callbacks rather than after an await, so the
  // refetch reads as "subscribe to an external system" to React and to the
  // effect linter, which is what it is.
  const refresh = useCallback(
    () =>
      fetch("/api/campaigns")
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data) {
            setCampaigns(data.campaigns ?? []);
            setLoadFailed(false);
          } else {
            setLoadFailed(true);
          }
        })
        .catch(() => {
          setLoadFailed(true);
        })
        .finally(() => {
          setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function deleteCampaign(campaign: HomeCampaign) {
    if (
      !await appConfirm(
        `Delete "${campaign.title}" for everyone? All characters, messages, and story progress are lost. This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError("");
    const response = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (response?.ok) {
      setCampaigns((current) => current.filter((entry) => entry.id !== campaign.id));
    } else {
      const data = await response?.json().catch(() => ({}));
      setActionError(data?.error || `Could not delete "${campaign.title}".`);
    }
  }

  // A copy of the world without the play: prep travels, the transcript does
  // not (src/lib/db/campaign-clone.ts).
  async function clone(id: string) {
    setCloningId(id);
    setActionError("");
    try {
      const response = await fetch(`/api/campaigns/${id}/clone`, { method: "POST" }).catch(
        () => null,
      );
      if (!response?.ok) {
        const data = await response?.json().catch(() => ({}));
        setActionError(data?.error || "Could not make the copy.");
        return;
      }
      // Refetched rather than pushed onto the list: the list endpoint adds
      // the per-row counts a slot renders, and the clone response is just the
      // new row.
      await refresh();
    } finally {
      setCloningId("");
    }
  }

  function focusJoin() {
    const input = joinInputRef.current;
    if (!input) {
      return;
    }
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus({ preventScroll: true });
  }

  const continueCampaign = loading || loadFailed ? null : pickContinue(campaigns);
  // Start a night: the AI writes the story, so a server with no storyteller
  // has nothing to offer, and an admin may keep table-starting to itself.
  const canStart = user.canCreateCampaigns !== false && offersStoryModel(capabilities);

  return (
    <main className="ts-root bg-starfield">
      <ScreenBackdrop campaign={continueCampaign} />
      <span className="ts-corner ts-corner-tl" aria-hidden="true" />
      <span className="ts-corner ts-corner-tr" aria-hidden="true" />

      <div className="ts-page">
        {/* The first screen: the header, any notice and the stage fill the
            window and grow past it rather than spill out of the frame; the
            lower brackets ride its foot. */}
        <div className="ts-first">
          <span className="ts-corner ts-corner-bl" aria-hidden="true" />
          <span className="ts-corner ts-corner-br" aria-hidden="true" />
          {/* The wordmark may shrink and wrap; the action cluster never does,
              so on a narrow phone (or a large system font) the account menu
              stays on screen instead of being pushed past the right edge. */}
          <header className="ts-header animate-fade-up">
            <AppBrand className="ts-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ui/book-closed.webp" alt="" className="ts-brand-book" />
              <span className="ts-wordmark">Open Game Master</span>
            </AppBrand>
            <div className="ts-cluster">
              <AppHomeButton />
              <NotificationBell />
              <span className="ts-username" aria-hidden="true">{user.username}</span>
              <AccountMenu user={user} onLogout={onLogout} />
            </div>
          </header>
          {user.deletionDueAt ? <DeletionBanner dueAt={user.deletionDueAt} className="ts-deletion" /> : null}
          {user.isAdmin ? <SetupNudge className="ts-deletion" /> : null}

          <section className="ts-stage" aria-label="Title screen">
            <div className="ts-stage-left">
              {/* The title block waits for the list: showing "empty table"
                  before the answer arrives would flash a lie at every account
                  with tables, and a failed fetch is not an empty account either. */}
              {loading ? (
                <LoadingHero />
              ) : loadFailed && campaigns.length === 0 ? (
                <FailedHero
                  onRetry={() => {
                    setLoading(true);
                    void refresh();
                  }}
                />
              ) : continueCampaign ? (
                <ContinueHero campaign={continueCampaign} userId={user.id} />
              ) : (
                <EmptyHero canStart={canStart} />
              )}
              <HomeMenu
                showCouch={canStart}
                onJoin={focusJoin}
                firstTime={!loading && !loadFailed && campaigns.length === 0}
              />
              <DmStatusLine capabilities={capabilities} />
            </div>
            <div className="ts-stage-right">
              {continueCampaign ? <RecapPanel campaign={continueCampaign} /> : null}
              <YourTables
                campaigns={campaigns}
                loading={loading}
                userId={user.id}
                cloningId={cloningId}
                actionError={actionError}
                onClone={clone}
                onDelete={deleteCampaign}
                canStart={canStart}
              />
            </div>
          </section>
        </div>

        <section className="ts-below">
          <ReadyNights canStart={canStart} />
          <JoinCard inputRef={joinInputRef} />
          <HomeFooter />
        </section>

      </div>
    </main>
  );
}

// "The DM is awake · qwen3.6-35b · v0.23.4": one mono line at the foot of
// the menu, the way a title screen shows its build. The lamp is lit gold
// when the storyteller answers, ember when it is configured but not
// answering, and unlit on a server with no AI storyteller at all.
function DmStatusLine({ capabilities }: { capabilities: ClientCapabilities | null }) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/providers")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.version) setVersion(String(data.version));
      })
      .catch(() => {
        // the line simply omits the version
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const story = capabilities?.story;
  const tone = !capabilities ? "wait" : !story?.configured ? "off" : story.reachable ? "awake" : "dozing";
  const words =
    tone === "wait"
      ? "Waking the GM"
      : tone === "off"
        ? "No AI storyteller · a couch night needs one"
        : tone === "awake"
          ? "The GM is awake"
          : "The GM is not answering";
  const bits = [words];
  if (story?.model && tone !== "off") bits.push(story.model);
  if (version) bits.push(`v${version}`);
  return (
    <p className={`ts-status ts-status-${tone} ts-reveal`} style={{ animationDelay: "1200ms" }} aria-live="polite">
      <span className="ts-lamp" aria-hidden="true" />
      {bits.join(" · ")}
    </p>
  );
}
