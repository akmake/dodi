/**
 * AI agent config versions ([קטגוריה 24.5]).
 *   GET  → list versions (newest first).
 *   POST → create a new version { label, systemPrompt }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createConfigVersion, listConfigVersions } from "@/modules/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listConfigVersions(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { label?: string; systemPrompt?: string };
  if (!body.label?.trim()) return NextResponse.json({ error: "missing label" }, { status: 400 });
  const config = await createConfigVersion(auth.tenantId, { label: body.label.trim(), systemPrompt: body.systemPrompt ?? "" });
  return NextResponse.json(config, { status: 201 });
}
