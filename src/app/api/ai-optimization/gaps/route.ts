/**
 * Knowledge gaps ([קטגוריה 24] §24.3) — intents most often ending in handoff.
 *   GET /api/ai-optimization/gaps?from=&to=
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { knowledgeGaps } from "@/modules/ai-optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  try {
    return NextResponse.json({
      items: await knowledgeGaps(auth.tenantId, {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
