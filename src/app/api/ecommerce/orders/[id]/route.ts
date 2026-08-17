/**
 * A single order ([קטגוריה 20] §20.3/§20.4).
 *   GET   /api/ecommerce/orders/[id]
 *   PATCH /api/ecommerce/orders/[id]  { status?, externalOrderId? }  (status=paid → conversion)
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getOrder, updateOrderStatus, type OrderStatus } from "@/modules/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const order = await getOrder(auth.tenantId, id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: OrderStatus;
    externalOrderId?: string;
  };
  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }
  try {
    const updated = await updateOrderStatus(auth.tenantId, id, body.status, body.externalOrderId);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
