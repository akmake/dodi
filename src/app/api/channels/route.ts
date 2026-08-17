/**
 * GET/POST /api/channels — channel accounts + adapter metadata ([קטגוריה 1]).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listAdapters, listChannels, registerChannel, type ChannelType } from "@/modules/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    adapters: listAdapters(),
    items: await listChannels(auth.tenantId),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    type?: ChannelType;
    name?: string;
    externalId?: string | null;
    config?: Record<string, unknown>;
    priority?: number;
  };
  if (!body.type || !body.name?.trim()) {
    return NextResponse.json({ error: "type and name are required" }, { status: 400 });
  }
  const item = await registerChannel(auth.tenantId, {
    type: body.type,
    name: body.name,
    status: "active",
    externalId: body.externalId ?? null,
    priority: body.priority ?? 0,
    config: body.config ?? {},
  });
  return NextResponse.json(item, { status: 201 });
}
