/**
 * GET /api/wta/pool-status — live connection state of every WTA client, for the
 * monitor screen. WTA sockets are always-on (no conveyor), so this is a simple
 * per-client status roll-up.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listWtaClients } from "@/modules/wta/repository";
import { getStatus } from "@/modules/wta/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;

  const clients = await listWtaClients();
  const rows = clients.map((c) => ({
    _id: c._id.toString(),
    name: c.name,
    phone: c.phone,
    active: c.active,
    status: getStatus(c._id.toString()),
    managedGroups: c.managedGroups.filter((g) => g.enabled).length,
  }));

  const connected = rows.filter((r) => r.status === "connected").length;
  return NextResponse.json({
    total: rows.length,
    active: clients.filter((c) => c.active).length,
    connected,
    rows,
  });
}
