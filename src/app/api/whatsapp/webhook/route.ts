/**
 * WhatsApp webhook (App Router) — [קטגוריה 2] §2.2.
 *
 * Path: `/api/whatsapp/webhook` — the LIVE production webhook. Meta's Callback
 * URL points here (verified 2026-06-29); the legacy Pages-router handler and
 * `src/lib/*` chain were deleted after the cutover.
 *
 *   GET  → Meta verification handshake (hub.challenge).
 *   POST → signed delivery of inbound messages + statuses.
 *
 * Node runtime: signature verification uses node:crypto. POST accepts fast by
 * enqueueing the payload; `/api/jobs/drain` performs processing + retries.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyHandshake, verifyWebhookSignature } from "@/modules/whatsapp";
import { processWebhookInline } from "@/modules/pipeline/whatsapp-webhook";
import { logError, logEvent } from "@/core/logs";
import { defaultTenantId } from "@/core/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Process inline within this window — Hobby crons run only daily, so we can't
// rely on /api/jobs/drain for real-time replies.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const result = verifyHandshake(
    sp.get("hub.mode"),
    sp.get("hub.verify_token"),
    sp.get("hub.challenge")
  );
  if (result.ok) {
    return new NextResponse(result.challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Read the RAW body first — the signature is over these exact bytes (§2.2).
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  const sig = verifyWebhookSignature(rawBody, signature);
  if (!sig.valid) {
    logEvent(defaultTenantId(), { level: "warn", source: "webhook", message: "חתימת webhook נדחתה", detail: sig.reason ?? null });
    return new NextResponse("invalid signature", { status: 403 });
  }

  try {
    const payload = JSON.parse(rawBody);
    await processWebhookInline(payload);
  } catch (err) {
    // Always 200 to Meta (like the legacy handler) so it doesn't retry-storm;
    // Mongo dedup makes any retry that does arrive idempotent.
    logError(defaultTenantId(), "webhook", "כשל כללי בעיבוד webhook נכנס", err);
  }
  return NextResponse.json({ status: "ok" });
}
