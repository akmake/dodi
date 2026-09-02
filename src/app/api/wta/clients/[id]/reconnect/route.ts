import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWtaClient } from "@/modules/wta/repository";
import { connect } from "@/modules/wta/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWtaClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  void connect(id);
  return NextResponse.json({ ok: true });
}
