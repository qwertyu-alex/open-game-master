"use client";

import { useState } from "react";
import { TvScene } from "@/components/couch/CouchTvLobby";

// The TV's pictures (couch-logic.ts tvPictures): the place, and beside it a
// thing found there. The insert's column opens only once its picture has
// loaded, so the place never moves aside for an empty frame; a newer find
// crossfades inside the open column; when the next picture of a place lands
// the column slides away and the place takes the whole screen back.
//
// The column's picture stays mounted while it closes, so it slides out
// rather than vanishing. A find that arrives after the column closed opens
// a fresh one (a new key), never the last find's picture first.
export function TvPictures({ scene, insert }: { scene: string | null; insert: string | null }) {
  const [column, setColumn] = useState<{ key: number; url: string | null; loaded: boolean; was: string | null }>(() => ({
    key: 0,
    url: insert,
    loaded: false,
    was: insert,
  }));
  // State from props, as TvScene does.
  if (insert !== column.was) {
    const wasOpen = column.was !== null && column.loaded;
    setColumn(
      insert === null
        ? { ...column, was: null }
        : wasOpen
          ? { ...column, url: insert, was: insert }
          : { key: column.key + 1, url: insert, loaded: false, was: insert },
    );
  }
  const open = insert !== null && column.loaded;
  const shown = (url: string) =>
    setColumn((current) => (url === current.url && !current.loaded ? { ...current, loaded: true } : current));
  return (
    <div className="couch-tv-pictures" data-split={open ? "" : undefined}>
      <TvScene url={scene} />
      {column.url ? (
        <div className="couch-tv-insert" data-open={open ? "" : undefined}>
          <TvScene key={column.key} url={column.url} onShown={shown} />
        </div>
      ) : null}
    </div>
  );
}
