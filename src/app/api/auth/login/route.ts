/**
 * POST /api/auth/login — [קטגוריה 25] §25.3.
 * Body: { email, password, totpCode? }. Sets an httpOnly `bw_session` cookie on
 * success. When 2FA is on and no code is supplied, returns { twoFactorRequired }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { login } from "@/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; totpCode?: string };
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const result = await login(String(body.email), String(body.password), body.totpCode ? String(body.totpCode) : undefined);
  if (!result) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  if ("twoFactorRequired" in result) {
    return NextResponse.json({ twoFactorRequired: true }, { status: 200 });
  }

  const res = NextResponse.json({ ok: true, userId: result.userId });
  res.cookies.set("bw_session", result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
