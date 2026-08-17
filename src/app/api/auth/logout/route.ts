/**
 * POST /api/auth/logout — clears the session.
 */
import { NextResponse, type NextRequest } from "next/server";
import { logout } from "@/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await logout(req.cookies.get("bw_session")?.value ?? null);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("bw_session", "", { path: "/", maxAge: 0 });
  return res;
}
