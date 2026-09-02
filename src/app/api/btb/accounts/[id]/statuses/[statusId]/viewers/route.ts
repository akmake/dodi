import { NextResponse, type NextRequest } from "next/server";
import { findStatusPostById, listViewersForStatus } from "@/modules/btb/repository";
import { resolveViewer } from "@/modules/btb/statusManager";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; statusId: string }> }) {
  const { id, statusId } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;

  const post = await findStatusPostById(id, statusId);
  if (!post) return NextResponse.json({ error: "סטטוס לא נמצא" }, { status: 404 });

  const viewers = await listViewersForStatus(id, post.msgId);
  return NextResponse.json(
    viewers.map((v) => {
      const { phone, name, pushName } = resolveViewer(id, v.viewerJid);
      return { viewerJid: v.viewerJid, phone, name, pushName, viewedAt: v.viewedAt, receiptType: v.receiptType };
    })
  );
}
