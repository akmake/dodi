/**
 * POST /api/campaigns/{id}/send — execute a campaign now ([קטגוריה 18]).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { send } from "@/modules/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ stats: await send(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
