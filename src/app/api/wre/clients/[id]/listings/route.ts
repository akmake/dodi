/**
 * GET /api/wre/clients/:id/listings — the broker's captured apartments, filtered.
 * This is the read surface behind both the map and the table.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listListings, countListings, listCities, countByStatus } from "@/modules/wre/repository";
import { logger } from "@/modules/wa-engine/logger";
import type { ListingStatus } from "@/modules/wre/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS: ListingStatus[] = [
  "mapped",
  "needs_review",
  "not_listing",
  "low_confidence",
  "duplicate",
  "rejected",
  "skipped",
];

const numParam = (v: string | null): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  const statusRaw = sp.getAll("status").filter((s): s is ListingStatus => VALID_STATUS.includes(s as ListingStatus));
  const days = numParam(sp.get("days"));

  const query = {
    clientId: id,
    status: statusRaw.length ? statusRaw : undefined,
    city: sp.get("city") || undefined,
    dealType: sp.get("dealType") || undefined,
    minRooms: numParam(sp.get("minRooms")),
    maxRooms: numParam(sp.get("maxRooms")),
    minPrice: numParam(sp.get("minPrice")),
    maxPrice: numParam(sp.get("maxPrice")),
    since: days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined,
    search: sp.get("search") || undefined,
    limit: numParam(sp.get("limit")) ?? 200,
    skip: numParam(sp.get("skip")) ?? 0,
  };

  try {
    const [listings, total, cities, byStatus] = await Promise.all([
      listListings(query),
      countListings(query),
      listCities(id),
      countByStatus(id),
    ]);
    return NextResponse.json({ listings, total, cities, byStatus });
  } catch (err) {
    // Surface the reason instead of a blind 500 — this is the broker's main
    // screen, and "HTTP 500" in the console says nothing about what broke.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("wre", `listings query failed: ${message}`, { clientId: id });
    return NextResponse.json({ error: `שליפת ההודעות נכשלה: ${message}` }, { status: 500 });
  }
}
