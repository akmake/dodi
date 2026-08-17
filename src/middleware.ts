/**
 * Auth gate — [קטגוריה 25] §25.2 (Phase F).
 *
 * Coarse, edge-safe gate: `/dashboard/*` requires a session cookie, else redirect
 * to /login. Real verification happens at the API layer (`core/http.authorize`);
 * this just keeps the UI shell from rendering for anonymous visitors and bounces
 * logged-in users away from /login.
 */
import { NextResponse, type NextRequest } from "next/server";

// Coarse cookie-presence gate. Fine-grained per-service / admin access is
// enforced server-side in the area layouts (src/lib/access/guard.ts). `/invite`
// is intentionally NOT gated — it's the public acceptance page.
const GATED_PREFIXES = ["/dashboard", "/services", "/wtm", "/btb", "/wta", "/wre", "/admin"];

export function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get("bw_session")?.value;
  const { pathname } = req.nextUrl;

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/services", req.url));
  }
  if (GATED_PREFIXES.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/services/:path*", "/wtm/:path*", "/btb/:path*", "/wta/:path*", "/wre/:path*", "/admin/:path*", "/login"],
};
