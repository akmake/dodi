/**
 * GET /api/wtm/logs/stats — counts + last error + health snapshot.
 * Port of `logRoutes.js` GET '/stats'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { logger } from "@/modules/wa-engine/logger";
import { getHealthSnapshot } from "@/modules/wa-engine/healthMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const entries = logger.ring();
  const counts: Record<string, number> = { warn: 0, error: 0, fatal: 0 };
  entries.forEach((e) => {
    if (counts[e.level] !== undefined) counts[e.level]++;
  });
  const lastError = entries.find((e) => e.level === "error" || e.level === "fatal") ?? null;
  return NextResponse.json({ counts, lastError, health: getHealthSnapshot() });
}
