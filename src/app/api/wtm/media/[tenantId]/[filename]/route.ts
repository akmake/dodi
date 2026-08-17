/**
 * GET /api/wtm/media/:tenantId/:filename — serves saved WhatsApp media
 * referenced from the bridge emails (`emailRenderer.ts`'s `mediaBlock` links).
 * Intentionally NOT behind `authorize()` — like the legacy `mediaRoutes.js`
 * (mounted without `protect` in `index.js`), because these links are opened
 * from the recipient's email client, not an authenticated dashboard session.
 * `path.basename` on both segments blocks path traversal.
 */
import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { WTM_MEDIA_DIR } from "@/modules/wa-engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ tenantId: string; filename: string }> }) {
  const { tenantId, filename } = await ctx.params;
  const safeTenantId = path.basename(tenantId);
  const safeFilename = path.basename(filename);
  const filePath = path.join(WTM_MEDIA_DIR, safeTenantId, safeFilename);

  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(safeFilename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

  return new NextResponse(buffer, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" } });
}
