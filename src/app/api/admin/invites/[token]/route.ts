/**
 * DELETE /api/admin/invites/:token — revoke a pending invite.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { revokeInvite } from "@/modules/access/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;
  const { token } = await ctx.params;
  await revokeInvite(auth.tenantId, token);
  return NextResponse.json({ ok: true });
}
