/**
 * AI Flow Architect — table provisioning ([קטגוריה 27] + [28]).
 *
 *   POST { collections: ArchitectCollection[] } → creates any tables the AI's
 *   flow needs that don't exist yet (+ seeds their starter rows), idempotently.
 *
 * This is what makes "the AI builds the table too" real: the architect declares
 * the collections; this endpoint, called on apply, brings them into being so the
 * flow's `data` nodes resolve instead of erroring at runtime.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createCollection, insertRecord, listCollections, type FieldDef } from "@/modules/data";
import type { ArchitectCollection } from "@/modules/flow-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD_TYPES = new Set<FieldDef["type"]>(["text", "number", "boolean", "date", "datetime", "select"]);

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as { collections?: ArchitectCollection[] } | null;
  const incoming = Array.isArray(body?.collections) ? body!.collections : [];
  if (!incoming.length) return NextResponse.json({ created: [], skipped: [], seeded: 0 });

  try {
    const existing = new Set((await listCollections(auth.tenantId)).map((c) => c.name));
    const created: string[] = [];
    const skipped: string[] = [];
    let seeded = 0;

    for (const c of incoming) {
      const name = (c?.name ?? "").trim();
      if (!name) continue;
      if (existing.has(name)) { skipped.push(name); continue; }

      const fields: FieldDef[] = (c.fields ?? [])
        .filter((f) => f?.key?.trim())
        .map((f) => ({
          key: f.key.trim(),
          label: f.label?.trim() || f.key.trim(),
          type: FIELD_TYPES.has(f.type as FieldDef["type"]) ? (f.type as FieldDef["type"]) : "text",
          options: f.type === "select" && Array.isArray(f.options) ? f.options : undefined,
          required: !!f.required,
        }));

      // "write" so the AI agent can also read/write these rows as a tool ([28]→[10]).
      const col = await createCollection(auth.tenantId, { name, label: c.label?.trim() || name, fields, aiAccess: "write" });
      created.push(name);
      existing.add(name);

      for (const row of c.seedRows ?? []) {
        if (row && typeof row === "object") {
          try { await insertRecord(auth.tenantId, col.id, row as Record<string, unknown>); seeded++; }
          catch { /* skip a malformed seed row, keep going */ }
        }
      }
    }

    return NextResponse.json({ created, skipped, seeded });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
