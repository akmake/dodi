/**
 * System log store — operational error/event log ([תשתית תצפית]).
 *
 * Pure infrastructure, modeled on `core/jobs.ts`: it imports only the DB layer,
 * so ANYTHING (webhook route, pipeline, drain, any module) can record a problem
 * with `logError`/`logEvent` without forming an import cycle.
 *
 * The whole point is that the live pipeline used to swallow failures into
 * `console.error`, which on Vercel (esp. Hobby) the operator never sees. Every
 * such failure now also lands here, tenant-scoped and queryable from
 * `/dashboard/logs`, so a "the bot disconnected" report has a paper trail.
 *
 * Writes are BEST-EFFORT: `logEvent` never throws and never blocks the caller —
 * a logging failure must not take down the thing it was trying to observe. A TTL
 * index prunes entries after RETENTION_DAYS so the collection can't grow without
 * bound.
 */
import { Repository } from "./db/repository";
import { getDb } from "./db/mongo";
import type { BaseEntity } from "./types";
import type { Filter } from "mongodb";

export type LogLevel = "error" | "warn" | "info";

export interface LogEntry extends BaseEntity {
  /** Severity — drives the UI color and the default filter. */
  level: LogLevel;
  /** Area that produced it: "pipeline" | "webhook" | "job" | "drain" | ... */
  source: string;
  /** Human, Hebrew, short — what went wrong. */
  message: string;
  /** Stack trace or extra technical text (assistant-readable). */
  detail?: string | null;
  /** Structured breadcrumbs: conversationId, contactId, jobId, etc. */
  context?: Record<string, unknown> | null;
}

const COLLECTION = "system_logs";
const RETENTION_DAYS = 14;

export interface LogFilter {
  level?: LogLevel;
  source?: string;
  /** Case-insensitive substring over message + detail. */
  search?: string;
  limit?: number;
}

class LogRepository extends Repository<LogEntry> {
  constructor() {
    super(COLLECTION);
  }

  async listFiltered(tenantId: string, f: LogFilter): Promise<LogEntry[]> {
    const filter: Filter<LogEntry> = {};
    if (f.level) filter.level = f.level;
    if (f.source) filter.source = f.source;
    if (f.search?.trim()) {
      const rx = { $regex: escapeRegex(f.search.trim()), $options: "i" };
      filter.$or = [{ message: rx }, { detail: rx }] as Filter<LogEntry>[];
    }
    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, filter))
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(f.limit ?? 200, 1), 1000))
      .toArray() as Promise<LogEntry[]>;
  }

  async distinctSources(tenantId: string): Promise<string[]> {
    const col = await this.collection();
    const values = (await col.distinct("source", this.scoped(tenantId))) as string[];
    return values.filter(Boolean).sort();
  }

  async countByLevel(tenantId: string): Promise<Record<LogLevel, number>> {
    const col = await this.collection();
    const rows = (await col
      .aggregate([
        { $match: this.scoped(tenantId) },
        { $group: { _id: "$level", n: { $sum: 1 } } },
      ])
      .toArray()) as Array<{ _id: LogLevel; n: number }>;
    const out: Record<LogLevel, number> = { error: 0, warn: 0, info: 0 };
    for (const r of rows) if (r._id in out) out[r._id] = r.n;
    return out;
  }

  async clear(tenantId: string, before?: Date): Promise<number> {
    const filter: Filter<LogEntry> = before ? { createdAt: { $lt: before } } : {};
    const col = await this.collection();
    const res = await col.deleteMany(this.scoped(tenantId, filter));
    return res.deletedCount ?? 0;
  }
}

const repo = new LogRepository();

// ── Write side (best-effort, never throws) ────────────────────────────────
interface LogInput {
  level: LogLevel;
  source: string;
  message: string;
  detail?: string | null;
  context?: Record<string, unknown> | null;
}

/** Fire-and-forget a structured log. Safe to call from any hot path. */
export function logEvent(tenantId: string, input: LogInput): void {
  // Mirror to the process log so local/dev (and Vercel function logs) still work.
  const tag = `[${input.source}] ${input.message}`;
  if (input.level === "error") console.error(tag, input.context ?? "", input.detail ?? "");
  else if (input.level === "warn") console.warn(tag, input.context ?? "");
  else console.info(tag, input.context ?? "");

  void persist(tenantId, input);
}

/** Convenience for catch blocks: derives the stack/detail from the thrown value. */
export function logError(
  tenantId: string,
  source: string,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
): void {
  logEvent(tenantId, {
    level: "error",
    source,
    message,
    detail: error == null ? null : describeError(error),
    context: context ?? null,
  });
}

async function persist(tenantId: string, input: LogInput): Promise<void> {
  try {
    await ensureLogIndexes();
    await repo.create(tenantId, {
      level: input.level,
      source: input.source,
      message: input.message,
      detail: input.detail ?? null,
      context: sanitizeContext(input.context),
    });
  } catch (err) {
    // A logging failure must never escalate — last resort is the process log.
    console.error("[logs] failed to persist log entry", err);
  }
}

// ── Read side (for the API/dashboard) ─────────────────────────────────────
export function listLogs(tenantId: string, filter: LogFilter = {}): Promise<LogEntry[]> {
  return repo.listFiltered(tenantId, filter);
}

export function listLogSources(tenantId: string): Promise<string[]> {
  return repo.distinctSources(tenantId);
}

export function countLogsByLevel(tenantId: string): Promise<Record<LogLevel, number>> {
  return repo.countByLevel(tenantId);
}

export function clearLogs(tenantId: string, before?: Date): Promise<number> {
  return repo.clear(tenantId, before);
}

// ── Indexes (memoized; TTL auto-prunes old entries) ───────────────────────
let indexesReady: Promise<void> | null = null;
export function ensureLogIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      const col = db.collection(COLLECTION);
      await Promise.all([
        col.createIndex({ tenantId: 1, createdAt: -1 }),
        col.createIndex({ tenantId: 1, level: 1, createdAt: -1 }),
        col.createIndex({ tenantId: 1, source: 1, createdAt: -1 }),
        col.createIndex({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Drop anything non-serializable so a stray object can't break the insert. */
function sanitizeContext(
  context: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!context) return null;
  try {
    return JSON.parse(JSON.stringify(context)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
