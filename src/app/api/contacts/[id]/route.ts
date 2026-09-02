/**
 * Single contact ([קטגוריה 4]).
 *   GET   → the contact card.
 *   PATCH → update fields / tags (body: partial Contact, or {action:"addTag"|"removeTag", tag}).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { addTag, getContact, removeTag, updateContact } from "@/modules/contacts";
import type { Contact } from "@/modules/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const { id } = await ctx.params;
  const contact = await getContact(tenantId, id);
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    if (body.action === "addTag") {
      return NextResponse.json(await addTag(tenantId, id, body.tag as string));
    }
    if (body.action === "removeTag") {
      return NextResponse.json(await removeTag(tenantId, id, body.tag as string));
    }
    // Whitelist updatable fields — never let the client set id/tenantId/timestamps.
    const allowed: (keyof Contact)[] = [
      "firstName",
      "lastName",
      "email",
      "language",
      "leadSource",
      "status",
      "funnelStage",
      "ownerId",
      "teamId",
      "tags",
      "customFields",
      "marketingOptIn",
    ];
    const patch: Partial<Contact> = {};
    for (const key of allowed) {
      if (key in body) (patch as Record<string, unknown>)[key] = body[key];
    }
    return NextResponse.json(await updateContact(tenantId, id, patch));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
