/**
 * System logs API ([תשתית תצפית]).
 *   GET  ?level=&source=&search=&limit=  → { logs, sources, counts }
 *   DELETE ?before=<ISO>                 → { deleted }  (omit `before` = clear all)
 *
 * Thin controller over `core/logs`. Gated behind `bot.edit` (operator-level),
 * the same permission the skills/flows admin screens use.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  listLogs,
  listLogSources,
  countLogsByLevel,
  clearLogs,
  ensureLogIndexes,
  type LogLevel,
} from "@/core/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS: LogLevel[] = ["error", "warn", "info"];

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const levelParam = sp.get("level");
  const level = LEVELS.includes(levelParam as LogLevel) ? (levelParam as LogLevel) : undefined;
  const source = sp.get("source") || undefined;
  const search = sp.get("search") || undefined;
  const limit = Number(sp.get("limit")) || undefined;

  try {
    await ensureLogIndexes();
    const [logs, sources, counts] = await Promise.all([
      listLogs(auth.tenantId, { level, source, search, limit }),
      listLogSources(auth.tenantId),
      countLogsByLevel(auth.tenantId),
    ]);
    return NextResponse.json({ logs, sources, counts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;

  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : undefined;
  try {
    const deleted = await clearLogs(auth.tenantId, before && !isNaN(+before) ? before : undefined);
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
