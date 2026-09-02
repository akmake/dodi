/**
 * A single saved inbox view ([קטגוריה 3] §3.1). DELETE → remove.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { deleteInboxView } from "@/modules/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteInboxView(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
