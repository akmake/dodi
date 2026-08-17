/**
 * Ticket macros ([קטגוריה 16] §16.3).
 *   GET  → list macros.   POST → create { name, body?, setStatus?, setPriority?, addTags? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createMacro, listMacros, type TicketPriority, type TicketStatus } from "@/modules/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listMacros(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    body?: string | null;
    setStatus?: TicketStatus | null;
    setPriority?: TicketPriority | null;
    addTags?: string[];
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const macro = await createMacro(auth.tenantId, { name: body.name.trim(), body: body.body, setStatus: body.setStatus, setPriority: body.setPriority, addTags: body.addTags });
  return NextResponse.json(macro, { status: 201 });
}
