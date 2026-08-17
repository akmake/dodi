/**
 * POST /api/whatsapp-flows/{id}/send — send native WhatsApp Flow to a contact.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { sendNativeFlow } from "@/modules/whatsapp-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    body?: string;
    cta?: string;
    screen?: string;
    data?: Record<string, unknown>;
  };
  if (!body.to || !body.body || !body.cta) {
    return NextResponse.json({ error: "to, body and cta are required" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      message: await sendNativeFlow(auth.tenantId, id, body.to, {
        body: body.body,
        cta: body.cta,
        screen: body.screen,
        data: body.data,
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
