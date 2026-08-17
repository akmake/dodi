/**
 * GET /api/wta/clients/:id/wa-groups — the groups the bot's number is in, plus
 * which of them are currently marked as managed. Requires a live connection.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWtaClient } from "@/modules/wta/repository";
import { isConnected, listGroups } from "@/modules/wta/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isConnected(id)) return NextResponse.json({ error: "הוואטסאפ של לקוח זה לא מחובר כרגע" }, { status: 400 });
  try {
    const groups = await listGroups(id);
    const client = await getWtaClient(id);
    return NextResponse.json({ groups, managedGroups: client?.managedGroups ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
