/**
 * GET /api/wtm/clients/:id/qr — long-poll up to 30s for a QR code.
 * Port of `tenantRoutes.js` GET '/:id/qr'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getQR } from "@/modules/wa-engine/whatsappManager";
import { poolForceWake } from "@/modules/wtm/tenantPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  poolForceWake(id);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const qr = getQR(id);
    if (qr) return NextResponse.json({ qr });
    await new Promise((r) => setTimeout(r, 500));
  }
  return NextResponse.json({ error: "לא התקבל QR תוך 30 שניות — נסה שוב" }, { status: 408 });
}
