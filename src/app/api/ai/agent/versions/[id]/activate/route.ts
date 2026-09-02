/**
 * Activate an AI agent config version ([קטגוריה 24.5]). POST → make it the active one.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { activateConfig } from "@/modules/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const config = await activateConfig(auth.tenantId, id);
  if (!config) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(config);
}
