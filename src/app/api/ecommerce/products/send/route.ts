/**
 * Send a product / multi-product message ([קטגוריה 20] §20.2).
 *   POST /api/ecommerce/products/send
 *     { to, retailerId, body? }                                  → single product
 *     { to, header, body, catalogId, sections:[{title, productRetailerIds}] } → list
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { sendProductMessage, sendCatalogMessage } from "@/modules/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    retailerId?: string;
    body?: string;
    header?: string;
    catalogId?: string;
    sections?: { title: string; productRetailerIds: string[] }[];
  };
  if (!body.to) return NextResponse.json({ error: "to is required" }, { status: 400 });

  try {
    if (Array.isArray(body.sections) && body.catalogId) {
      const msg = await sendCatalogMessage(auth.tenantId, body.to, {
        header: body.header ?? "מומלצים",
        body: body.body ?? "בחר מוצר",
        catalogId: body.catalogId,
        sections: body.sections,
      });
      return NextResponse.json({ id: msg.id, status: "sent" }, { status: 201 });
    }
    if (!body.retailerId) {
      return NextResponse.json({ error: "retailerId or sections+catalogId required" }, { status: 400 });
    }
    const msg = await sendProductMessage(auth.tenantId, body.to, body.retailerId, body.body);
    return NextResponse.json({ id: msg.id, status: "sent" }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
