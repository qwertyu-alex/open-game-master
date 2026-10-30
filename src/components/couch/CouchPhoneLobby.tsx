"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { AgendaCard, CouchFace, CouchPhoneShell } from "@/components/couch/CouchParts";
import { useCouchRoster } from "@/components/couch/useCouchRoster";
import type { CouchCrewCard, CouchRoster } from "@/components/couch/couch-logic";

// The phone before the game opens (docs/couch-mode-spec.md 2.1 step 4):
// the crew the GM wrote, as cards to take, first come first served; then,
// with one taken, who you are, your agenda behind the hold, and a quiet
// wait for the rest of the room. In place of the table lobby's builder,
// pregens and ready button: the TV's Begin starts the night.
export function CouchPhoneLobby({ state, refresh }: { state: CampaignState; refresh: () => void }) {
  const { campaign, me, sheets } = state;
  const signal = useSheetSignal(sheets);
  const roster = useCouchRoster(campaign?.id ?? "", { signal });
  const mySheet = sheets.find((sheet) => sheet.userId === me?.id && !sheet.isCompanion) ?? null;
  if (!campaign || !me) {
    return null;
  }
  const title = roster.roster?.scenario?.title || campaign.title;
  return (
    <CouchPhoneShell title={title}>
      {mySheet ? (
        <Claimed sheet={mySheet} roster={roster.roster} meId={me.id} />
      ) : (
        <CrewChoice state={state} refresh={refresh} rosterState={roster} />
      )}
    </CouchPhoneShell>
  );
}

// The crew to choose from, for a phone with no character yet: in the lobby,
// and for a player who joins once the night has started.
export function CouchCrewPicker({ state, refresh }: { state: CampaignState; refresh: () => void }) {
  const signal = useSheetSignal(state.sheets);
  const roster = useCouchRoster(state.campaign?.id ?? "", { signal });
  return <CrewChoice state={state} refresh={refresh} rosterState={roster} />;
}

// A claim moves a sheet to its player, so the sheets' owners are what the
// roster is read again on.
function useSheetSignal(sheets: CharacterSheet[]): string {
  return useMemo(() => sheets.map((sheet) => `${sheet.id}:${sheet.userId}`).join("|"), [sheets]);
}

function CrewChoice({
  state,
  refresh,
  rosterState,
}: {
  state: CampaignState;
  refresh: () => void;
  rosterState: ReturnType<typeof useCouchRoster>;
}) {
  const { roster, missing, loaded, claim } = rosterState;
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meId = state.me?.id ?? "";

  async function take(card: CouchCrewCard) {
    setBusy(true);
    setError("");
    const refusal = await claim(card.id);
    setBusy(false);
    if (refusal) {
      setError(refusal);
      setChosen("");
      return;
    }
    refresh();
  }

  if (!loaded) {
    return <Waiting title="Connecting to the table…" />;
  }
  if (missing || !roster) {
    return <Waiting title="Waiting for the host" hint="The crew appears here once the host has set up tonight's game." />;
  }
  if (roster.status === "forging") {
    return (
      <Waiting
        title="The GM is writing tonight's crew…"
        hint="A scenario and a character for each of you. It takes a minute or two; this screen fills in by itself."
        pulse
      />
    );
  }
  if (roster.status === "failed") {
    return (
      <Waiting
        title="The scenario could not be written"
        hint={`${roster.error || "Something went wrong."} The host can try again from the TV.`}
      />
    );
  }
  return (
    <>
      <div className="grid gap-1.5">
        <h2 className="text-xl font-semibold">Choose your character</h2>
        {roster.scenario?.logline ? <p className="couch-muted">{roster.scenario.logline}</p> : null}
        <p className="couch-muted text-[0.95rem]">Tap a card to read it, then take it. One each, first come first served.</p>
      </div>
      {error ? (
        <p role="alert" className="couch-error">
          {error}
        </p>
      ) : null}
      <ul className="couch-crew-list">
        {roster.crew.map((card) => {
          const takenBy = card.claimedBy && card.claimedBy.userId !== meId ? card.claimedBy : null;
          const open = chosen === card.id && !takenBy;
          return (
            <li key={card.id} className="couch-card couch-crew" data-state={takenBy ? "taken" : open ? "chosen" : "open"}>
              <button
                type="button"
                className="couch-crew-head w-full text-left"
                disabled={Boolean(takenBy) || busy}
                aria-expanded={open}
                onClick={() => setChosen(open ? "" : card.id)}
              >
                <CouchFace src={card.portraitUrl} name={card.name} size="64px" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="couch-me-name">{card.name}</span>
                  {card.crewRole ? <span className="couch-me-role">{card.crewRole}</span> : null}
                  {takenBy ? <span className="couch-label">Taken by {takenBy.name || "another player"}</span> : null}
                </span>
              </button>
              {card.backstory ? <p className="couch-crew-story">{card.backstory}</p> : null}
              {open ? (
                <button type="button" className="couch-btn couch-btn-primary w-full" disabled={busy} onClick={() => void take(card)}>
                  {busy ? "Taking…" : `Play as ${card.name}`}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// With a character taken: who you are, your agenda, and the room filling up.
function Claimed({ sheet, roster, meId }: { sheet: CharacterSheet; roster: CouchRoster | null; meId: string }) {
  const card = roster?.crew.find((entry) => entry.claimedBy?.userId === meId);
  const role = sheet.crewRole?.trim() || card?.crewRole || "";
  const backstory = sheet.backstory.trim() || card?.backstory || "";
  const crew = roster?.crew ?? [];
  const open = crew.filter((entry) => !entry.claimedBy).length;
  return (
    <>
      <section className="couch-card grid gap-3 p-4" aria-label="Your character">
        <span className="couch-label">You are</span>
        <div className="couch-crew-head">
          <CouchFace src={sheet.portrait?.url ?? card?.portraitUrl} name={sheet.name} size="72px" />
          <span className="grid min-w-0 gap-0.5">
            <span className="couch-me-name">{sheet.name}</span>
            {role ? <span className="couch-me-role">{role}</span> : null}
          </span>
        </div>
        {backstory ? <p className="whitespace-pre-line text-[0.98rem] leading-relaxed">{backstory}</p> : null}
      </section>
      {sheet.agenda ? <AgendaCard agenda={sheet.agenda} /> : null}
      <section className="couch-card grid gap-3 p-4" aria-live="polite">
        <span className="couch-label">Waiting for everyone</span>
        <p className="text-[1.05rem]">
          {open > 0
            ? `${open} ${open === 1 ? "character is" : "characters are"} still free.`
            : "Everyone has a character. The host starts the game from the TV."}
        </p>
        {crew.length ? (
          <ul className="grid gap-2">
            {crew.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3">
                <CouchFace src={entry.portraitUrl} name={entry.name} size="36px" />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.claimedBy ? (
                  <span className="couch-muted inline-flex items-center gap-1 text-sm">
                    <Check className="size-4" aria-hidden="true" />
                    {entry.claimedBy.userId === meId ? "You" : entry.claimedBy.name || "Taken"}
                  </span>
                ) : (
                  <span className="couch-muted text-sm">Free</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="couch-muted text-sm">Look at the TV: the story, the pictures and the sound all play there.</p>
      </section>
    </>
  );
}

function Waiting({ title, hint, pulse = false }: { title: string; hint?: string; pulse?: boolean }) {
  return (
    <div className="couch-center" role="status">
      {pulse ? <span className="couch-pulse" aria-hidden="true" /> : null}
      <p className="text-lg font-semibold">{title}</p>
      {hint ? <p className="couch-muted max-w-sm">{hint}</p> : null}
    </div>
  );
}
