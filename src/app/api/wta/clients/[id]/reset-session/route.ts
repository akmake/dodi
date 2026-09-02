/**
 * POST /api/wta/clients/:id/reset-session — wipe the WhatsApp session (forces a
 * fresh QR) and bring the socket back up.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWtaClient } from "@/modules/wta/repository";
import { connect, reset } from "@/modules/wta/manager";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWtaClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  reset(id);
  void connect(id);
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wta.client.reset_session", id);
  return NextResponse.json({ ok: true });
}
