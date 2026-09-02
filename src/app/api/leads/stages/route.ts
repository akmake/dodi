/**
 * Pipeline stages ([קטגוריה 21] §21.3).
 *   GET  /api/leads/stages   → ordered funnel (seeds defaults on first call)
 *   POST /api/leads/stages   → add a stage { name, order?, isWon?, isLost? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { ensureDefaultPipeline, createStage } from "@/modules/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await ensureDefaultPipeline(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    order?: number;
    isWon?: boolean;
    isLost?: boolean;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createStage(auth.tenantId, {
        name: body.name,
        order: body.order,
        isWon: body.isWon,
        isLost: body.isLost,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
