/**
 * Product catalog ([קטגוריה 20] §20.1).
 *   GET  /api/ecommerce/products  → list
 *   POST /api/ecommerce/products  → upsert one product, OR bulk sync:
 *        { retailerId, title, price, currency, ... }
 *        { sync: [ ...ProductInput ], source: "shopify" }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  listProducts,
  upsertProduct,
  syncProducts,
  type ProductInput,
  type ProductSource,
} from "@/modules/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listProducts(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as
    | ProductInput
    | { sync: ProductInput[]; source?: ProductSource };

  try {
    if ("sync" in body && Array.isArray(body.sync)) {
      const count = await syncProducts(auth.tenantId, body.sync, body.source ?? "manual");
      return NextResponse.json({ synced: count });
    }
    const p = body as ProductInput;
    if (!p.retailerId || !p.title || typeof p.price !== "number" || !p.currency) {
      return NextResponse.json(
        { error: "retailerId, title, price, currency are required" },
        { status: 400 }
      );
    }
    return NextResponse.json(await upsertProduct(auth.tenantId, p), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
