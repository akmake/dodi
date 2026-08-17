/**
 * GET /api/contacts/export — CSV export.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { exportContactsCsv } from "@/modules/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "data.export");
  if (auth instanceof NextResponse) return auth;
  return new NextResponse(await exportContactsCsv(auth.tenantId), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contacts.csv"',
    },
  });
}
