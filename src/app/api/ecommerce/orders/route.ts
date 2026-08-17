/**
 * Orders ([קטגוריה 20] §20.3).
 *   GET  /api/ecommerce/orders?status=  → list
 *   POST /api/ecommerce/orders  { contactId?, conversationId?, catalogId?, items:[...], notes? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createOrder, listOrders, type CreateOrderInput, type OrderStatus } from "@/modules/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  const status = (req.nextUrl.searchParams.get("status") as OrderStatus | null) ?? undefined;
  try {
    return NextResponse.json({ items: await listOrders(auth.tenantId, status) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CreateOrderInput>;
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items[] is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createOrder(auth.tenantId, {
        contactId: body.contactId,
        conversationId: body.conversationId,
        catalogId: body.catalogId,
        items: body.items,
        notes: body.notes,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
