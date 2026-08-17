import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { isConnected, sendMessage } from "@/modules/wa-engine/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { phone?: string; message?: string };
  if (!body.phone || !body.message) return NextResponse.json({ error: "טלפון והודעה הם חובה" }, { status: 400 });

  if (!isConnected(id)) return NextResponse.json({ error: "הוואצאפ של לקוח זה לא מחובר כרגע" }, { status: 400 });

  const jid = `${body.phone.replace(/\D/g, "")}@s.whatsapp.net`;
  await sendMessage(id, jid, { text: body.message });
  return NextResponse.json({ ok: true });
}
