/**
 * GET /api/wtm/logs/crash — last crash report. The port's logger keeps the
 * ring buffer + rotating file but not the legacy pre-crash file scanner, so
 * this returns `{ found: false }` (no false positives). The LogsPage handles
 * this gracefully (crash banner simply doesn't render).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ found: false });
}
