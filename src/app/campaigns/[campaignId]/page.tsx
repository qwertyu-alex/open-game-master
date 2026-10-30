"use client";

import Link from "next/link";
import { PageSkeleton } from "@/components/PageSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ui } from "@/lib/ui";

import { useSearchParams } from "next/navigation";
import { Suspense, lazy, use, useCallback, useEffect, type ComponentProps } from "react";
import { useCampaignStream, type CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { ContentScopeProvider } from "@/lib/content-scope";
import { pushView, replaceView } from "@/lib/navigation";
import { installPageErrorRecorder } from "@/lib/page-errors";
import { couchSeatView } from "@/components/couch/couch-logic";
import { CouchTvRedirect } from "@/components/couch/CouchTvRedirect";

// The lobby and the table are separate downloads: a table in play never
// needs the lobby's character builder, and a lobby never needs the board,
// the composer or the side panels. The table, where nearly every visit
// lands, starts loading the moment this page mounts, alongside the
// snapshot; a lobby loads once the snapshot says that is where the campaign
// is. Either shows behind the same table skeleton as the snapshot.
const loadLobby = () => import("@/app/campaigns/[campaignId]/Lobby");
const loadSessionView = () => import("@/app/campaigns/[campaignId]/SessionView");
const Lobby = lazy(() => loadLobby().then((module) => ({ default: module.Lobby })));
const SessionView = lazy(() => loadSessionView().then((module) => ({ default: module.SessionView })));
// Couch mode's phone screens (src/components/couch/), their own downloads:
// a campaign that is not in couch mode never fetches them.
const CouchPhoneView = lazy(() => import("@/components/couch/CouchPhoneView").then((module) => ({ default: module.CouchPhoneView })));
const CouchPhoneLobby = lazy(() => import("@/components/couch/CouchPhoneLobby").then((module) => ({ default: module.CouchPhoneLobby })));

export default function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const {
    state,
    refresh,
    refreshNotes,
    refreshSideChat,
    refreshWhispers,
    refreshAsks,
    refreshFacts,
    refreshBattleMap,
    markFxPlayed,
    markCameraDone,
    markTitleCardShown,
    playSting,
  } = useCampaignStream(campaignId);

  useEffect(() => {
    void loadSessionView();
  }, []);
  // A running campaign whose prep this viewer may open (issue 530) has the
  // lobby's panels ready before they are asked for.
  const mayPrep = state.campaign?.status === "active" && Boolean(state.caps?.steersStory);
  useEffect(() => {
    if (mayPrep) void loadLobby();
  }, [mayPrep]);

  // The admin's browser keeps the game page's own errors for "Report a
  // problem" (issue #459, src/lib/page-errors.ts); nobody else can save a
  // report, so nobody else's browser keeps them.
  const recordErrors = Boolean(state.me?.isAdmin);
  useEffect(() => (recordErrors ? installPageErrorRecorder() : undefined), [recordErrors]);

  if (state.loading) {
    return (
      <PageSkeleton kind="table" />
    );
  }

  if (state.error || !state.campaign || !state.me) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <EmptyState
          art="map"
          title={state.error || "Campaign not found."}
          hint={state.answeredBy ? `Answered by ${state.answeredBy}` : undefined}
          action={
            <Link href="/" className={ui.btnSecondary}>
              Back to campaigns
            </Link>
          }
        />
      </main>
    );
  }

  // Every content request made at this table is its own (src/lib/content-scope.tsx).
  return (
    <ContentScopeProvider campaignId={campaignId}>
      <Suspense fallback={<PageSkeleton kind="table" />}>
        <CampaignScreen
          state={state}
          refresh={refresh}
          table={{
            refreshNotes,
            refreshFacts,
            refreshSideChat,
            refreshWhispers,
            refreshAsks,
            refreshBattleMap,
            markFxPlayed,
            markCameraDone,
            markTitleCardShown,
            playSting,
          }}
        />
      </Suspense>
    </ContentScopeProvider>
  );
}

type TableHandlers = Omit<ComponentProps<typeof SessionView>, "state" | "prep">;

// The lobby before the adventure opens; the table once it has. A running
// campaign also has its prep (issue 530): whoever steers the story steps out
// of play to the lobby's panels (the party, rules, lore, Bring in prep, the
// schedule) and back, the campaign staying active the whole time. The view
// lives in the address (?view=prep), one viewer's alone, so a reload or the
// browser's back keeps it; status changes reach every seat at once and so
// cannot carry it. The table stays mounted underneath: the call, the board
// and the chat carry on, and Back to the table is instant.
function CampaignScreen({ state, refresh, table }: { state: CampaignState; refresh: () => void; table: TableHandlers }) {
  // Under the page's Suspense: Next renders a reader of the address there.
  const query = useSearchParams();
  const campaignId = state.campaign?.id ?? "";
  const mayPrep = state.campaign?.status === "active" && Boolean(state.caps?.steersStory);
  const prepOpen = mayPrep && query.get("view") === "prep";
  // A couch-mode lead on the host screens (?host=1) stays on them through
  // prep and back; without it the address would send them to the TV.
  const hostParam = query.get("host") === "1";
  const openPrep = useCallback(
    () => pushView(`/campaigns/${campaignId}?view=prep${hostParam ? "&host=1" : ""}`),
    [campaignId, hostParam],
  );
  const closePrep = useCallback(
    () => replaceView(`/campaigns/${campaignId}${hostParam ? "?host=1" : ""}`),
    [campaignId, hostParam],
  );
  // Couch mode (docs/couch-mode-spec.md): the lead's account is the room's
  // TV and every other member holds a phone with one simple screen. Any
  // other campaign goes on below exactly as before.
  const couchView = state.campaign && state.me
    ? couchSeatView({
        couchMode: state.campaign.gameSettings?.couchMode === true,
        isLead: state.campaign.leadUserId === state.me.id,
        hostParam,
        status: state.campaign.status,
      })
    : "normal";
  if (couchView === "tv") {
    return <CouchTvRedirect campaignId={campaignId} />;
  }
  if (couchView === "phone-lobby") {
    return <CouchPhoneLobby state={state} refresh={refresh} />;
  }
  if (couchView === "phone-play") {
    return <CouchPhoneView state={state} refresh={refresh} refreshWhispers={table.refreshWhispers} />;
  }
  if (state.campaign?.status === "lobby") {
    return <Lobby state={state} refresh={refresh} />;
  }
  return (
    <SessionView
      state={state}
      {...table}
      prep={
        mayPrep
          ? {
              open: prepOpen,
              onToggle: prepOpen ? closePrep : openPrep,
              // Mounted only while shown (and through its exit), SessionView's call.
              screen: <Lobby state={state} refresh={refresh} mode="prep" onResume={closePrep} />,
            }
          : undefined
      }
    />
  );
}
