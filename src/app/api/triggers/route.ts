/**
 * GET/POST /api/triggers — automation trigger management (C2).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createTrigger, listTriggers, type CreateTriggerInput } from "@/modules/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listTriggers(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CreateTriggerInput>;
  if (!body.type || !body.targetFlowId) {
    return NextResponse.json({ error: "type and targetFlowId are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createTrigger(auth.tenantId, {
        type: body.type,
        config: body.config,
        filters: body.filters,
        targetFlowId: body.targetFlowId,
        enabled: body.enabled,
        priority: body.priority,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
