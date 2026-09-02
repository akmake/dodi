/**
 * Public API keys ([קטגוריה 22] §22.3).
 *   GET  /api/integrations/api-keys  → list (no secrets)
 *   POST /api/integrations/api-keys  { name, scopes[] } → { apiKey, token } (token once)
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createApiKey, listApiKeys } from "@/modules/integrations";
import { SCOPES, type Scope } from "@/modules/admin/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listApiKeys(auth.tenantId), scopes: SCOPES });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { name?: string; scopes?: string[] };
  if (!body.name?.trim() || !Array.isArray(body.scopes) || body.scopes.length === 0) {
    return NextResponse.json({ error: "name and scopes[] are required" }, { status: 400 });
  }
  const scopes = body.scopes.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) {
    return NextResponse.json({ error: "no valid scopes" }, { status: 400 });
  }
  try {
    const { apiKey, token } = await createApiKey(auth.tenantId, {
      name: body.name,
      scopes,
      createdBy: auth.userId,
    });
    return NextResponse.json({ apiKey, token }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
