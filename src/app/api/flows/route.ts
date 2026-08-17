/**
 * Flow Builder persistence ([קטגוריה 8]).
 *
 * Replaces the legacy in-memory `pages/api/flows`: flows now persist to the DB
 * in the new Flow model and are executed by the new engine via the pipeline.
 * Accepts/returns the visual builder's wire shape unchanged.
 *
 *   GET    → list flows (builder shape).
 *   POST   → upsert a flow (body: BuilderFlow).
 *   DELETE → ?id=...
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { deleteFlow, listBuilderFlows, saveBuilderFlow, type BuilderFlow } from "@/modules/flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  try {
    return NextResponse.json({ flows: await listBuilderFlows(tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const flow = (await req.json().catch(() => null)) as BuilderFlow | null;
  if (!flow?.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    const saved = await saveBuilderFlow(tenantId, flow);
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    await deleteFlow(tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
