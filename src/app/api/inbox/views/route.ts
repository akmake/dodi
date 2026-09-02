/**
 * Saved inbox views ([קטגוריה 3] §3.1).
 *   GET → list views.   POST → create { name, filter, shared? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createInboxView, listInboxViews, type InboxView } from "@/modules/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listInboxViews(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { name?: string; filter?: InboxView["filter"]; shared?: boolean };
  if (!body.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const view = await createInboxView(auth.tenantId, { name: body.name.trim(), filter: body.filter ?? {}, shared: body.shared });
  return NextResponse.json(view, { status: 201 });
}
