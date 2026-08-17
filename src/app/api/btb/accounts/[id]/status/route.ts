/**
 * POST /api/btb/accounts/:id/status — upload a status (image/video/text) as a
 * background job; returns jobId immediately (heavy video processing must not
 * hold the request open). Port of `btbRoutes.js` POST '/:id/status'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { startStatusUpload } from "@/modules/btb/statusManager";
import { resolveBtbAccess, assertBtbAccount } from "@/lib/access/btb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await resolveBtbAccess(req);
  if (access instanceof NextResponse) return access;
  const denied = assertBtbAccount(access, id);
  if (denied) return denied;

  const form = await req.formData();
  const type = String(form.get("type") ?? "");
  const caption = String(form.get("caption") ?? "");
  const bgColor = String(form.get("bgColor") ?? "");
  const fontRaw = form.get("font");
  const videoQuality = form.get("videoQuality") === "optimized" ? "optimized" : "max";
  const file = form.get("file");

  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : undefined;
  if ((type === "image" || type === "video") && !buffer) return NextResponse.json({ error: "חסר קובץ" }, { status: 400 });
  if (type === "text" && !caption) return NextResponse.json({ error: "חסר טקסט" }, { status: 400 });

  try {
    const jobId = startStatusUpload(id, {
      type: type as "image" | "video" | "text",
      buffer,
      caption,
      bgColor,
      font: fontRaw ? parseInt(String(fontRaw)) : undefined,
      videoQuality,
    });
    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
