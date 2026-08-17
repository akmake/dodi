/**
 * GET/POST /api/invite/:token — public invite endpoints (no session required).
 * GET  → invite state + label/services (for the accept form).
 * POST → accept: { email, password } → create the active user + mint a session.
 */
import { NextResponse, type NextRequest } from "next/server";
import { inspectInvite, acceptInvite } from "@/modules/access/invites";
import { login } from "@/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const { state, invite } = await inspectInvite(token);
  if (state !== "ok" || !invite) return NextResponse.json({ state }, { status: state === "not_found" ? 404 : 410 });
  return NextResponse.json({
    state,
    name: invite.name,
    isAdmin: invite.isAdmin,
    allowedServices: invite.allowedServices,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!email || password.length < 8) {
    return NextResponse.json({ error: "יש להזין אימייל וסיסמה (לפחות 8 תווים)" }, { status: 400 });
  }

  const result = await acceptInvite(token, email, password);
  if (!result.ok) {
    const map: Record<string, string> = {
      email_taken: "האימייל כבר קיים במערכת",
      not_found: "ההזמנה לא נמצאה",
      used: "ההזמנה כבר נוצלה",
      expired: "ההזמנה פגה",
      invalid_input: "פרטים לא תקינים",
    };
    return NextResponse.json({ error: map[result.error ?? ""] ?? "ההרשמה נכשלה" }, { status: 400 });
  }

  // Mint a session using the freshly-set credentials (same path as normal login).
  const session = await login(result.email!, password);
  if (!session || "twoFactorRequired" in session) {
    // Account created but auto-login didn't return a token — let them log in manually.
    return NextResponse.json({ ok: true, autoLogin: false });
  }

  const res = NextResponse.json({ ok: true, autoLogin: true });
  res.cookies.set("bw_session", session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
