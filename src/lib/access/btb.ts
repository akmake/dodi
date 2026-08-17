/**
 * BTB API access resolution ([איחוד] per-account customer scoping).
 *
 * A route can be reached by:
 *   • an internal operator with `btb.manage`  → full access (all accounts), or
 *   • a BTB customer with `btb.view_own`       → limited to their `btbAccountIds`.
 *
 * Usage in a route handler:
 *   const access = await resolveBtbAccess(req);
 *   if (access instanceof NextResponse) return access;      // 401/403
 *   const denied = assertBtbAccount(access, id);            // per-account guard
 *   if (denied) return denied;
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getAccessProfile } from "@/modules/admin";

export interface BtbAccess {
  tenantId: string;
  userId: string;
  scope: "manage" | "own";
  /** Only meaningful for scope==="own": the accounts this customer may touch. */
  accountIds: string[];
}

export async function resolveBtbAccess(req: NextRequest): Promise<BtbAccess | NextResponse> {
  // Full internal access?
  const asManage = await authorize(req, "btb.manage");
  if (!(asManage instanceof NextResponse)) {
    return { tenantId: asManage.tenantId, userId: asManage.userId, scope: "manage", accountIds: [] };
  }
  // Otherwise require the customer scope.
  const asOwn = await authorize(req, "btb.view_own");
  if (asOwn instanceof NextResponse) return asOwn;
  const profile = await getAccessProfile(asOwn.tenantId, asOwn.userId);
  return { tenantId: asOwn.tenantId, userId: asOwn.userId, scope: "own", accountIds: profile?.btbAccountIds ?? [] };
}

/** Returns a 403 NextResponse if a customer is reaching an account outside their set; null when allowed. */
export function assertBtbAccount(access: BtbAccess, accountId: string): NextResponse | null {
  if (access.scope === "manage") return null;
  if (!access.accountIds.includes(accountId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}
