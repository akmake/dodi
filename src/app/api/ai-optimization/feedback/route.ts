/**
 * AI answer feedback ([קטגוריה 24] §24.3).
 *   GET  /api/ai-optimization/feedback?rating=up|down  → list
 *   POST /api/ai-optimization/feedback  { conversationId, rating, aiResponseId?, note?, source? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { recordFeedback, listFeedback, type FeedbackRating } from "@/modules/ai-optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const rating = (req.nextUrl.searchParams.get("rating") as FeedbackRating | null) ?? undefined;
  try {
    return NextResponse.json({ items: await listFeedback(auth.tenantId, rating) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    aiResponseId?: string;
    rating?: FeedbackRating;
    note?: string;
    source?: "agent" | "customer";
  };
  if (!body.conversationId || (body.rating !== "up" && body.rating !== "down")) {
    return NextResponse.json({ error: "conversationId and rating (up|down) are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await recordFeedback(auth.tenantId, {
        conversationId: body.conversationId,
        aiResponseId: body.aiResponseId,
        rating: body.rating,
        note: body.note,
        source: body.source,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
