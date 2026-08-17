/**
 * POST /api/whatsapp/flows/data-exchange/{key}
 *
 * Data exchange endpoint configured in Meta for native WhatsApp Flows.
 */
import { NextResponse, type NextRequest } from "next/server";
import { defaultTenantId } from "@/core/tenant/context";
import { handleDataExchange } from "@/modules/whatsapp-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await handleDataExchange(defaultTenantId(), key, payload));
}
