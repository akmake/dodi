/** POST /api/wre/clients/:id/reconnect — bring the always-on socket back up. */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWreClient } from "@/modules/wre/repository";
import { connect } from "@/modules/wre/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWreClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  void connect(id);
  return NextResponse.json({ ok: true });
}
