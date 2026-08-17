/**
 * GET /api/auth/me — current session + effective scopes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getAccessProfile } from "@/modules/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  const profile = await getAccessProfile(auth.tenantId, auth.userId);
  return NextResponse.json({
    tenantId: auth.tenantId,
    userId: auth.userId,
    isAdmin: profile?.isAdmin ?? false,
    allowedServices: profile?.allowedServices ?? [],
    btbAccountIds: profile?.btbAccountIds ?? [],
    scopes: profile?.scopes ?? [],
  });
}
