/**
 * GET /api/wre/clients/:id/wa-groups — the groups the bot's number is in, plus
 * which of them are currently watched. Requires a live connection.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWreClient } from "@/modules/wre/repository";
import { isConnected, listGroups } from "@/modules/wre/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isConnected(id)) return NextResponse.json({ error: "הוואטסאפ של לקוח זה לא מחובר כרגע" }, { status: 400 });
  try {
    const groups = await listGroups(id);
    const client = await getWreClient(id);
    return NextResponse.json({ groups, watchedGroups: client?.watchedGroups ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
