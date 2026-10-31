"use client";

import * as Dialog from "@radix-ui/react-dialog";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { pageOrigin } from "@/lib/navigation";
import { joinLink, pickJoinOrigin } from "@/components/couch/couch-logic";

// A reconnect should not send the TV back through the lobby or interrupt audio.
export function CouchTvJoinButton({ inviteCode }: { inviteCode: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="couch-tv-control">Show join QR code</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="couch-tv-join-overlay" />
        <Dialog.Content className="couch couch-tv-join-dialog">
          <Dialog.Title>Join on your phone</Dialog.Title>
          <Dialog.Description>Scan to join or reconnect. Sign in with the same account to return to your character.</Dialog.Description>
          <CouchTvJoin inviteCode={inviteCode} titled={false} />
          <Dialog.Close asChild>
            <button type="button" className="couch-btn">Back to game</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Untitled inside the reconnect dialog, whose own title already says this.
export function CouchTvJoin({ inviteCode, titled = true }: { inviteCode: string; titled?: boolean }) {
  const joinUrl = useJoinUrl(inviteCode);
  return (
    <section className="couch-tv-join" aria-label={titled ? "Join on your phone" : undefined}>
      {titled ? <span className="couch-label">Join on your phone</span> : null}
      <TvQr url={joinUrl} />
      <p className="couch-tv-join-url">{joinUrl || "Finding this screen's address…"}</p>
      {inviteCode ? (
        <p className="grid gap-1">
          <span className="couch-label">Room code</span>
          <span className="couch-tv-join-code">{inviteCode}</span>
        </p>
      ) : null}
    </section>
  );
}

// Small, in a corner of the introductions: the room can still join while
// the TV talks, and is told when choosing opens.
export function CouchTvJoinCorner({ inviteCode, note }: { inviteCode: string; note: string }) {
  const joinUrl = useJoinUrl(inviteCode);
  return (
    <aside className="couch-tv-join-corner" aria-label="Join on your phone">
      <TvQr url={joinUrl} />
      <span className="grid gap-1">
        <span className="couch-label">Join on your phone</span>
        {inviteCode ? <span className="couch-tv-join-corner-code">{inviteCode}</span> : null}
        <span className="couch-tv-join-corner-note">{note}</span>
      </span>
    </aside>
  );
}

// Ask the server for its public address so scanning works even when the TV
// opened localhost and the phone is using mobile data.
function useJoinUrl(inviteCode: string): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let cancelled = false;
    const here = pageOrigin();
    fetch("/api/server/addresses")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { publicUrl?: string; lanUrls?: string[] } | null) => {
        if (cancelled) return;
        setOrigin(pickJoinOrigin({ pageOrigin: here, lanUrls: data?.lanUrls ?? [], publicUrl: data?.publicUrl ?? "" }));
      })
      .catch(() => {
        if (!cancelled) setOrigin(here);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return joinLink(origin, inviteCode);
}

// Black on white and large: scanned from across the room, off a TV.
function TvQr({ url }: { url: string }) {
  const [made, setMade] = useState<{ url: string; data: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 720, margin: 1, color: { dark: "#000000ff", light: "#ffffffff" } })
      .then((data) => {
        if (!cancelled) setMade({ url, data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  const data = made && made.url === url ? made.data : "";
  return (
    <div className="couch-tv-qr">
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data} alt={`QR code to join: ${url}`} />
      ) : (
        <span className="couch-pulse" role="status" aria-label="Drawing the QR code" />
      )}
    </div>
  );
}

