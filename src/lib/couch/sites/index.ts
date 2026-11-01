import type { SiteMap } from "@/lib/couch/site-map-logic";
import { CREW_EXPENDABLE_SITE } from "@/lib/couch/sites/crew-expendable";
import { DEAD_AIR_SITE } from "@/lib/couch/sites/dead-air";
import { HADDON_OUTPOST } from "@/lib/couch/sites/haddon-outpost";

// The written sites an overhead night is played on (docs/couch-overhead-
// spec.md), by the id a written scenario names in its `site`. Server-only:
// each holds where every foe waits, so a client gets only siteView's fog.

export const SITES: readonly SiteMap[] = [HADDON_OUTPOST, DEAD_AIR_SITE, CREW_EXPENDABLE_SITE];

export function siteById(id: string | undefined): SiteMap | null {
  return (id && SITES.find((site) => site.id === id)) || null;
}
