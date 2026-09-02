/**
 * A single appointment resource ([קטגוריה 13]).
 *   GET    → the resource (with upcoming free slots preview).
 *   PUT    → update { name?, slotMinutes?, workingHours?, active? }.
 *   DELETE → remove the resource (cancels its future appointments).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  availableSlots,
  deleteResource,
  getResource,
  updateResource,
  type WorkingWindow,
} from "@/modules/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const resource = await getResource(auth.tenantId, id);
  if (!resource) return NextResponse.json({ error: "not found" }, { status: 404 });
  const slots = await availableSlots(auth.tenantId, id, { days: 14, limit: 12 });
  return NextResponse.json({ resource, slots });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    slotMinutes?: number;
    workingHours?: WorkingWindow[];
    active?: boolean;
  };
  try {
    const resource = await updateResource(auth.tenantId, id, body);
    if (!resource) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, resource });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteResource(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
