/**
 * Outbound webhook subscriptions ([קטגוריה 22] §22.2).
 *   GET  /api/integrations/webhooks  → list
 *   POST /api/integrations/webhooks  { targetUrl, events[], secret? }
 *                                     → { subscription, secret }  (secret shown once)
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createSubscription, listSubscriptions, OUTBOUND_EVENTS } from "@/modules/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listSubscriptions(auth.tenantId), events: OUTBOUND_EVENTS });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    targetUrl?: string;
    events?: string[];
    secret?: string;
  };
  if (!body.targetUrl?.trim() || !Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: "targetUrl and events[] are required" }, { status: 400 });
  }
  try {
    const { subscription, secret } = await createSubscription(auth.tenantId, {
      targetUrl: body.targetUrl,
      events: body.events,
      secret: body.secret,
    });
    return NextResponse.json({ subscription, secret }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
