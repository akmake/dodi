/**
 * GET/POST /api/users — team members & invites ([קטגוריה 25] §25.2).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { ensureSystemRoles, inviteUser, listUsers } from "@/modules/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;
  const roles = await ensureSystemRoles(auth.tenantId);
  return NextResponse.json({
    items: await listUsers(auth.tenantId),
    roles: roles.map((r) => r.name),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { email?: string; roleName?: string; name?: string };
  if (!body.email?.trim() || !body.roleName?.trim()) {
    return NextResponse.json({ error: "email and roleName are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await inviteUser(auth.tenantId, body.email, body.roleName, body.name), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
