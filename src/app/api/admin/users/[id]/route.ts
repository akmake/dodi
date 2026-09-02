/**
 * PATCH/DELETE /api/admin/users/:id — edit a user's access or remove them.
 * PATCH body: { allowedServices?, btbAccountIds?, status? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { updateUserAccess, deleteUser } from "@/modules/admin";
import type { ServiceId } from "@/modules/admin/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SERVICES: ServiceId[] = ["wtm", "btb", "wbr", "wta", "wre"];
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { allowedServices?: string[]; btbAccountIds?: string[]; status?: string };

  const patch: { allowedServices?: ServiceId[]; btbAccountIds?: string[]; status?: "active" | "disabled" } = {};
  if (body.allowedServices !== undefined)
    patch.allowedServices = body.allowedServices.filter((s): s is ServiceId => VALID_SERVICES.includes(s as ServiceId));
  if (body.btbAccountIds !== undefined) patch.btbAccountIds = body.btbAccountIds;
  if (body.status === "active" || body.status === "disabled") patch.status = body.status;

  const updated = await updateUserAccess(auth.tenantId, id, patch);
  if (!updated) return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "users.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (id === auth.userId) return NextResponse.json({ error: "אי אפשר למחוק את עצמך" }, { status: 400 });
  await deleteUser(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
