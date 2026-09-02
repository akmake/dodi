/**
 * Public REST API — send a template message ([קטגוריה 22] §22.3).
 *
 *   POST /api/v1/messages/template
 *   Authorization: Bearer {API_KEY}
 *   { "to": "+972500000000", "template_name": "order_update",
 *     "language": "he", "parameters": { "1": "דנה", "2": "#1234" } }
 *
 * Authenticated by API key (not a session). The key must carry the
 * `campaigns.send` scope. Versioned under /v1; this is the seam other public
 * endpoints (contacts, segments, campaigns) extend.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "@/modules/integrations";
import { sendTemplateMessage } from "@/modules/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

/** Normalize `parameters` (object keyed by position, or array) to an ordered list. */
function toVariables(params: unknown): string[] {
  if (Array.isArray(params)) return params.map(String);
  if (params && typeof params === "object") {
    return Object.entries(params as Record<string, unknown>)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => String(v));
  }
  return [];
}

export async function POST(req: NextRequest) {
  const ctx = await authenticate(bearer(req));
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.scopes.includes("campaigns.send")) {
    return NextResponse.json({ error: "forbidden", required: "campaigns.send" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    template_name?: string;
    language?: string;
    parameters?: unknown;
  };
  if (!body.to || !body.template_name || !body.language) {
    return NextResponse.json(
      { error: "to, template_name and language are required" },
      { status: 400 }
    );
  }

  try {
    const waId = body.to.replace(/[^\d]/g, "");
    const message = await sendTemplateMessage(
      ctx.tenantId,
      waId,
      body.template_name,
      body.language,
      toVariables(body.parameters)
    );
    return NextResponse.json({ id: message.id, status: "sent" }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
