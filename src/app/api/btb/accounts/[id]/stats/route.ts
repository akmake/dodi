import { NextResponse, type NextRequest } from "next/server";
import { getBtbAccount, countStatusPosts, countUniqueViewers, countStatusViews } from "@/modules/btb/repository";
import { getStatus } from "@/modules/btb/statusManager";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;

  const [account, totalStatuses, uniqueViewers, totalViews] = await Promise.all([
    getBtbAccount(id),
    countStatusPosts(id),
    countUniqueViewers(id),
    countStatusViews(id),
  ]);
  if (!account) return NextResponse.json({ error: "חשבון לא נמצא" }, { status: 404 });

  return NextResponse.json({
    totalStatuses,
    uniqueViewers,
    totalViews,
    targetFollowers: account.targetFollowers,
    targetReached: uniqueViewers >= account.targetFollowers,
    waStatus: getStatus(id),
  });
}
