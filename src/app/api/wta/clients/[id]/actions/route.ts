/**
 * GET /api/wta/clients/:id/actions — the moderation log (deletes / warns /
 * kicks / locks) for a client, most recent first. Optionally returns a small
 * stats roll-up for the last 7 days.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listActions, countActionsByType } from "@/modules/wta/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [actions, stats] = await Promise.all([listActions(id, 200), countActionsByType(id, since)]);
  return NextResponse.json({ actions, stats });
}
