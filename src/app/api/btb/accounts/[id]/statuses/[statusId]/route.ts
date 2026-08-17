/**
 * DELETE /api/btb/accounts/:id/statuses/:statusId — remove a status.
 *
 * If the status is still live (< 24h) and the account is connected, it's also
 * deleted on WhatsApp (delete-for-everyone). Either way the local record + its
 * recorded views are removed. Returns `{ waDeleted, active }` so the UI can tell
 * the user whether the WhatsApp-side delete actually happened.
 */
import { NextResponse, type NextRequest } from "next/server";
import { findStatusPostById, deleteStatusPost } from "@/modules/btb/repository";
import { deleteStatusOnWhatsApp } from "@/modules/btb/statusManager";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { audit } from "@/modules/wa-engine/auditLog";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; statusId: string }> }) {
  const { id, statusId } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;

  const post = await findStatusPostById(id, statusId);
  if (!post) return NextResponse.json({ error: "סטטוס לא נמצא" }, { status: 404 });

  const active = Date.now() - new Date(post.postedAt).getTime() < STATUS_TTL_MS;
  const waDeleted = active ? await deleteStatusOnWhatsApp(id, post.msgId) : false;

  await deleteStatusPost(id, statusId);
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "btb.status.delete", id, { statusId, msgId: post.msgId, active, waDeleted });
  broadcast("btb_status");

  return NextResponse.json({ ok: true, active, waDeleted });
}
