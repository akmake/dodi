import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listMessagesByGroup } from "@/modules/wtm/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const groupJid = req.nextUrl.searchParams.get("groupJid");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100");
  if (!groupJid) return NextResponse.json({ error: "נדרש groupJid" }, { status: 400 });
  try {
    const messages = await listMessagesByGroup(id, groupJid, limit);
    return NextResponse.json(messages);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
