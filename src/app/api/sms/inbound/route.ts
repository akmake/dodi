import { NextResponse, type NextRequest } from "next/server";
import { receiveSms, SmsInboundError, type InboundSmsPayload } from "@/modules/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const body = (await req.json().catch(() => null)) as InboundSmsPayload | null;
  if (!body) return NextResponse.json({ error: "invalid json" }, { status: 400 });
  try {
    const result = await receiveSms(key, body);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof SmsInboundError ? error.status : 500;
    const message = error instanceof SmsInboundError ? error.message : "internal error";
    return NextResponse.json({ error: message }, { status });
  }
}
