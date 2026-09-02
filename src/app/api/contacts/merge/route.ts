/**
 * POST /api/contacts/merge — merge duplicate into primary.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { mergeContacts } from "@/modules/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { primaryId?: string; duplicateId?: string };
  if (!body.primaryId || !body.duplicateId) {
    return NextResponse.json({ error: "primaryId and duplicateId are required" }, { status: 400 });
  }
  return NextResponse.json({ contact: await mergeContacts(auth.tenantId, body.primaryId, body.duplicateId) });
}
