/**
 * GET/POST /api/wre/clients — WRE (real-estate capture) client accounts.
 * Mirrors the WTA clients route: an always-on socket per client.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listWreClients, createWreClient } from "@/modules/wre/repository";
import { connect, getStatus } from "@/modules/wre/manager";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;

  const clients = await listWreClients();
  return NextResponse.json(
    clients.map((c) => ({
      _id: c._id,
      name: c.name,
      phone: c.phone,
      active: c.active,
      waStatus: getStatus(c._id.toString()),
      createdAt: c.createdAt,
      planType: c.planType,
      planPrice: c.planPrice,
      billingStatus: c.billingStatus,
      nextBillingDate: c.nextBillingDate,
      contractEmail: c.contractEmail,
      tags: c.tags,
      internalNotes: c.internalNotes,
      watchedGroups: c.watchedGroups,
      minConfidence: c.minConfidence,
      minTextLength: c.minTextLength,
      dedupEnabled: c.dedupEnabled,
      dedupWindowHours: c.dedupWindowHours,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
  if (!body.name || !body.phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });

  const client = await createWreClient(body.name, body.phone);
  // Bring the always-on socket up right away so a QR is available to scan.
  void connect(client._id.toString());
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wre.client.create", client._id.toString(), {
    name: body.name,
    phone: body.phone,
  });

  return NextResponse.json({ _id: client._id, name: body.name, phone: body.phone, waStatus: "connecting" }, { status: 201 });
}
