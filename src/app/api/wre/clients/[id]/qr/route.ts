/**
 * GET /api/wre/clients/:id/qr — ensure the always-on socket is up and report the
 * current pairing state.
 *
 * WhatsApp rotates the pairing QR roughly every 20s, and the engine only
 * broadcasts on `connection === "open"` — never on a QR refresh. So there is no
 * push telling the UI a new code exists, and the client has to poll. This route
 * is built for that: it always answers 200 with `{ status, qr }`, so the modal
 * can loop cheaply, swap in each fresh code, and notice the moment the scan
 * lands.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { ensureStarted, getQR, getStatus, isConnected } from "@/modules/wre/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Hold briefly waiting for a first QR, so a fresh socket doesn't answer empty. */
const WAIT_MS = 8000;
const TICK_MS = 400;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  // MUST be `ensureStarted`, never `connect`: this route is polled, and `connect`
  // rebuilds the socket whenever it isn't already connected — which during
  // pairing means a brand-new, unscannable QR on every single poll.
  await ensureStarted(id);

  const deadline = Date.now() + WAIT_MS;
  do {
    // Checked first and inside the loop: the scan can land mid-wait, and the
    // engine nulls `qr` on success — without this the modal would sit on a dead
    // code instead of closing.
    if (isConnected(id)) return NextResponse.json({ status: "connected", qr: null });

    const qr = getQR(id);
    if (qr) return NextResponse.json({ status: getStatus(id), qr });

    await new Promise((r) => setTimeout(r, TICK_MS));
  } while (Date.now() < deadline);

  // No code yet (socket still starting, or a transient reconnect). 200 with a
  // null qr keeps the client polling instead of treating it as an error.
  return NextResponse.json({ status: getStatus(id), qr: null });
}
