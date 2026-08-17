import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getSmsDashboard, rotateSmsPairingKey, saveSmsSettings, testSmsEmail, testSmsWhatsapp } from "@/modules/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await getSmsDashboard(auth.tenantId));
}

export async function PUT(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    waPhone?: string; emailFallback?: boolean;
    senderEmail?: string; appPassword?: string; destinationEmail?: string; enabled?: boolean;
  };
  try {
    return NextResponse.json(await saveSmsSettings(auth.tenantId, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "test_whatsapp") return NextResponse.json(await testSmsWhatsapp(auth.tenantId));
    if (body.action === "test_email") return NextResponse.json(await testSmsEmail(auth.tenantId));
    if (body.action === "rotate_key") return NextResponse.json(await rotateSmsPairingKey(auth.tenantId));
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
