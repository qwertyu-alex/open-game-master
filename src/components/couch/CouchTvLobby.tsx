"use client";

import { useEffect, useMemo, useState } from "react";
import type { CampaignState } from "@/app/campaigns/[campaignId]/useCampaignStream";
import { CouchTvJoin } from "@/components/couch/CouchTvJoin";
import { CouchFace } from "@/components/couch/CouchParts";
import { useCouchRoster } from "@/components/couch/useCouchRoster";
import { unclaimedCount, type CouchCrewCard } from "@/components/couch/couch-logic";

// The TV before the game (docs/couch-mode-spec.md 2.6): tonight's title,
// logline and briefing over the cover, a QR big enough to scan from the
// couch with the local-network address beside it, the crew greying out as
// phones take them, and the lead's Begin. "Writing the scenario" while the
// forge works.
export function CouchTvLobby({ state, refresh }: { state: CampaignState; refresh: () => void }) {
  const { campaign, me, sheets, members } = state;
  const signal = useMemo(
    () => `${sheets.map((sheet) => `${sheet.id}:${sheet.userId}`).join("|")}#${members.length}`,
    [sheets, members.length],
  );
  const { roster, missing, loaded, refetch } = useCouchRoster(campaign?.id ?? "", { signal });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!campaign || !me) {
    return null;
  }
  const title = roster?.scenario?.title || campaign.title;
  const logline = roster?.scenario?.logline || campaign.description;
  const briefing = roster?.scenario?.briefing ?? "";
  // Without the forge's route, the crew is whoever already has a sheet.
  const crew: CouchCrewCard[] =
    roster?.crew ??
    sheets
      .filter((sheet) => !sheet.isCompanion)
      .map((sheet) => {
        const player = sheet.userId !== campaign.leadUserId ? members.find((member) => member.userId === sheet.userId) : undefined;
        return {
          id: sheet.id,
          name: sheet.name,
          crewRole: sheet.crewRole ?? "",
          backstory: sheet.backstory,
          portraitUrl: sheet.portrait?.url ?? null,
          claimedBy: player ? { userId: player.userId, name: player.username } : null,
        };
      });
  const status = roster?.status ?? (missing ? "ready" : "forging");
  const open = roster ? unclaimedCount(roster) : 0;
  const mayBegin = campaign.ownerUserId === me.id || campaign.leadUserId === me.id;
  const waitingFor =
    !loaded
      ? "Connecting…"
      : status === "forging"
        ? "The GM is still writing."
        : status === "failed"
          ? "The scenario could not be written."
          : open > 0
            ? `Waiting for ${open} more ${open === 1 ? "player" : "players"} to pick a character.`
            : "";

  // A forge that failed is written again on the lead's word (the route
  // refuses anyone else, and any story a phone has already taken a card in).
  async function retry() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign!.id}/couch/reforge`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "The story could not be started again.");
      }
      refetch();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    setBusy(true);
    setError("");
    try {
      // The TV's seat readies with the press, for a gate that still asks.
      await fetch(`/api/campaigns/${campaign!.id}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ready: true }),
      }).catch(() => undefined);
      const response = await fetch(`/api/campaigns/${campaign!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "The game could not begin.");
        return;
      }
      refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TvScene url={campaign.cover?.url ?? null} dim />
      <div className="couch-tv-scrim" aria-hidden="true" />
      <div className="couch-tv-lobby">
        <section className="couch-tv-lobby-story" aria-label="Tonight's story">
          <span className="couch-label">Tonight&apos;s one-shot</span>
          <h1 className="couch-tv-lobby-title">{title}</h1>
          {logline ? <p className="couch-tv-lobby-logline">{logline}</p> : null}
          {status === "forging" ? (
            <p className="couch-tv-forging" role="status">
              <span className="couch-pulse" aria-hidden="true" />
              Writing the scenario and the crew…
            </p>
          ) : status === "failed" ? (
            <div className="grid justify-items-start gap-3">
              <p className="couch-tv-forging" role="alert">
                {roster?.error || "The scenario could not be written."}
              </p>
              {mayBegin ? (
                <button type="button" className="couch-btn" onClick={() => void retry()} disabled={busy}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : briefing ? (
            <p className="couch-tv-lobby-brief">{briefing}</p>
          ) : null}
        </section>
        <CouchTvJoin inviteCode={campaign.inviteCode ?? ""} />
        <div className="couch-tv-lobby-foot">
          {crew.length ? (
            <ul className="couch-tv-lobby-crew" aria-label="The crew">
              {crew.map((card) => (
                <li key={card.id} className="couch-tv-seat" data-taken={card.claimedBy ? "" : undefined}>
                  <CouchFace src={card.portraitUrl} name={card.name} />
                  <span className="couch-tv-member-text">
                    <span className="couch-tv-member-name">{card.name}</span>
                    {card.crewRole ? <span className="couch-tv-member-role">{card.crewRole}</span> : null}
                    <span className="couch-tv-seat-claim">{card.claimedBy ? `Taken by ${card.claimedBy.name || "a player"}` : "Free"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          {mayBegin ? (
            <div className="couch-tv-begin">
              {waitingFor ? <span className="couch-tv-member-role">{waitingFor}</span> : null}
              <button
                type="button"
                className="couch-btn couch-btn-primary"
                onClick={() => void begin()}
                disabled={busy || !loaded || status !== "ready" || open > 0}
              >
                {busy ? "Starting…" : "Begin"}
              </button>
              {error ? (
                <span role="alert" className="couch-error">
                  {error}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

// The scene behind the TV, full bleed: the newest picture fades in over the
// last once it has loaded, the last one stays until then, and both drift
// slowly so a still frame keeps breathing while the next one paints. A
// picture that fails to load leaves the old one up. `onShown` hears each
// picture that has loaded, so a frame around it opens only once it is there.
export function TvScene({ url, dim = false, onShown }: { url: string | null; dim?: boolean; onShown?: (url: string) => void }) {
  const [layers, setLayers] = useState<Array<{ url: string; loaded: boolean; flip: boolean }>>(() =>
    url ? [{ url, loaded: false, flip: false }] : [],
  );
  const [failed, setFailed] = useState<string[]>([]);
  const newest = layers[layers.length - 1];
  if (url && newest?.url !== url && !failed.includes(url)) {
    setLayers([...layers.slice(-1), { url, loaded: false, flip: !(newest?.flip ?? false) }]);
  }
  const settled = layers.length > 1 && Boolean(layers[layers.length - 1]?.loaded);
  useEffect(() => {
    if (!settled) return;
    const timer = window.setTimeout(() => setLayers((current) => current.slice(-1)), 2200);
    return () => window.clearTimeout(timer);
  }, [settled]);
  const markLoaded = (src: string) => {
    onShown?.(src);
    setLayers((current) => (current.some((layer) => layer.url === src && !layer.loaded) ? current.map((layer) => (layer.url === src ? { ...layer, loaded: true } : layer)) : current));
  };
  return (
    <div className="couch-tv-art" aria-hidden="true" style={dim ? { opacity: 0.55 } : undefined}>
      {layers.map((layer) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={layer.url}
          src={layer.url}
          alt=""
          data-loaded={layer.loaded ? "" : undefined}
          data-flip={layer.flip ? "" : undefined}
          ref={(node) => {
            if (node?.complete && node.naturalWidth > 0 && !layer.loaded) markLoaded(layer.url);
          }}
          onLoad={() => markLoaded(layer.url)}
          onError={() => {
            setFailed((current) => [...current, layer.url]);
            setLayers((current) => (current.length > 1 ? current.filter((entry) => entry.url !== layer.url) : current));
          }}
        />
      ))}
    </div>
  );
}
