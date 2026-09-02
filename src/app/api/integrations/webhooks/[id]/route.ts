/**
 * A single webhook subscription ([קטגוריה 22] §22.2).
 *   PATCH  /api/integrations/webhooks/[id]  { targetUrl?, events?, active? }
 *   DELETE /api/integrations/webhooks/[id]
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { updateSubscription, deleteSubscription } from "@/modules/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    targetUrl?: string;
    events?: string[];
    active?: boolean;
  };
  try {
    const updated = await updateSubscription(auth.tenantId, id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json({ deleted: await deleteSubscription(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
