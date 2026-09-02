/**
 * GET/POST /api/whatsapp-flows — native WhatsApp Flow catalog ([קטגוריה 9]).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listWhatsAppFlows, saveWhatsAppFlow, type SaveWhatsAppFlowInput } from "@/modules/whatsapp-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listWhatsAppFlows(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<SaveWhatsAppFlowInput>;
  if (!body.name || !body.metaFlowId || !body.endpointKey) {
    return NextResponse.json({ error: "name, metaFlowId and endpointKey are required" }, { status: 400 });
  }
  const flow = await saveWhatsAppFlow(auth.tenantId, {
    name: body.name,
    metaFlowId: body.metaFlowId,
    endpointKey: body.endpointKey,
    language: body.language,
    flowJson: body.flowJson,
    dataExchangeResponse: body.dataExchangeResponse,
    status: body.status,
  });
  return NextResponse.json(flow, { status: 201 });
}
