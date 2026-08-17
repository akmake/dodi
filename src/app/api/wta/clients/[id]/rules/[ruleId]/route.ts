/**
 * PUT/DELETE /api/wta/clients/:id/rules/:ruleId — toggle/edit or remove a rule.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { updateRule, deleteRule } from "@/modules/wta/repository";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

// Fields a client may patch (type/clientId/_id/timestamps are immutable here).
const ALLOWED = new Set([
  "name",
  "enabled",
  "groupIds",
  "words",
  "mode",
  "caseSensitive",
  "onMatch",
  "warnText",
  "schedule",
  "includeInviteLinks",
  "includeAllLinks",
  "allowlist",
  "lockAt",
  "unlockAt",
  "days",
]);

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, ruleId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (ALLOWED.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });

  const rule = await updateRule(id, ruleId, patch);
  if (!rule) return NextResponse.json({ error: "חוק לא נמצא" }, { status: 404 });
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wta.rule.update", id, { ruleId });
  return NextResponse.json(rule);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, ruleId } = await ctx.params;
  const ok = await deleteRule(id, ruleId);
  if (!ok) return NextResponse.json({ error: "חוק לא נמצא" }, { status: 404 });
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wta.rule.delete", id, { ruleId });
  return NextResponse.json({ ok: true });
}
