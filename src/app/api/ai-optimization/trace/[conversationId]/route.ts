/**
 * Conversation trace ([קטגוריה 24] §24.4) — the persisted AI reasoning turns
 * (intent, retrieved sources, confidence, decision, tool calls, tokens).
 *   GET /api/ai-optimization/trace/[conversationId]
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getTrace } from "@/modules/ai-optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  const { conversationId } = await params;
  try {
    return NextResponse.json({ items: await getTrace(auth.tenantId, conversationId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
