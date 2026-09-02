import { NextResponse, type NextRequest } from "next/server";
import { topViewers } from "@/modules/btb/repository";
import { resolveViewer } from "@/modules/btb/statusManager";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "1000"), 5000);

  const viewers = await topViewers(id, limit);
  return NextResponse.json(
    viewers.map((v) => {
      const { phone, name, pushName } = resolveViewer(id, v._id);
      return { viewerJid: v._id, phone, name, pushName, statusesViewed: v.statusesViewed, firstViewedAt: v.firstViewedAt, lastViewedAt: v.lastViewedAt };
    })
  );
}
