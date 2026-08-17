/**
 * Structured logger for the WhatsApp engine — port of `Whatsapp/server/utils/logger.js`.
 *
 * Deliberately NOT unified with bootWhat's `core/logs.ts` (which is Mongo-only,
 * tenant-scoped, TTL 14 days). This one preserves the legacy behavior exactly:
 * an in-memory ring buffer (all levels, for live debugging), a rotating file on
 * disk (warn+, survives crashes/restarts), and a best-effort Mongo sink (warn+).
 * The `logentries` collection is read by the legacy `/logs` screens we're
 * porting — same shape, so those screens keep working unmodified.
 */
import fs from "fs";
import { LOGS_DIR, LOG_FILE } from "./paths";
import { getDb } from "@/core/db/mongo";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB before rotation
const RING_SIZE = 2000;

type Level = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntryDoc {
  ts: Date;
  level: Level;
  component: string;
  tenantId: string | null;
  message: string;
  pid: number;
  mem: number;
  stack?: string;
  data?: Record<string, unknown>;
}

let _stream: fs.WriteStream | null = null;
let _fileBytes = 0;

function ensureStream(): fs.WriteStream {
  if (_stream) return _stream;
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  _stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  try {
    _fileBytes = fs.statSync(LOG_FILE).size;
  } catch {
    _fileBytes = 0;
  }
  return _stream;
}

const ring: LogEntryDoc[] = [];

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
const DISK_MIN_LEVEL = 2; // warn

function rotateIfNeeded(): void {
  if (_fileBytes < MAX_FILE_BYTES) return;
  try {
    _stream?.close();
    fs.renameSync(LOG_FILE, LOG_FILE.replace(".log", `.${Date.now()}.log`));
    _stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    _fileBytes = 0;
  } catch {
    // best-effort — never let logging itself crash the process
  }
}

let mongoSinkFailedOnce = false;

async function writeToMongo(entry: LogEntryDoc): Promise<void> {
  try {
    const db = await getDb();
    await db.collection<LogEntryDoc>("logentries").insertOne(entry);
  } catch (err) {
    if (!mongoSinkFailedOnce) {
      mongoSinkFailedOnce = true;
      console.error("[wa-engine logger] mongo sink failed (further failures suppressed):", err);
    }
  }
}

function write(level: Level, component: string, message: string, extra: Record<string, unknown> = {}): void {
  const entry: LogEntryDoc = {
    ts: new Date(),
    level,
    component,
    tenantId: (extra.tenantId as string | undefined) ?? null,
    message,
    pid: process.pid,
    mem: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    ...extra,
  };

  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();

  if ((LEVELS[level] ?? 0) >= DISK_MIN_LEVEL) {
    rotateIfNeeded();
    const stream = ensureStream();
    const line = JSON.stringify(entry) + "\n";
    stream.write(line);
    _fileBytes += line.length;
    void writeToMongo(entry);
  }
}

export const logger = {
  debug: (component: string, msg: string, extra?: Record<string, unknown>) => write("debug", component, msg, extra),
  info: (component: string, msg: string, extra?: Record<string, unknown>) => write("info", component, msg, extra),
  warn: (component: string, msg: string, extra?: Record<string, unknown>) => write("warn", component, msg, extra),
  error: (component: string, msg: string, extra?: Record<string, unknown>) => write("error", component, msg, extra),
  fatal: (component: string, msg: string, extra?: Record<string, unknown>) => write("fatal", component, msg, extra),
  ring: () => [...ring].reverse(),
  logFile: () => LOG_FILE,
};
