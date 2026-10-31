"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { newGearKeys } from "@/components/couch/character-logic";

// The Gear section's two live parts: the pictures the night paints for the
// items the icon set lacks, and which items are new since the player last
// looked.

const ART_POLL_MS = 4000;
const ART_POLL_LIMIT = 45;

// The night's pictures for these items, by item key
// (POST /api/campaigns/[id]/couch/item-art). Asked again every few seconds
// while some are still being painted, and whenever the items change.
export function useItemArt(campaignId: string, names: readonly string[]): Record<string, string> {
  const [art, setArt] = useState<Record<string, string>>({});
  // One string for the list, so a new array with the same items asks nothing.
  const asked = names.join("\n");
  useEffect(() => {
    if (!campaignId || !asked) return;
    let cancelled = false;
    let timer: number | undefined;
    let tries = 0;
    const read = async () => {
      tries += 1;
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/couch/item-art`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: asked.split("\n").slice(0, 80) }),
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { art?: Record<string, string>; pending?: boolean };
        if (cancelled) return;
        setArt((current) => ({ ...current, ...data.art }));
        if (data.pending && tries < ART_POLL_LIMIT) timer = window.setTimeout(read, ART_POLL_MS);
      } catch {
        // Offline for a moment: the icons and letters stand in.
      }
    };
    void read();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [campaignId, asked]);
  return art;
}

// Which of these item keys are new on this phone: picked up since the
// player last left the Gear section. Kept per character in the browser,
// like the agenda's act; the first look takes everything as seen, so the
// starting kit is not new.
export function useNewGear(sheetId: string, keys: readonly string[]): { fresh: ReadonlySet<string>; markSeen: () => void } {
  const storageKey = `couch-gear-seen:${sheetId}`;
  const [store, setStore] = useState<{ key: string; seen: string[] | null }>(() => ({ key: storageKey, seen: readSeen(storageKey) }));
  const joined = keys.join("\n");
  // Another character on this phone reads its own list.
  if (store.key !== storageKey) setStore({ key: storageKey, seen: readSeen(storageKey) });
  // The first look: the kit as it stands is the baseline.
  if (store.key === storageKey && store.seen === null && joined) setStore({ key: storageKey, seen: joined.split("\n") });
  const seen = store.key === storageKey ? store.seen : null;
  useEffect(() => {
    if (seen) writeSeen(storageKey, seen);
  }, [seen, storageKey]);
  const fresh = useMemo(() => new Set(newGearKeys(seen, joined ? joined.split("\n") : [])), [seen, joined]);
  const markSeen = useCallback(() => {
    if (!fresh.size) return;
    // What was carried before stays seen: an item spent and found again
    // is not news.
    setStore({ key: storageKey, seen: [...new Set([...(seen ?? []), ...fresh])] });
  }, [fresh, seen, storageKey]);
  return { fresh, markSeen };
}

function readSeen(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    const value: unknown = stored === null ? null : JSON.parse(stored);
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : null;
  } catch {
    return null;
  }
}

function writeSeen(key: string, keys: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(keys));
  } catch {
    // Private browsing without storage: the next load starts a new baseline.
  }
}
