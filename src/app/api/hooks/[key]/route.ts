/**
 * POST /api/hooks/{key} — public inbound webhook trigger (C2).
 *
 * The key is configured on a Trigger as `config.webhookKey`. Payload may include
 * `waId`, `contactId`, or `conversationId` so the target flow has a recipient.
 */
import { NextResponse, type NextRequest } from "next/server";
import { defaultTenantId } from "@/core/tenant/context";
import { fireAutomationEvent } from "@/modules/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await fireAutomationEvent(defaultTenantId(), {
      type: "webhook",
      key,
      contactId: stringOrUndefined(payload.contactId),
      conversationId: stringOrUndefined(payload.conversationId),
      waId: stringOrUndefined(payload.waId),
      payload,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
