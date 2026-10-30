"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pollUntilSettled } from "@/lib/poll-until-settled";
import { normalizeRoster, type CouchRoster } from "@/components/couch/couch-logic";

// The forge's scenario and crew for a couch-mode lobby
// (GET /api/campaigns/[id]/couch), and claiming a crew card from a phone.
// While the forge writes, the roster is polled until it settles; after that
// it is read again whenever `signal` changes (the stream's sheets: a claim
// moves a sheet to its player) and after this phone's own claim, with a
// slow read on top so a claim the stream did not carry still greys out.
// A server without the route yet answers `missing`, and the screens fall
// back to what the stream already holds.
const FORGE_POLL_MS = 2500;
const FORGE_POLL_LIMIT = 720;
const LOBBY_POLL_MS = 8000;

export type CouchRosterState = {
  roster: CouchRoster | null;
  missing: boolean;
  loaded: boolean;
  refetch: () => void;
  // "" when the card is now this player's; otherwise why not.
  claim: (crewId: string) => Promise<string>;
};

export function useCouchRoster(campaignId: string, { signal = "", live = true }: { signal?: string; live?: boolean } = {}): CouchRosterState {
  const [roster, setRoster] = useState<CouchRoster | null>(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((current) => current + 1), []);
  const forgingRef = useRef(false);

  const request = useCallback(async (): Promise<CouchRoster | null> => {
    const response = await fetch(`/api/campaigns/${campaignId}/couch`, { cache: "no-store" });
    if (response.status === 404 || response.status === 405) {
      setMissing(true);
      return null;
    }
    if (!response.ok) {
      throw new Error(`couch roster ${response.status}`);
    }
    setMissing(false);
    return normalizeRoster(await response.json());
  }, [campaignId]);

  // One read per change of what the stream says, plus the slow lobby read.
  useEffect(() => {
    if (!campaignId) {
      return;
    }
    let cancelled = false;
    const read = () =>
      request()
        .then((value) => {
          if (cancelled) return;
          setLoaded(true);
          if (value) setRoster(value);
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    void read();
    const timer = live ? window.setInterval(() => {
      // The forge poll below is already reading.
      if (!forgingRef.current) void read();
    }, LOBBY_POLL_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [campaignId, request, signal, version, live]);

  // While the forge writes, read until it is done.
  const forging = roster?.status === "forging";
  useEffect(() => {
    forgingRef.current = forging;
    if (!forging || !campaignId) {
      return;
    }
    return pollUntilSettled(
      request,
      (value) => value?.status === "forging",
      (value) => {
        if (value) setRoster(value);
      },
      FORGE_POLL_MS,
      FORGE_POLL_LIMIT,
    );
  }, [forging, campaignId, request]);

  const claim = useCallback(
    async (crewId: string): Promise<string> => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/couch/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crewId }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        refetch();
        if (response.status === 404) {
          return "Choosing a character is not open yet. Ask the host.";
        }
        if (!response.ok) {
          return data.error || (response.status === 409 ? "Someone else just took that character." : "Could not take that character.");
        }
        // Ready with the claim, for a lobby gate that still counts it; the
        // couch lobby has no ready button of its own.
        await fetch(`/api/campaigns/${campaignId}/ready`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ready: true }),
        }).catch(() => undefined);
        return "";
      } catch {
        return "Could not reach the server.";
      }
    },
    [campaignId, refetch],
  );

  return { roster, missing, loaded, refetch, claim };
}
