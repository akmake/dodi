/**
 * Run an AI test suite ([קטגוריה 24] §24.1) — POST /api/ai-optimization/suites/[id]/run.
 * Executes every case in a sandbox against the current agent and returns results.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { runSuite } from "@/modules/ai-optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const result = await runSuite(auth.tenantId, id);
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
