/**
 * A single message template ([קטגוריה 19]).
 *   GET    → the template (with version history).
 *   PATCH  → edit a draft { category?, components? } | { action: "submit" } to Meta.
 *   DELETE → remove the local template.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  deleteTemplate,
  getTemplate,
  submitToMeta,
  updateTemplate,
  type TemplateInput,
} from "@/modules/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const t = await getTemplate(auth.tenantId, id);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string } & Partial<TemplateInput>;
  try {
    if (body.action === "submit") {
      const t = await submitToMeta(auth.tenantId, id);
      if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(t);
    }
    const t = await updateTemplate(auth.tenantId, id, body);
    if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(t);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  await deleteTemplate(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
