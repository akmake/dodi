/**
 * GET/PATCH(PUT)/DELETE /api/wta/clients/:id — action-based updates
 * (info / plan / groups / active), matching the WTM client route's shape.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { updateWtaClient, deleteWtaClient, getWtaClient } from "@/modules/wta/repository";
import { connect, disconnect, reset } from "@/modules/wta/manager";
import { audit } from "@/modules/wa-engine/auditLog";
import type { WtaManagedGroup } from "@/modules/wta/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (action === "info") {
    const { name, phone } = body as { name?: string; phone?: string };
    if (!name || !phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });
    const client = await updateWtaClient(id, { name, phone });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wta.client.update.info", id, { name, phone });
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

    const client = await updateWtaClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wta.client.update.plan", id, { planType, billingStatus });
    return NextResponse.json({ ok: true });
  }

  if (action === "groups") {
    const { managedGroups, exemptAdmins, logMessages } = body as {
      managedGroups?: WtaManagedGroup[];
      exemptAdmins?: boolean;
      logMessages?: boolean;
    };
    const update: Record<string, unknown> = {};
    if (managedGroups !== undefined) update.managedGroups = managedGroups;
    if (exemptAdmins !== undefined) update.exemptAdmins = exemptAdmins;
    if (logMessages !== undefined) update.logMessages = logMessages;

    const client = await updateWtaClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wta.client.update.groups", id, { count: managedGroups?.length });
    return NextResponse.json({ ok: true });
  }

  if (action === "active") {
    const active = !!body.active;
    const client = await updateWtaClient(id, { active });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    if (active) void connect(id);
    else disconnect(id);
    await audit(undefined, ip, "wta.client.update.active", id, { active });
    return NextResponse.json({ ok: true, active });
  }

  return NextResponse.json({ error: "action לא תקין" }, { status: 400 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wta.client.delete", id);
  reset(id); // stop the socket + wipe its session files
  await deleteWtaClient(id);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWtaClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  return NextResponse.json(client);
}

export const PUT = PATCH;
