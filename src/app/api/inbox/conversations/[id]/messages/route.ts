/**
 * POST /api/inbox/conversations/{id}/messages — send a reply or add a note.
 *
 * Body: { body: string, kind?: "reply" | "note", agentId?: string }
 *   reply (default) → sent to the customer via WhatsApp (24h window enforced).
 *   note            → internal note, never sent (§3.3).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { addInternalNote, reply } from "@/modules/inbox";
import { WhatsAppApiError } from "@/modules/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    body?: string;
    kind?: "reply" | "note";
    agentId?: string;
  };

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }

  try {
    const message =
      body.kind === "note"
        ? await addInternalNote(tenantId, id, body.body, body.agentId)
        : await reply(tenantId, id, body.body, body.agentId);
    return NextResponse.json({ message });
  } catch (err) {
    // Surface a window/template error with a usable status + Meta code (§2.3/§2.4).
    if (err instanceof WhatsAppApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
