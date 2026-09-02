import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getQualityTest } from "@/modules/btb/statusManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ testId: string }> }) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;
  const { testId } = await ctx.params;
  return NextResponse.json(getQualityTest(testId));
}
