/**
 * GET/POST /api/wtm/clients — WTM (WhatsApp↔email bridge) client accounts.
 * Port of `Whatsapp/server/routes/tenantRoutes.js` GET '/' and POST '/'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listWtmClients, createWtmClient } from "@/modules/wtm/repository";
import { getAllStatuses } from "@/modules/wa-engine/whatsappManager";
import { getBridgeStats } from "@/modules/wtm/emailBridgeManager";
import { poolAdd } from "@/modules/wtm/tenantPool";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const clients = await listWtmClients();
  const waStatuses = getAllStatuses();

  return NextResponse.json(
    clients.map((t) => ({
      _id: t._id,
      name: t.name,
      phone: t.phone,
      bridgeEmail: t.bridgeEmail,
      destinationEmail: t.destinationEmail,
      active: t.active,
      waStatus: waStatuses[t._id.toString()] || "disconnected",
      bridge: getBridgeStats(t._id.toString()),
      createdAt: t.createdAt,
      planType: t.planType,
      planPrice: t.planPrice,
      billingStatus: t.billingStatus,
      nextBillingDate: t.nextBillingDate,
      contractEmail: t.contractEmail,
      tags: t.tags,
      internalNotes: t.internalNotes,
      emailSignature: t.emailSignature,
      groupsEnabled: t.groupsEnabled,
      allowedGroups: t.allowedGroups,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
  if (!body.name || !body.phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });

  const client = await createWtmClient(body.name, body.phone);
  poolAdd(client._id.toString(), client);
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "tenant.create", client._id.toString(), {
    name: body.name,
    phone: body.phone,
  });

  return NextResponse.json({ _id: client._id, name: body.name, phone: body.phone, waStatus: "sleeping" }, { status: 201 });
}
