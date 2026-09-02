/**
 * Knowledge Base sources ([קטגוריה 12]).
 *   GET  → list sources.
 *   POST → add a source { type, title, text, uri?, url?, lang? } (chunked + indexed).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { addSource, listSources, type AddSourceInput } from "@/modules/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  try {
    return NextResponse.json({ items: await listSources(tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const body = (await req.json().catch(() => ({}))) as Partial<AddSourceInput>;
  if (!body.title?.trim() || !body.text?.trim()) {
    return NextResponse.json({ error: "title and text are required" }, { status: 400 });
  }
  try {
    const result = await addSource(tenantId, {
      type: body.type ?? "snippet",
      title: body.title,
      text: body.text,
      uri: body.uri,
      url: body.url,
      lang: body.lang,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
