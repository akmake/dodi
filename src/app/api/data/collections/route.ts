/**
 * Data collections ([קטגוריה 28]).
 *   GET  → list tenant collections (with row counts).
 *   POST → create a collection { name, label, description?, fields? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  createCollection,
  listCollections,
  countRecords,
  type CollectionDef,
  type FieldDef,
} from "@/modules/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  try {
    const cols = await listCollections(auth.tenantId);
    const withCounts = await Promise.all(
      cols.map(async (c) => ({ ...c, recordCount: await countRecords(auth.tenantId, c.id) }))
    );
    return NextResponse.json({ collections: withCounts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => null)) as
    | {
        name?: string;
        label?: string;
        description?: string | null;
        fields?: FieldDef[];
        aiAccess?: CollectionDef["aiAccess"];
      }
    | null;
  if (!body?.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  try {
    const created = await createCollection(auth.tenantId, {
      name: body.name,
      label: body.label ?? body.name,
      description: body.description ?? null,
      fields: body.fields ?? [],
      aiAccess: body.aiAccess,
    });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
