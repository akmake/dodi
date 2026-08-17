/**
 * Revoke an API key ([קטגוריה 22] §22.3) — DELETE /api/integrations/api-keys/[id].
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { revokeApiKey } from "@/modules/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const revoked = await revokeApiKey(auth.tenantId, id);
    if (!revoked) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
