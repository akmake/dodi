/**
 * A single trigger ([קטגוריה 6]).
 *   GET    /api/triggers/[id]
 *   PATCH  /api/triggers/[id]  { config?, filters?, targetFlowId?, enabled?, priority? }
 *   DELETE /api/triggers/[id]
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getTrigger, updateTrigger, deleteTrigger } from "@/modules/triggers";
import type { Trigger } from "@/modules/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const trigger = await getTrigger(auth.tenantId, id);
  if (!trigger) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(trigger);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<
    Pick<Trigger, "config" | "filters" | "targetFlowId" | "enabled" | "priority">
  >;
  try {
    const updated = await updateTrigger(auth.tenantId, id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json({ deleted: await deleteTrigger(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
