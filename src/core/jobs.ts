/**
 * Job scheduler — [קטגוריה 6.3 / 8.4] C1.
 *
 * A Mongo-backed deferred-work queue: the base for flow `wait` nodes, no-reply
 * follow-ups, scheduled campaigns and segment refreshes. Pure infrastructure —
 * it has no module imports, so anything can `enqueue()` without a cycle. A cron
 * hits `/api/jobs/drain`, which claims due jobs and dispatches them to handlers.
 *
 * Claiming is atomic (findOneAndUpdate → "running") so concurrent drains don't
 * double-process. At-least-once: a handler should be idempotent.
 */
import { randomUUID } from "crypto";
import { getDb } from "./db/mongo";

export type JobType =
  | "whatsapp.webhook"
  | "whatsapp.inbound"
  | "flow.resume"
  | "flow.timeout"
  | "campaign.send"
  | "campaign.send_batch"
  | "segment.refresh"
  | "lead.followup"
  | "sms.deliver"
  | "webhook.deliver"
  | "custom";
export type JobStatus = "pending" | "running" | "done" | "failed";

export interface Job {
  id: string;
  tenantId: string;
  type: JobType;
  payload: Record<string, unknown>;
  runAt: Date;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = "jobs";
const MAX_ATTEMPTS = 5;

async function col() {
  const db = await getDb();
  return db.collection<Job>(COLLECTION);
}

export async function enqueue(
  tenantId: string,
  type: JobType,
  payload: Record<string, unknown>,
  runAt: Date = new Date()
): Promise<string> {
  const now = new Date();
  const job: Job = {
    id: randomUUID(),
    tenantId,
    type,
    payload,
    runAt,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await (await col()).insertOne(job);
  return job.id;
}

/** Atomically claim up to `limit` due jobs, marking each "running". */
export async function claimDue(limit = 20): Promise<Job[]> {
  const c = await col();
  const claimed: Job[] = [];
  const now = new Date();
  for (let i = 0; i < limit; i++) {
    const res = await c.findOneAndUpdate(
      { status: "pending", runAt: { $lte: now } },
      { $set: { status: "running", updatedAt: new Date() }, $inc: { attempts: 1 } },
      { returnDocument: "after", sort: { runAt: 1 } }
    );
    const job = res as Job | null;
    if (!job) break;
    claimed.push(job);
  }
  return claimed;
}

export async function markDone(id: string): Promise<void> {
  await (await col()).updateOne({ id }, { $set: { status: "done", updatedAt: new Date() } });
}

export async function markFailed(id: string, attempts: number, error: string): Promise<void> {
  // Retry with backoff until MAX_ATTEMPTS, then give up (dead-letter via status).
  const giveUp = attempts >= MAX_ATTEMPTS;
  const nextRun = new Date(Date.now() + Math.min(2 ** attempts, 60) * 60 * 1000);
  await (await col()).updateOne(
    { id },
    {
      $set: {
        status: giveUp ? "failed" : "pending",
        runAt: giveUp ? new Date() : nextRun,
        lastError: error,
        updatedAt: new Date(),
      },
    }
  );
}

export async function ensureJobIndexes(): Promise<void> {
  const c = await col();
  await Promise.all([
    c.createIndex({ status: 1, runAt: 1 }),
    c.createIndex({ id: 1 }, { unique: true }),
  ]);
}
