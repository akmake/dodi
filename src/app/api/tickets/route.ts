/**
 * Tickets ([קטגוריה 16]).  GET → list (?status=).  POST → create { subject, contactId?, ... }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createTicket, listTickets, type CreateTicketInput, type TicketListFilter } from "@/modules/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const filter: TicketListFilter = {};
  const status = sp.get("status");
  const priority = sp.get("priority");
  const assigneeId = sp.get("assigneeId");
  const tag = sp.get("tag");
  if (status) filter.status = status as TicketListFilter["status"];
  if (priority) filter.priority = priority as TicketListFilter["priority"];
  if (assigneeId) filter.assigneeId = assigneeId;
  if (tag) filter.tag = tag;
  try {
    return NextResponse.json({ items: await listTickets(auth.tenantId, filter) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CreateTicketInput>;
  if (!body.subject?.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await createTicket(auth.tenantId, { subject: body.subject, ...body }), {
      status: 201,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
