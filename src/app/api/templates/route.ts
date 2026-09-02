/**
 * Message Templates ([קטגוריה 19]).
 *   GET  → list the local template catalog.
 *   POST → { action: "sync" } pulls templates + statuses from Meta;
 *          otherwise create a local draft { name, language, category, components }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  createTemplate,
  listTemplates,
  syncFromMeta,
  type TemplateInput,
} from "@/modules/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  try {
    return NextResponse.json({ items: await listTemplates(tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "templates.manage");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const body = (await req.json().catch(() => ({}))) as { action?: string } & Partial<TemplateInput>;
  try {
    if (body.action === "sync") {
      return NextResponse.json(await syncFromMeta(tenantId));
    }
    if (body.name && body.language && body.category && Array.isArray(body.components)) {
      const created = await createTemplate(tenantId, {
        name: body.name,
        language: body.language,
        category: body.category,
        components: body.components,
      });
      return NextResponse.json(created);
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
