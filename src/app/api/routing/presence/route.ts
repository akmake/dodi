/**
 * Agent presence & skills ([קטגוריה 17] §17.1).
 *   GET  → list all agents' presence.
 *   POST → upsert { agentId, status?, skills?, maxCapacity? } (heartbeat).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listPresence, setPresence, type PresenceStatus } from "@/modules/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listPresence(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    status?: PresenceStatus;
    skills?: string[];
    maxCapacity?: number;
  };
  // Default to the caller's own id when none is supplied (self heartbeat).
  const agentId = body.agentId ?? auth.userId;
  if (!agentId) return NextResponse.json({ error: "missing agentId" }, { status: 400 });
  const presence = await setPresence(auth.tenantId, agentId, {
    status: body.status,
    skills: body.skills,
    maxCapacity: body.maxCapacity,
  });
  return NextResponse.json(presence);
}
