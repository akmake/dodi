import { NextResponse, type NextRequest } from "next/server";
import { listRecentStatusPosts } from "@/modules/btb/repository";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50"), 200);
  return NextResponse.json(await listRecentStatusPosts(id, limit));
}
