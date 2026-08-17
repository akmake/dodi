/**
 * Call log ([קטגוריה 26]). GET → recent call sessions.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listCalls } from "@/modules/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listCalls(auth.tenantId) });
}
