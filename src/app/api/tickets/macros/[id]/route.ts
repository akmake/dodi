/**
 * A single ticket macro ([קטגוריה 16] §16.3). PATCH → update; DELETE → remove.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { deleteMacro, updateMacro, type TicketMacro } from "@/modules/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<TicketMacro>;
  const macro = await updateMacro(auth.tenantId, id, body);
  if (!macro) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(macro);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteMacro(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
