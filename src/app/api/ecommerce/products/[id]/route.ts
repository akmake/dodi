/**
 * A single product ([קטגוריה 20] §20.1).
 *   GET    /api/ecommerce/products/[id]
 *   DELETE /api/ecommerce/products/[id]
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getProduct, deleteProduct } from "@/modules/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const product = await getProduct(auth.tenantId, id);
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json({ deleted: await deleteProduct(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
