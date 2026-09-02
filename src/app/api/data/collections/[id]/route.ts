/**
 * A single data collection ([קטגוריה 28]).
 *   GET    → the collection definition.
 *   PATCH  → update { label?, description?, fields? }.
 *   DELETE → drop the collection and all its rows.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  deleteCollection,
  getCollection,
  updateCollection,
  type CollectionDef,
  type FieldDef,
} from "@/modules/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const c = await getCollection(auth.tenantId, id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    description?: string | null;
    fields?: FieldDef[];
    aiAccess?: CollectionDef["aiAccess"];
    readRoles?: string[];
    writeRoles?: string[];
  };
  try {
    const updated = await updateCollection(auth.tenantId, id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteCollection(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
