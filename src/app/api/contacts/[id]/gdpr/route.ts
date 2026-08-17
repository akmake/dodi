/**
 * POST /api/contacts/{id}/gdpr — anonymize or delete a contact.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { anonymizeContact, deleteContactGdpr } from "@/modules/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: "anonymize" | "delete" };
  if (body.action === "delete") return NextResponse.json({ deleted: await deleteContactGdpr(auth.tenantId, id) });
  return NextResponse.json({ contact: await anonymizeContact(auth.tenantId, id) });
}
