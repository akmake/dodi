/**
 * AI test suites ([קטגוריה 24] §24.1).
 *   GET  /api/ai-optimization/suites  → list
 *   POST /api/ai-optimization/suites  { name, cases?: [{ input, expectContains?, expectIntent? }] }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createSuite, listSuites, type CaseInput } from "@/modules/ai-optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listSuites(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { name?: string; cases?: CaseInput[] };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createSuite(auth.tenantId, { name: body.name, cases: body.cases }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
