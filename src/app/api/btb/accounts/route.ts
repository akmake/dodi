/**
 * GET/POST /api/btb/accounts — BTB (status marketing) accounts.
 * Port of `Whatsapp/server/routes/btbRoutes.js` GET '/' and POST '/'.
 *
 * NOTE: the legacy restricted-customer login (`role:'client'`, sees only their
 * own linked account) isn't wired up yet — bootWhat's `admin` User model has no
 * equivalent of `btbAccountId` yet. Everything here requires `btb.manage`
 * (internal staff) until that's added; see the session's final summary.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listBtbAccounts, createBtbAccount } from "@/modules/btb/repository";
import { getStatus, connect } from "@/modules/btb/statusManager";
import { audit } from "@/modules/wa-engine/auditLog";
import { resolveBtbAccess } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;

  let accounts = await listBtbAccounts();
  // A BTB customer sees only the accounts assigned to them ("10 numbers" case).
  if (access.scope === "own") {
    const allowed = new Set(access.accountIds);
    accounts = accounts.filter((a) => allowed.has(a._id.toString()));
  }
  return NextResponse.json(
    accounts.map((a) => ({
      _id: a._id,
      name: a.name,
      phone: a.phone,
      active: a.active,
      targetFollowers: a.targetFollowers,
      videoResolution: a.videoResolution,
      tags: a.tags,
      internalNotes: a.internalNotes,
      createdAt: a.createdAt,
      waStatus: getStatus(a._id.toString()),
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
  if (!body.name || !body.phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });

  const account = await createBtbAccount(body.name, body.phone);
  await connect(account._id.toString());
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "btb.create", account._id.toString(), {
    name: body.name,
    phone: body.phone,
  });

  return NextResponse.json({ _id: account._id, name: body.name, phone: body.phone, waStatus: "connecting" }, { status: 201 });
}
