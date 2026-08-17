/**
 * Rows of a data collection ([קטגוריה 28]).
 *   GET  → list rows (capped). Optional ?limit.
 *   POST → insert a row { data: {...} }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { findRecords, insertRecord } from "@/modules/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 500) || 500;
  try {
    const records = await findRecords(auth.tenantId, id, { limit });
    return NextResponse.json({ records });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  if (!body?.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }
  try {
    const record = await insertRecord(auth.tenantId, id, body.data);
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
