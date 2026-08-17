/**
 * Two-factor (TOTP) management for the current user ([קטגוריה 25] §25.3).
 *   GET                       → { enabled }.
 *   POST { action: "begin" }  → { secret, otpauthUrl } (enrollment, not yet on).
 *   POST { action: "confirm", code } → switch 2FA on after a valid code.
 *   POST { action: "disable" }       → turn 2FA off.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { beginTotpEnrollment, confirmTotp, disableTotp, getTwoFactorStatus } from "@/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await getTwoFactorStatus(auth.tenantId, auth.userId));
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; account?: string };
  try {
    if (body.action === "begin") {
      return NextResponse.json(await beginTotpEnrollment(auth.tenantId, auth.userId, body.account ?? auth.userId));
    }
    if (body.action === "confirm") {
      if (!body.code) return NextResponse.json({ error: "missing code" }, { status: 400 });
      const ok = await confirmTotp(auth.tenantId, auth.userId, String(body.code));
      return ok ? NextResponse.json({ enabled: true }) : NextResponse.json({ error: "קוד שגוי" }, { status: 400 });
    }
    if (body.action === "disable") {
      await disableTotp(auth.tenantId, auth.userId);
      return NextResponse.json({ enabled: false });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
