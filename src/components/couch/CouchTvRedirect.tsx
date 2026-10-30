"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The lead in couch mode is the room's TV (docs/couch-mode-spec.md, "three
// screens"), so the campaign's own address takes it straight to the TV
// screen. The ordinary host screens stay one step away, at ?host=1, for the
// settings and anything that needs fixing on the night.
export function CouchTvRedirect({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const tv = `/campaigns/${campaignId}/table`;
  useEffect(() => {
    router.replace(tv);
  }, [router, tv]);
  return (
    <div className="couch couch-phone">
      <main className="couch-col couch-center" role="status">
        <p className="text-lg font-semibold">This account is the room&apos;s TV.</p>
        <p className="couch-muted">Opening the TV screen…</p>
        <Link href={tv} className="couch-btn couch-btn-primary">
          Open the TV screen
        </Link>
        <Link href={`/campaigns/${campaignId}?host=1`} className="couch-link">
          Host controls instead
        </Link>
      </main>
    </div>
  );
}
