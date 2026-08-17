/**
 * GET/POST /api/wta/clients — WTA (WhatsApp group-moderation) client accounts.
 * Mirrors the WTM clients route, but connects each new client's always-on
 * socket instead of adding it to the conveyor pool.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listWtaClients, createWtaClient } from "@/modules/wta/repository";
import { connect, getStatus } from "@/modules/wta/manager";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;

  const clients = await listWtaClients();
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
      managedGroups: c.managedGroups,
      exemptAdmins: c.exemptAdmins,
      logMessages: c.logMessages,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
  if (!body.name || !body.phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });

  const client = await createWtaClient(body.name, body.phone);
  // Bring the always-on socket up right away so a QR is available to scan.
  void connect(client._id.toString());
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wta.client.create", client._id.toString(), {
    name: body.name,
    phone: body.phone,
  });

  return NextResponse.json({ _id: client._id, name: body.name, phone: body.phone, waStatus: "connecting" }, { status: 201 });
}
