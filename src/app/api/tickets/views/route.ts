/**
 * Saved ticket views ([קטגוריה 16] §16.4).
 *   GET → list views.   POST → create { name, filter, shared? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createView, listViews, type TicketView } from "@/modules/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listViews(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { name?: string; filter?: TicketView["filter"]; shared?: boolean };
  if (!body.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const view = await createView(auth.tenantId, { name: body.name.trim(), filter: body.filter ?? {}, shared: body.shared });
  return NextResponse.json(view, { status: 201 });
}
