/**
 * GET /api/wta/logs — global moderation log across all WTA clients (most recent
 * first), each row enriched with its client's name.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listAllActions, listWtaClients } from "@/modules/wta/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;

  const [actions, clients] = await Promise.all([listAllActions(300), listWtaClients()]);
  const nameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  return NextResponse.json({
    actions: actions.map((a) => ({ ...a, clientName: nameById.get(a.clientId) ?? "—" })),
  });
}
