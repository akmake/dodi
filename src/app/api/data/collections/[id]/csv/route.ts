/**
 * CSV import/export for a data collection ([קטגוריה 28]).
 *   GET  → download all rows as text/csv.
 *   POST → import rows from a CSV body (raw text or { csv }). Returns counts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { exportCsv, getCollection, importCsv } from "@/modules/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const c = await getCollection(auth.tenantId, id);
    const csv = await exportCsv(auth.tenantId, id);
    const filename = `${c?.name ?? "export"}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const contentType = req.headers.get("content-type") ?? "";
  let csv: string;
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { csv?: string } | null;
    csv = body?.csv ?? "";
  } else {
    csv = await req.text();
  }
  if (!csv.trim()) return NextResponse.json({ error: "missing csv" }, { status: 400 });
  try {
    const result = await importCsv(auth.tenantId, id, csv);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
