import { z } from "zod";
import { isErrorResponse, requireMember } from "@/lib/campaign-api";
import { itemArtFor } from "@/lib/couch/item-art";
import { itemArtKey } from "@/lib/couch/item-art-logic";
import { listSheetsForUser } from "@/lib/db/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemArtSchema = z.object({ names: z.array(z.string().trim().min(1).max(300)).max(80) });

// The pictures for the things a couch player carries (src/lib/couch/
// item-art.ts): what is painted, and whether more is on the way, so the
// phone asks again until it is not. Only names on the caller's own sheets
// are painted, so nobody can spend the night's pictures on anything else.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const context = await requireMember(campaignId);
  if (isErrorResponse(context)) {
    return context;
  }
  if (!context.campaign.gameSettings.couchMode) {
    return Response.json({ error: "This table is not a couch night." }, { status: 404 });
  }
  const parsed = itemArtSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Send the items to picture as names (up to 80)." }, { status: 400 });
  }
  const carried = new Set(
    listSheetsForUser(campaignId, context.user.id).flatMap((sheet) => sheet.equipment.map((item) => itemArtKey(item.name))),
  );
  const names = parsed.data.names.filter((name) => carried.has(itemArtKey(name)));
  return Response.json(itemArtFor(campaignId, names));
}
