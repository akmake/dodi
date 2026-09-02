/**
 * Aggregation over a data collection ([קטגוריה 28]).
 *   POST { metric, field?, groupBy?, filter? } → grouped count/sum/avg/min/max.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { aggregateRecords, type AggregateInput } from "@/modules/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as AggregateInput | null;
  if (!body?.metric) return NextResponse.json({ error: "missing metric" }, { status: 400 });
  try {
    const results = await aggregateRecords(auth.tenantId, id, body);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
