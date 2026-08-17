/**
 * Route guard — [קטגוריה 25] §25.2.
 *
 * `authorize(req, scope?)` resolves the session to a tenant + user and enforces
 * an RBAC scope. Route handlers call it first and bail on the returned
 * NextResponse:
 *
 *   const auth = await authorize(req, "contacts.manage");
 *   if (auth instanceof NextResponse) return auth;
 *   // ...use auth.tenantId / auth.userId
 *
 * This is the seam that replaces `defaultTenantId()` in handlers — tenant now
 * comes from the authenticated session, not a global default.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, type SessionContext } from "@/modules/auth";
import { can } from "@/modules/admin/service";
import type { Scope } from "@/modules/admin/rbac";

function tokenFromRequest(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return req.cookies.get("bw_session")?.value ?? null;
}

export async function authorize(
  req: NextRequest,
  scope?: Scope
): Promise<SessionContext | NextResponse> {
  const ctx = await verifySession(tokenFromRequest(req));
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (scope && !(await can(ctx.tenantId, ctx.userId, scope))) {
    return NextResponse.json({ error: "forbidden", required: scope }, { status: 403 });
  }
  return ctx;
}
