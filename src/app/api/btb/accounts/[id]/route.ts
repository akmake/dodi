import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getBtbAccount, updateBtbAccount, deleteBtbAccount, deleteBtbAccountData } from "@/modules/btb/repository";
import { getStatus, reset as resetBtbSession } from "@/modules/btb/statusManager";
import { audit } from "@/modules/wa-engine/auditLog";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;
  const a = await getBtbAccount(id);
  if (!a) return NextResponse.json({ error: "חשבון לא נמצא" }, { status: 404 });
  return NextResponse.json({
    _id: a._id,
    name: a.name,
    phone: a.phone,
    active: a.active,
    targetFollowers: a.targetFollowers,
    createdAt: a.createdAt,
    waStatus: getStatus(id),
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const key of ["name", "targetFollowers", "videoResolution", "tags", "internalNotes", "active"]) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  const account = await updateBtbAccount(id, update);
  if (!account) return NextResponse.json({ error: "חשבון לא נמצא" }, { status: 404 });
  return NextResponse.json(account);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "btb.delete", id);
  resetBtbSession(id);
  await Promise.all([deleteBtbAccount(id), deleteBtbAccountData(id)]);
  return NextResponse.json({ ok: true });
}
