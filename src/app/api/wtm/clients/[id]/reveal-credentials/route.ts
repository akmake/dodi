/**
 * POST /api/wtm/clients/:id/reveal-credentials — exposes the plaintext bridge
 * email password, audit-logged. Port of `tenantRoutes.js`'s
 * `/reveal-credentials` (legacy also rate-limited it 15/hour — bootWhat's
 * global API rate limiter, if configured, should cover this route too).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWtmClient } from "@/modules/wtm/repository";
import { decrypt } from "@/modules/wa-engine/legacyCrypto";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  if (!body.reason?.trim()) return NextResponse.json({ error: "יש לספק סיבה לחשיפת הסיסמה" }, { status: 400 });

  const client = await getWtmClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  if (!client.bridgeEmailPassword) return NextResponse.json({ error: "לא הוגדרה סיסמה ללקוח זה" }, { status: 404 });

  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "credential.reveal", id, {
    reason: body.reason.trim(),
    bridgeEmail: client.bridgeEmail,
  });

  return NextResponse.json({ bridgeEmail: client.bridgeEmail, bridgeEmailPassword: decrypt(client.bridgeEmailPassword) });
}
