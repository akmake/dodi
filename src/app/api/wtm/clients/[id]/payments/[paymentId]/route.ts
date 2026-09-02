import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { deletePayment } from "@/modules/wtm/repository";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; paymentId: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, paymentId } = await ctx.params;
  const ok = await deletePayment(id, paymentId);
  if (!ok) return NextResponse.json({ error: "תשלום לא נמצא" }, { status: 404 });
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "payment.delete", id);
  return NextResponse.json({ ok: true });
}
