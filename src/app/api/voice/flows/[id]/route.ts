/**
 * A single IVR flow ([קטגוריה 26]). GET → flow; PATCH → update; DELETE → remove.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { deleteFlow, getFlow, updateFlow, type IvrFlow } from "@/modules/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const flow = await getFlow(auth.tenantId, id);
  if (!flow) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(flow);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<Pick<IvrFlow, "name" | "greeting" | "nodes" | "rootNodeId" | "enabled">>;
  const flow = await updateFlow(auth.tenantId, id, body);
  if (!flow) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(flow);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteFlow(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
