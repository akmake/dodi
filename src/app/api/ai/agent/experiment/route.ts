/**
 * AI agent A/B experiment ([קטגוריה 24.5]).
 *   GET    → the active experiment (or null).
 *   POST   → start an experiment { name, variantAConfigId, variantBConfigId, splitA? }.
 *   DELETE → stop the active experiment (?id=).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createExperiment, getActiveExperiment, stopExperiment } from "@/modules/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ experiment: await getActiveExperiment(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    variantAConfigId?: string;
    variantBConfigId?: string;
    splitA?: number;
  };
  if (!body.name?.trim() || !body.variantAConfigId || !body.variantBConfigId) {
    return NextResponse.json({ error: "name + both variant config ids are required" }, { status: 400 });
  }
  const experiment = await createExperiment(auth.tenantId, {
    name: body.name.trim(),
    variantAConfigId: body.variantAConfigId,
    variantBConfigId: body.variantBConfigId,
    splitA: body.splitA,
  });
  return NextResponse.json(experiment, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const id = req.nextUrl.searchParams.get("id");
  const current = id ? null : await getActiveExperiment(auth.tenantId);
  const target = id ?? current?.id;
  if (!target) return NextResponse.json({ error: "no active experiment" }, { status: 404 });
  await stopExperiment(auth.tenantId, target);
  return NextResponse.json({ ok: true });
}
