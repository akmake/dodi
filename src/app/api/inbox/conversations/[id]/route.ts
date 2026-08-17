/**
 * Single conversation ([קטגוריה 3]).
 *   GET   → full view (conversation + contact + messages).
 *   PATCH → workflow actions (status, assign, priority, ai, read, tag).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  assign,
  addTag,
  getConversationView,
  markRead,
  removeTag,
  setAiEnabled,
  setPriority,
  setStatus,
  snooze,
} from "@/modules/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const { id } = await ctx.params;
  const view = await getConversationView(tenantId, id);
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(view);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string;

  try {
    switch (action) {
      case "read":
        return NextResponse.json(await markRead(tenantId, id));
      case "status":
        return NextResponse.json(await setStatus(tenantId, id, body.status as never));
      case "snooze":
        return NextResponse.json(await snooze(tenantId, id, new Date(body.until as string)));
      case "assign":
        return NextResponse.json(await assign(tenantId, id, (body.assigneeId as string) ?? null));
      case "priority":
        return NextResponse.json(await setPriority(tenantId, id, body.priority as never));
      case "ai":
        return NextResponse.json(await setAiEnabled(tenantId, id, Boolean(body.enabled)));
      case "addTag":
        return NextResponse.json(await addTag(tenantId, id, body.tag as string));
      case "removeTag":
        return NextResponse.json(await removeTag(tenantId, id, body.tag as string));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
