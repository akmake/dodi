/**
 * POST /api/contacts/import — CSV import.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { importContactsCsv } from "@/modules/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const csv = await req.text();
  return NextResponse.json(await importContactsCsv(auth.tenantId, csv));
}
