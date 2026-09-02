/**
 * GET /api/wtm/dashboard — monitor summary + per-client wa/bridge stats.
 * Port of `Whatsapp/server/routes/dashboardRoutes.js`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listWtmClients } from "@/modules/wtm/repository";
import { getAllStats } from "@/modules/wa-engine/whatsappManager";
import { getBridgeStats } from "@/modules/wtm/emailBridgeManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const clients = await listWtmClients();
  const waStats = getAllStats() as Record<string, Record<string, unknown>>;

  const data = clients.map((t) => {
    const id = t._id.toString();
    const wa = (waStats[id] as Record<string, unknown>) || {
      status: "disconnected",
      msgsReceived: 0,
      msgsSent: 0,
      reconnectCount: 0,
      connectedAt: null,
      lastMsgAt: null,
      lastMsgDirection: null,
    };
    const bridge = getBridgeStats(id) as Record<string, unknown>;

    return {
      _id: id,
      name: t.name,
      phone: t.phone,
      bridgeEmail: t.bridgeEmail || null,
      destinationEmail: t.destinationEmail || null,
      emailConfigured: !!(t.bridgeEmail && t.bridgeEmailPassword && t.destinationEmail),
      wa: {
        status: wa.status,
        connectedAt: wa.connectedAt ?? null,
        lastMsgAt: wa.lastMsgAt ?? null,
        lastMsgDirection: wa.lastMsgDirection ?? null,
        msgsReceived: wa.msgsReceived ?? 0,
        msgsSent: wa.msgsSent ?? 0,
        reconnectCount: wa.reconnectCount ?? 0,
      },
      bridge: {
        active: (bridge?.active as boolean) || false,
        waToEmail: (bridge?.waToEmail as number) || 0,
        emailToWa: (bridge?.emailToWa as number) || 0,
        lastEmailAt: bridge?.lastEmailAt || null,
        connectedAt: bridge?.connectedAt || null,
        reconnectCount: (bridge?.reconnectCount as number) || 0,
      },
    };
  });

  const summary = {
    total: data.length,
    connected: data.filter((t) => t.wa.status === "connected").length,
    disconnected: data.filter((t) => t.wa.status === "disconnected").length,
    waitingQr: data.filter((t) => t.wa.status === "waiting_qr").length,
    emailNotConfigured: data.filter((t) => !t.emailConfigured).length,
    totalWaToEmail: data.reduce((s, t) => s + t.bridge.waToEmail, 0),
    totalEmailToWa: data.reduce((s, t) => s + t.bridge.emailToWa, 0),
  };

  return NextResponse.json({ summary, tenants: data });
}
