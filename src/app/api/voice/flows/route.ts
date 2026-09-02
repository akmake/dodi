/**
 * IVR flows ([קטגוריה 26]).  GET → list.  POST → create { name, greeting?, nodes?, ... }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createFlow, listFlows, type IvrNode } from "@/modules/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listFlows(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { name?: string; greeting?: string; nodes?: IvrNode[]; rootNodeId?: string | null; enabled?: boolean };
  if (!body.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const flow = await createFlow(auth.tenantId, { name: body.name.trim(), greeting: body.greeting, nodes: body.nodes, rootNodeId: body.rootNodeId, enabled: body.enabled });
  return NextResponse.json(flow, { status: 201 });
}
