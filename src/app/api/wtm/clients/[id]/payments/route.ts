// Port of Whatsapp/server/routes/paymentRoutes.js (GET '/', POST '/')
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listPayments, createPayment } from "@/modules/wtm/repository";
import { audit } from "@/modules/wa-engine/auditLog";
import type { PaymentMethod } from "@/modules/wtm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  return NextResponse.json(await listPayments(id));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { amount?: number | string; method?: string; period?: string; paidAt?: string; notes?: string };
  if (!body.amount || Number(body.amount) <= 0) return NextResponse.json({ error: "סכום לא תקין" }, { status: 400 });

  const payment = await createPayment(
    id,
    Number(body.amount),
    (body.method as PaymentMethod) || "other",
    body.period || "",
    body.paidAt ? new Date(body.paidAt) : new Date(),
    body.notes || "",
    ""
  );
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "payment.add", id, { amount: Number(body.amount), method: body.method, period: body.period });
  return NextResponse.json(payment, { status: 201 });
}
