/**
 * SMS relay WhatsApp socket — pairing state (GET) and lifecycle actions (POST).
 *
 * WhatsApp rotates the pairing QR roughly every 20s and the engine never pushes
 * on a refresh, so the settings page has to poll. GET always answers 200 with
 * `{ status, qr }` so the panel can loop cheaply, swap in each fresh code, and
 * notice the moment the scan lands.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { connect, disconnect, ensureStarted, getQR, getStatus, isConnected, reset } from "@/modules/sms/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Hold briefly waiting for a first QR, so a fresh socket doesn't answer empty. */
const WAIT_MS = 8000;
const TICK_MS = 400;

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  // MUST be `ensureStarted`, never `connect`: this route is polled, and `connect`
  // rebuilds the socket whenever it isn't already connected — which during
  // pairing means a brand-new, unscannable QR on every single poll.
  await ensureStarted(tenantId);

  const deadline = Date.now() + WAIT_MS;
  do {
    // Checked first and inside the loop: the scan can land mid-wait, and the
    // engine nulls `qr` on success — without this the panel would sit on a dead
    // code instead of closing.
    if (isConnected(tenantId)) return NextResponse.json({ status: "connected", qr: null });

    const qr = getQR(tenantId);
    if (qr) return NextResponse.json({ status: getStatus(tenantId), qr });

    await new Promise((r) => setTimeout(r, TICK_MS));
  } while (Date.now() < deadline);

  // No code yet (socket still starting, or a transient reconnect). 200 with a
  // null qr keeps the client polling instead of treating it as an error.
  return NextResponse.json({ status: getStatus(tenantId), qr: null });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  // These are explicit user intent, so `connect` (force-restart) is correct here
  // — unlike the polled GET above.
  if (body.action === "reconnect") {
    void connect(tenantId);
    return NextResponse.json({ ok: true, status: getStatus(tenantId) });
  }
  if (body.action === "disconnect") {
    disconnect(tenantId);
    return NextResponse.json({ ok: true, status: getStatus(tenantId) });
  }
  if (body.action === "unlink") {
    // Deletes the session files — the next connect asks for a fresh QR, which is
    // the only way to move the relay to a different phone.
    reset(tenantId);
    return NextResponse.json({ ok: true, status: getStatus(tenantId) });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
