/**
 * PATCH/DELETE /api/wtm/clients/:id — port of `tenantRoutes.js` PUT
 * /info,/plan,/email-config,/groups (unified behind body.action) and DELETE /:id.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { updateWtmClient, deleteWtmClient, getWtmClient } from "@/modules/wtm/repository";
import { poolUpdateTenant, poolRemove } from "@/modules/wtm/tenantPool";
import { encrypt, decrypt } from "@/modules/wa-engine/legacyCrypto";
import { invalidateTransporter } from "@/modules/wtm/emailRenderer";
import { startBridge, stopBridge, testImapConnection } from "@/modules/wtm/emailBridgeManager";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// The ported client (from the axios-based original) issues PUT for these
// action-based updates; alias PUT to the PATCH handler so both verbs work.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (action === "info") {
    const { name, phone } = body as { name?: string; phone?: string };
    if (!name || !phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });
    const client = await updateWtmClient(id, { name, phone });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    poolUpdateTenant(id, client);
    await audit(undefined, ip, "tenant.update.info", id, { name, phone });
    return NextResponse.json({ ok: true, name: client.name, phone: client.phone });
  }

  if (action === "plan") {
    const { planType, planPrice, billingStatus, nextBillingDate, contractEmail, tags, internalNotes } = body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (planType !== undefined) update.planType = planType;
    if (planPrice !== undefined) update.planPrice = parseFloat(String(planPrice)) || 0;
    if (billingStatus !== undefined) update.billingStatus = billingStatus;
    if (nextBillingDate !== undefined) update.nextBillingDate = nextBillingDate ? new Date(String(nextBillingDate)) : null;
    if (contractEmail !== undefined) update.contractEmail = contractEmail;
    if (tags !== undefined) update.tags = tags;
    if (internalNotes !== undefined) update.internalNotes = internalNotes;

    const client = await updateWtmClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    poolUpdateTenant(id, client);
    await audit(undefined, ip, "tenant.update.plan", id, { planType, billingStatus });
    return NextResponse.json({ ok: true });
  }

  if (action === "email-config") {
    const { bridgeEmail, bridgeEmailPassword, destinationEmail, emailSignature } = body as {
      bridgeEmail?: string;
      bridgeEmailPassword?: string;
      destinationEmail?: string;
      emailSignature?: string;
    };
    if (!bridgeEmail || !destinationEmail) return NextResponse.json({ error: "כתובות המייל הן חובה" }, { status: 400 });

    const update: Record<string, unknown> = { bridgeEmail, destinationEmail, emailSignature: emailSignature || "" };
    if (bridgeEmailPassword) update.bridgeEmailPassword = encrypt(bridgeEmailPassword);

    const client = await updateWtmClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

    poolUpdateTenant(id, client);
    invalidateTransporter(id);

    const plaintextPassword = bridgeEmailPassword || decrypt(client.bridgeEmailPassword);
    stopBridge(id);
    const test = await testImapConnection(client.bridgeEmail, plaintextPassword);
    if (test.ok) await startBridge(id, client);

    await audit(undefined, ip, "tenant.update.email", id, { bridgeEmail });
    return NextResponse.json({
      ok: true,
      imapOk: test.ok,
      imapError: test.ok ? null : test.error,
      bridgeEmail: client.bridgeEmail,
      destinationEmail: client.destinationEmail,
    });
  }

  if (action === "groups") {
    const { groupsEnabled, allowedGroups } = body as { groupsEnabled?: boolean; allowedGroups?: { groupId: string; groupName: string }[] };
    const update: Record<string, unknown> = {};
    if (groupsEnabled !== undefined) update.groupsEnabled = groupsEnabled;
    if (allowedGroups !== undefined) update.allowedGroups = allowedGroups;

    const client = await updateWtmClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    poolUpdateTenant(id, client);
    await audit(undefined, ip, "tenant.update.groups", id, { groupsEnabled, count: allowedGroups?.length });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action לא תקין" }, { status: 400 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "tenant.delete", id);
  poolRemove(id);
  await deleteWtmClient(id);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWtmClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  const { bridgeEmailPassword: _pw, ...safe } = client;
  void _pw;
  return NextResponse.json(safe);
}

export const PUT = PATCH;
