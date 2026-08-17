/**
 * GET/POST /api/admin/users — platform user management ([איחוד] admin area).
 * GET  → users (enriched with access) + BTB accounts (for the picker) + pending invites.
 * POST → create an invite (returns its token; the admin shares /invite/<token>).
 * Gated by `users.manage` (admins / designated managers only).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listUsers, getAccessProfile } from "@/modules/admin";
import type { ServiceId } from "@/modules/admin/models";
import { createInvite, listPendingInvites } from "@/modules/access/invites";
import { listBtbAccounts } from "@/modules/btb/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SERVICES: ServiceId[] = ["wtm", "btb", "wbr", "wta", "wre"];

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;

  const [users, btbAccounts, invites] = await Promise.all([
    listUsers(auth.tenantId),
    listBtbAccounts(),
    listPendingInvites(auth.tenantId),
  ]);

  const enriched = await Promise.all(
    users.map(async (u) => {
      const profile = await getAccessProfile(auth.tenantId, u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        isAdmin: profile?.isAdmin ?? false,
        allowedServices: u.allowedServices ?? [],
        btbAccountIds: u.btbAccountIds ?? [],
      };
    })
  );

  return NextResponse.json({
    users: enriched,
    btbAccounts: btbAccounts.map((a) => ({ id: a._id.toString(), name: a.name, phone: a.phone })),
    invites: invites.map((i) => ({
      token: i.token,
      name: i.name,
      isAdmin: i.isAdmin,
      allowedServices: i.allowedServices,
      btbAccountIds: i.btbAccountIds,
      expiresAt: i.expiresAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    isAdmin?: boolean;
    allowedServices?: string[];
    btbAccountIds?: string[];
  };

  const allowedServices = (body.allowedServices ?? []).filter((s): s is ServiceId => VALID_SERVICES.includes(s as ServiceId));
  if (!body.isAdmin && allowedServices.length === 0) {
    return NextResponse.json({ error: "יש לבחור לפחות שירות אחד (או לסמן מנהל)" }, { status: 400 });
  }

  const invite = await createInvite(auth.tenantId, auth.userId, {
    name: body.name?.trim() || null,
    isAdmin: !!body.isAdmin,
    allowedServices,
    btbAccountIds: body.btbAccountIds ?? [],
  });

  return NextResponse.json(
    { token: invite.token, name: invite.name, allowedServices: invite.allowedServices, expiresAt: invite.expiresAt },
    { status: 201 }
  );
}
