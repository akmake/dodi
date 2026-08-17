/**
 * Billing — plan, usage & quotas ([קטגוריה 25.6]).
 *   GET  → { summary, plans } — current plan, period usage vs limits, and the catalog.
 *   POST → { plan } change the active plan.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { billingSummary, planCatalog, setPlan, type PlanId } from "@/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ summary: await billingSummary(auth.tenantId), plans: planCatalog() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { plan?: PlanId };
  if (!body.plan) return NextResponse.json({ error: "missing plan" }, { status: 400 });
  try {
    const sub = await setPlan(auth.tenantId, body.plan);
    return NextResponse.json(sub);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
