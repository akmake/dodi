/**
 * GET /api/contacts — search contacts ([קטגוריה 4] §4.5).
 * Query: ?query=&tag=&status=&limit=
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { searchContacts } from "@/modules/contacts";
import type { ContactStatus } from "@/modules/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const sp = req.nextUrl.searchParams;

  try {
    const items = await searchContacts(tenantId, {
      query: sp.get("query") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      status: (sp.get("status") as ContactStatus | null) ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
