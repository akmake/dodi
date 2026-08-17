/**
 * GET/POST /api/wta/clients/:id/rules — moderation rules for a WTA client.
 * Wave 2 supports message-triggered rules: keyword_delete + link_delete.
 * (admin_only_schedule is added with the scheduler in Wave 3.)
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listRules, createRule } from "@/modules/wta/repository";
import type { WtaRuleInput, RuleSchedule, OnMatchAction, KeywordMode } from "@/modules/wta/models";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function normalizeSchedule(raw: unknown): RuleSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!s.from || !s.to) return null;
  return { days: Array.isArray(s.days) ? (s.days as number[]) : [], from: String(s.from), to: String(s.to) };
}

const asAction = (v: unknown): OnMatchAction => (v === "warn" || v === "kick" ? v : "delete");

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  return NextResponse.json(await listRules(id));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const type = body.type;
  const name = String(body.name ?? "").trim() || "חוק";
  const groupIds = Array.isArray(body.groupIds) && body.groupIds.length ? (body.groupIds as string[]) : null;
  const enabled = body.enabled !== false;

  let input: WtaRuleInput;
  if (type === "keyword_delete") {
    const words = (Array.isArray(body.words) ? (body.words as string[]) : []).map((w) => String(w).trim()).filter(Boolean);
    if (words.length === 0) return NextResponse.json({ error: "יש להזין לפחות מילה אחת" }, { status: 400 });
    const mode: KeywordMode = body.mode === "exact" || body.mode === "regex" ? body.mode : "contains";
    input = {
      clientId: id,
      type: "keyword_delete",
      name,
      enabled,
      groupIds,
      words,
      mode,
      caseSensitive: !!body.caseSensitive,
      onMatch: asAction(body.onMatch),
      warnText: String(body.warnText ?? ""),
      schedule: normalizeSchedule(body.schedule),
    };
  } else if (type === "link_delete") {
    input = {
      clientId: id,
      type: "link_delete",
      name,
      enabled,
      groupIds,
      includeInviteLinks: body.includeInviteLinks !== false,
      includeAllLinks: !!body.includeAllLinks,
      allowlist: (Array.isArray(body.allowlist) ? (body.allowlist as string[]) : []).map((d) => String(d).trim()).filter(Boolean),
      onMatch: asAction(body.onMatch),
      warnText: String(body.warnText ?? ""),
      schedule: normalizeSchedule(body.schedule),
    };
  } else if (type === "admin_only_schedule") {
    const lockAt = String(body.lockAt ?? "");
    const unlockAt = String(body.unlockAt ?? "");
    if (!/^\d{1,2}:\d{2}$/.test(lockAt) || !/^\d{1,2}:\d{2}$/.test(unlockAt)) {
      return NextResponse.json({ error: "יש להזין שעת נעילה ושעת פתיחה (HH:mm)" }, { status: 400 });
    }
    input = {
      clientId: id,
      type: "admin_only_schedule",
      name,
      enabled,
      groupIds,
      lockAt,
      unlockAt,
      days: Array.isArray(body.days) ? (body.days as number[]) : [],
    };
  } else {
    return NextResponse.json({ error: "סוג חוק לא נתמך" }, { status: 400 });
  }

  const rule = await createRule(input);
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wta.rule.create", id, { type, name });
  return NextResponse.json(rule, { status: 201 });
}
