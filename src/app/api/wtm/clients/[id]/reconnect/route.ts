import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWtmClient } from "@/modules/wtm/repository";
import { poolForceWake } from "@/modules/wtm/tenantPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWtmClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  poolForceWake(id);
  return NextResponse.json({ ok: true });
}
