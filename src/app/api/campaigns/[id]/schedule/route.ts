/**
 * POST /api/campaigns/{id}/schedule — schedule a campaign send.
 *
 * Body: { runAt: ISOString, rrule?: "DAILY" | "WEEKLY" | "MONTHLY" | "FREQ=DAILY;INTERVAL=2" }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { scheduleCampaign } from "@/modules/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { runAt?: string; rrule?: string | null };
  if (!body.runAt) return NextResponse.json({ error: "runAt is required" }, { status: 400 });
  try {
    await scheduleCampaign(auth.tenantId, id, new Date(body.runAt), body.rrule);
    return NextResponse.json({ scheduled: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
