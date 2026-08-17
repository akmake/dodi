/**
 * A single scheduled report ([קטגוריה 23] §23.5).
 *   GET    → its recent runs.
 *   POST   → run it now (returns the digest).
 *   DELETE → remove the schedule.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { deleteSchedule, listRuns, runReportNow } from "@/modules/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  return NextResponse.json({ runs: await listRuns(auth.tenantId, id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const run = await runReportNow(auth.tenantId, id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteSchedule(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
