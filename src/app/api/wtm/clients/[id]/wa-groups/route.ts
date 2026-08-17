import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { isConnected, fetchGroups } from "@/modules/wa-engine/whatsappManager";
import { getWtmClient } from "@/modules/wtm/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isConnected(id)) return NextResponse.json({ error: "הוואצאפ של לקוח זה לא מחובר כרגע" }, { status: 400 });
  try {
    const groups = await fetchGroups(id);
    const client = await getWtmClient(id);
    return NextResponse.json({ groups, groupsEnabled: client?.groupsEnabled, allowedGroups: client?.allowedGroups });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
