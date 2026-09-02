/**
 * GET /api/analytics — KPI overview + event-store reports ([קטגוריה 23]).
 *
 *   /api/analytics                         → KPI overview (default)
 *   /api/analytics?report=events           → counts per event type
 *   /api/analytics?report=timeseries&type=ai_answer  → daily series
 *   /api/analytics?report=topics           → top intents / knowledge gaps (§23.4)
 *   /api/analytics?report=drilldown&type=handoff     → raw events (§23.3)
 *
 * All accept optional `from`/`to` ISO dates.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  getOverview,
  countByType,
  timeseries,
  topIntents,
  drillDown,
  type DateRange,
} from "@/modules/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function range(req: NextRequest): DateRange {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  return {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const report = sp.get("report");
  const type = sp.get("type") ?? "";

  try {
    switch (report) {
      case "events":
        return NextResponse.json({ counts: await countByType(auth.tenantId, range(req)) });
      case "timeseries": {
        if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });
        const tz = sp.get("tz") ?? undefined;
        return NextResponse.json({ points: await timeseries(auth.tenantId, type, range(req), tz) });
      }
      case "topics":
        return NextResponse.json({ topics: await topIntents(auth.tenantId, range(req)) });
      case "drilldown":
        if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });
        return NextResponse.json({ items: await drillDown(auth.tenantId, type, range(req)) });
      default:
        return NextResponse.json(await getOverview(auth.tenantId));
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
