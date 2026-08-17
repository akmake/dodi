/**
 * GET/PATCH(PUT)/DELETE /api/wre/clients/:id — action-based updates
 * (info / plan / groups / capture / active), matching the WTA client route's shape.
 */
import { NextResponse, type NextRequest } from "next/server";
import { updateWreClient, deleteWreClient, getWreClient } from "@/modules/wre/repository";
import { authorize } from "@/core/http";
import { connect, disconnect, reset } from "@/modules/wre/manager";
import { audit } from "@/modules/wa-engine/auditLog";
import type { WreWatchedGroup } from "@/modules/wre/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (action === "info") {
    const { name, phone } = body as { name?: string; phone?: string };
    if (!name || !phone) return NextResponse.json({ error: "שם ומספר טלפון הם חובה" }, { status: 400 });
    const client = await updateWreClient(id, { name, phone });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wre.client.update.info", id, { name, phone });
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

    const client = await updateWreClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wre.client.update.plan", id, { planType, billingStatus });
    return NextResponse.json({ ok: true });
  }

  if (action === "groups") {
    const { watchedGroups } = body as { watchedGroups?: WreWatchedGroup[] };
    if (!Array.isArray(watchedGroups)) return NextResponse.json({ error: "watchedGroups חסר" }, { status: 400 });

    // Normalize here so the listener can trust the shape (it runs per message).
    const clean: WreWatchedGroup[] = watchedGroups.map((g) => ({
      groupId: String(g.groupId ?? "").replace("@g.us", "").replace(/:\d+$/, ""),
      groupName: String(g.groupName ?? ""),
      enabled: !!g.enabled,
      defaultCity: String(g.defaultCity ?? "").trim(),
      hint: String(g.hint ?? "").trim().slice(0, 500),
    }));

    const client = await updateWreClient(id, { watchedGroups: clean });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wre.client.update.groups", id, { count: clean.length });
    return NextResponse.json({ ok: true });
  }

  if (action === "queryAccess") {
    const { allowedQueryPhones } = body as { allowedQueryPhones?: unknown[] };
    if (!Array.isArray(allowedQueryPhones)) return NextResponse.json({ error: "allowedQueryPhones חסר" }, { status: 400 });

    // Local IL mobile only — this is what `isAllowedQueryPhone` compares against.
    const clean = Array.from(
      new Set(
        allowedQueryPhones
          .map((p) => String(p ?? "").replace(/\D/g, ""))
          .map((p) => (p.startsWith("972") ? `0${p.slice(3)}` : p))
          .filter((p) => /^05\d{8}$/.test(p))
      )
    );

    const client = await updateWreClient(id, { allowedQueryPhones: clean });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wre.client.update.queryAccess", id, { count: clean.length });
    return NextResponse.json({ ok: true, allowedQueryPhones: clean });
  }

  if (action === "capture") {
    const update: Record<string, unknown> = {};
    if (body.minConfidence !== undefined) update.minConfidence = clampNum(body.minConfidence, 0, 1, 0.5);
    if (body.minTextLength !== undefined) update.minTextLength = clampNum(body.minTextLength, 0, 500, 25);
    if (body.dedupEnabled !== undefined) update.dedupEnabled = !!body.dedupEnabled;
    if (body.dedupWindowHours !== undefined) update.dedupWindowHours = clampNum(body.dedupWindowHours, 1, 8760, 72);

    const client = await updateWreClient(id, update);
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    await audit(undefined, ip, "wre.client.update.capture", id, update);
    return NextResponse.json({ ok: true });
  }

  if (action === "active") {
    const active = !!body.active;
    const client = await updateWreClient(id, { active });
    if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    if (active) void connect(id);
    else disconnect(id);
    await audit(undefined, ip, "wre.client.update.active", id, { active });
    return NextResponse.json({ ok: true, active });
  }

  return NextResponse.json({ error: "action לא תקין" }, { status: 400 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wre.client.delete", id);
  reset(id); // stop the socket + wipe its session files
  await deleteWreClient(id);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const client = await getWreClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  return NextResponse.json(client);
}

export const PUT = PATCH;
