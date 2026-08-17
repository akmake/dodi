import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { reset, connect } from "@/modules/btb/statusManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  reset(id);
  await connect(id);
  return NextResponse.json({ ok: true });
}
