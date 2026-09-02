/**
 * POST /api/segments/{id}/refresh — recompute dynamic/static segment membership now or later.
 *
 * Body: { runAt?: ISOString }. Without runAt, refreshes immediately.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { refreshSegment, scheduleSegmentRefresh } from "@/modules/segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { runAt?: string };
  try {
    if (body.runAt) {
      await scheduleSegmentRefresh(auth.tenantId, id, new Date(body.runAt));
      return NextResponse.json({ scheduled: true });
    }
    return NextResponse.json({ segment: await refreshSegment(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
