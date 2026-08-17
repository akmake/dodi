/**
 * POST /api/btb/accounts/:id/status-test — quality-test job (uploads to self
 * only, never persisted/distributed). Port of `btbRoutes.js` POST '/:id/status-test'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { startQualityTest } from "@/modules/btb/statusManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "btb.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const form = await req.formData();
  const file = form.get("file");
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : undefined;
  if (!buffer) return NextResponse.json({ error: "חסר קובץ" }, { status: 400 });

  const declaredType = String(form.get("type") ?? "");
  const type = declaredType || ((file as File).type?.startsWith("video") ? "video" : "image");
  const videoQuality = form.get("videoQuality") === "optimized" ? "optimized" : "max";

  try {
    const testId = startQualityTest(id, { type: type as "image" | "video", buffer, videoQuality });
    return NextResponse.json({ testId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
