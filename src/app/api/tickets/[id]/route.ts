/**
 * A single ticket ([קטגוריה 16]).
 *   GET   → the ticket.
 *   PATCH → { status?, priority?, assigneeId?, note?, macroId? } — applies the
 *           change, a macro, or appends an internal note.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  addNote,
  applyMacro,
  assignTicket,
  getTicket,
  markFirstResponse,
  setPriority,
  setStatus,
  type TicketPriority,
  type TicketStatus,
} from "@/modules/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ticket = await getTicket(auth.tenantId, id);
  if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(ticket);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string | null;
    note?: string;
    macroId?: string;
    markResponded?: boolean;
  };
  try {
    if (body.macroId) {
      const { ticket, reply } = await applyMacro(auth.tenantId, id, body.macroId, auth.userId);
      if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ticket, reply });
    }
    let ticket = await getTicket(auth.tenantId, id);
    if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (body.priority) ticket = await setPriority(auth.tenantId, id, body.priority);
    if (body.status) ticket = await setStatus(auth.tenantId, id, body.status);
    if (body.assigneeId !== undefined) ticket = await assignTicket(auth.tenantId, id, body.assigneeId);
    if (body.markResponded) ticket = await markFirstResponse(auth.tenantId, id);
    if (body.note?.trim()) ticket = await addNote(auth.tenantId, id, body.note.trim(), auth.userId);
    return NextResponse.json(ticket);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
