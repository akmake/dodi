/**
 * Flow version history ([קטגוריה 8]).
 *   GET → list saved versions (metadata only) for a flow, newest first.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listVersions } from "@/modules/flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ versions: await listVersions(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
