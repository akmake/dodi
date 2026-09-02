/**
 * GET /api/wtm/logs/file — download the raw engine log file.
 * Port of `logRoutes.js` GET '/file'.
 */
import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import { authorize } from "@/core/http";
import { logger } from "@/modules/wa-engine/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const filePath = logger.logFile();
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "אין קובץ לוג" }, { status: 404 });
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="app.log"' },
  });
}
