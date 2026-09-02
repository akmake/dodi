/**
 * A single AI test suite ([קטגוריה 24] §24.1).
 *   GET   /api/ai-optimization/suites/[id]  → suite + last results
 *   PATCH /api/ai-optimization/suites/[id]  { name?, cases? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getSuite, updateSuite, type CaseInput } from "@/modules/ai-optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const suite = await getSuite(auth.tenantId, id);
  if (!suite) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(suite);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; cases?: CaseInput[] };
  try {
    const updated = await updateSuite(auth.tenantId, id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
