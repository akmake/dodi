/**
 * POST /api/agent-assist — generate a reply suggestion for a conversation.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { suggestForConversation } from "@/modules/agent-assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { conversationId?: string };
  if (!body.conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await suggestForConversation(auth.tenantId, body.conversationId));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
