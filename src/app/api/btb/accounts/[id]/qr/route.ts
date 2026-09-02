/**
 * GET /api/btb/accounts/:id/qr — connect (if disconnected) and long-poll up to
 * 30s for a QR code. Port of `btbRoutes.js` GET '/:id/qr'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getStatus, connect, getQR, isConnected } from "@/modules/btb/statusManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  // Only connect if there's no live socket — avoids killing a QR already shown to the user.
  if (getStatus(id) === "disconnected") await connect(id);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const qr = getQR(id);
    if (qr) return NextResponse.json({ qr });
    if (isConnected(id)) return NextResponse.json({ connected: true });
    await new Promise((r) => setTimeout(r, 500));
  }
  return NextResponse.json({ error: "לא התקבל QR תוך 30 שניות — נסה שוב" }, { status: 408 });
}
