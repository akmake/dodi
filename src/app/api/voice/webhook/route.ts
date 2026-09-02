/**
 * Telephony carrier webhook ([קטגוריה 26]).
 *
 * The carrier (Twilio/Vonage/…) calls this for each step of an inbound call. We
 * walk the IVR engine and render the next instructions through the carrier
 * adapter. Stage is selected by `?event=`:
 *   incoming  → start the call, play greeting + first node
 *   digit     → advance after a DTMF press (Digits)
 *   recording → attach a voicemail recording (RecordingUrl)
 *   completed → close the call session
 *
 * Tenant resolves via the default tenant for now (carrier number → tenant is the
 * multi-tenant upgrade). Live deployments must verify the carrier signature.
 */
import { NextResponse, type NextRequest } from "next/server";
import { defaultTenantId } from "@/core/tenant/context";
import { attachRecording, endCall, handleDigit, handleInboundCall } from "@/modules/voice";
import { getAdapter } from "@/modules/voice/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function params(req: NextRequest): Promise<URLSearchParams> {
  const sp = new URLSearchParams(req.nextUrl.searchParams);
  if (req.method === "POST") {
    try {
      const form = await req.formData();
      for (const [k, v] of form.entries()) sp.set(k, String(v));
    } catch {
      /* not form-encoded — ignore */
    }
  }
  return sp;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const tenantId = defaultTenantId();
  const sp = await params(req);
  const event = sp.get("event") ?? "incoming";
  const callId = sp.get("CallSid") ?? sp.get("call_id") ?? sp.get("uuid") ?? "unknown";
  const adapter = getAdapter(sp.get("carrier") ?? undefined);
  const actionUrl = `${req.nextUrl.origin}/api/voice/webhook?event=digit&CallSid=${encodeURIComponent(callId)}`;

  if (event === "digit") {
    const { instructions } = await handleDigit(tenantId, callId, sp.get("Digits") ?? sp.get("digit") ?? "");
    const out = adapter.render(instructions, { actionUrl });
    return new NextResponse(out.body, { headers: { "Content-Type": out.contentType } });
  }
  if (event === "recording") {
    await attachRecording(tenantId, callId, sp.get("RecordingUrl") ?? sp.get("recording_url") ?? "", sp.get("TranscriptionText") ?? undefined);
    const out = adapter.render([{ verb: "say", text: "תודה, ההודעה נקלטה." }, { verb: "hangup" }], { actionUrl });
    return new NextResponse(out.body, { headers: { "Content-Type": out.contentType } });
  }
  if (event === "completed") {
    await endCall(tenantId, callId);
    return NextResponse.json({ ok: true });
  }

  // incoming
  const { instructions } = await handleInboundCall(tenantId, {
    externalCallId: callId,
    from: sp.get("From") ?? sp.get("from") ?? "",
    to: sp.get("To") ?? sp.get("to") ?? "",
  });
  const out = adapter.render(instructions, { actionUrl });
  return new NextResponse(out.body, { headers: { "Content-Type": out.contentType } });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
