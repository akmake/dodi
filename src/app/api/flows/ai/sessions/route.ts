/**
 * AI Flow Architect chat sessions ([קטגוריה 27]).
 *   GET  ?id=...      → one full session (turns) to reopen.
 *   GET  ?flowId=...  → list sessions for a flow (metadata).
 *   POST { id?, flowId, turns } → upsert the session, returns its id.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getSession, listSessions, upsertSession, type ArchitectSessionTurn } from "@/modules/flow-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const id = req.nextUrl.searchParams.get("id");
  const flowId = req.nextUrl.searchParams.get("flowId");
  try {
    if (id) {
      const session = await getSession(auth.tenantId, id);
      if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(session);
    }
    return NextResponse.json({ sessions: await listSessions(auth.tenantId, flowId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => null)) as {
    id?: string | null;
    flowId?: string | null;
    turns?: ArchitectSessionTurn[];
  } | null;
  if (!body || !Array.isArray(body.turns)) {
    return NextResponse.json({ error: "missing turns" }, { status: 400 });
  }
  try {
    const session = await upsertSession(auth.tenantId, {
      id: body.id ?? null,
      flowId: body.flowId ?? null,
      turns: body.turns,
    });
    return NextResponse.json({ id: session.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
