/**
 * Inbox @mentions for the current agent ([קטגוריה 3] §3.3).
 *   GET   → list mentions (?unread=1 for unread only).
 *   PATCH → { id } mark a mention as read.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listMentions, markMentionRead } from "@/modules/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  return NextResponse.json({ items: await listMentions(auth.tenantId, auth.userId, unreadOnly) });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const mention = await markMentionRead(auth.tenantId, body.id);
  if (!mention) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(mention);
}
