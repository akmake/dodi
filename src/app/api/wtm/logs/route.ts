/**
 * GET /api/wtm/logs — the WTM/BTB engine ring buffer (in-memory, real-time).
 * Port of `Whatsapp/server/routes/logRoutes.js` GET '/'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { logger } from "@/modules/wa-engine/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const level = sp.get("level");
  const component = sp.get("component");
  const tenantId = sp.get("tenantId");
  const lim = Math.min(parseInt(sp.get("limit") ?? "500") || 500, 2000);

  let entries = logger.ring();
  if (level) entries = entries.filter((e) => e.level === level);
  if (component) entries = entries.filter((e) => e.component === component);
  if (tenantId) entries = entries.filter((e) => e.tenantId === tenantId);
  return NextResponse.json(entries.slice(0, lim));
}
