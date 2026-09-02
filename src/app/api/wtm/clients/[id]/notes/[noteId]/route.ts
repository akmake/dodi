// Port of Whatsapp/server/routes/noteRoutes.js (PUT/DELETE '/:noteId')
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { updateSupportNote, deleteSupportNote } from "@/modules/wtm/repository";
import { audit } from "@/modules/wa-engine/auditLog";
import type { SupportNote } from "@/modules/wtm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; noteId: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, noteId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { content?: string; priority?: SupportNote["priority"]; resolved?: boolean };
  const note = await updateSupportNote(id, noteId, body);
  if (!note) return NextResponse.json({ error: "הערה לא נמצאה" }, { status: 404 });
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "note.update", id, { resolved: body.resolved });
  return NextResponse.json(note);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; noteId: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, noteId } = await ctx.params;
  const ok = await deleteSupportNote(id, noteId);
  if (!ok) return NextResponse.json({ error: "הערה לא נמצאה" }, { status: 404 });
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "note.delete", id);
  return NextResponse.json({ ok: true });
}
