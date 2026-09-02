/**
 * Scheduled analytics reports — [קטגוריה 23] §23.5.
 *
 * A tenant defines a digest (which event metrics, how often, where to deliver).
 * `runScheduledReports` runs from the daily drain cron: for each schedule that's
 * due in its timezone it computes the metrics over the period, stores a run, and
 * (optionally) POSTs the digest to a webhook — no external mail dependency.
 *
 * Collections: `report_schedules`, `report_runs`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";
import { countByType, DEFAULT_TZ, type DateRange } from "./events";

export type ReportFrequency = "daily" | "weekly";

export interface ReportSchedule extends BaseEntity {
  name: string;
  frequency: ReportFrequency;
  /** Event types to include in the digest (counts). Empty = all types. */
  events: string[];
  /** Optional webhook to POST the digest to (dependency-free delivery). */
  webhookUrl: string | null;
  timezone: string;
  lastRunAt: Date | null;
}

export interface ReportRun extends BaseEntity {
  scheduleId: string;
  periodFrom: Date;
  periodTo: Date;
  metrics: Record<string, number>;
  delivered: boolean;
}

class ReportScheduleRepository extends Repository<ReportSchedule> {
  constructor() {
    super("report_schedules");
  }
}
class ReportRunRepository extends Repository<ReportRun> {
  constructor() {
    super("report_runs");
  }
}

const schedules = new ReportScheduleRepository();
const runs = new ReportRunRepository();

const DAY = 24 * 60 * 60 * 1000;

export function listSchedules(tenantId: string): Promise<ReportSchedule[]> {
  return schedules.findMany(tenantId);
}

export function createSchedule(
  tenantId: string,
  input: { name: string; frequency?: ReportFrequency; events?: string[]; webhookUrl?: string | null; timezone?: string }
): Promise<ReportSchedule> {
  return schedules.create(tenantId, {
    name: input.name,
    frequency: input.frequency ?? "daily",
    events: input.events ?? [],
    webhookUrl: input.webhookUrl ?? null,
    timezone: input.timezone ?? DEFAULT_TZ,
    lastRunAt: null,
  });
}

export function deleteSchedule(tenantId: string, id: string): Promise<boolean> {
  return schedules.delete(tenantId, id);
}

export function listRuns(tenantId: string, scheduleId: string): Promise<ReportRun[]> {
  return runs.findMany(tenantId, { scheduleId } as never);
}

/** Compute the metrics for a schedule over a range and (optionally) deliver them. */
async function executeSchedule(tenantId: string, schedule: ReportSchedule, range: DateRange): Promise<ReportRun> {
  const all = await countByType(tenantId, range);
  const metrics = schedule.events.length
    ? Object.fromEntries(schedule.events.map((e) => [e, all[e] ?? 0]))
    : all;

  let delivered = false;
  if (schedule.webhookUrl) {
    try {
      const res = await fetch(schedule.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: schedule.name, period: range, metrics }),
      });
      delivered = res.ok;
    } catch (err) {
      console.error("[analytics] report delivery failed", schedule.id, err);
    }
  }

  const run = await runs.create(tenantId, {
    scheduleId: schedule.id,
    periodFrom: range.from ?? new Date(0),
    periodTo: range.to ?? new Date(),
    metrics,
    delivered,
  });
  await schedules.update(tenantId, schedule.id, { lastRunAt: new Date() });
  return run;
}

/** Run a single schedule immediately over its natural period (UI "run now"). */
export async function runReportNow(tenantId: string, id: string): Promise<ReportRun | null> {
  const schedule = await schedules.findById(tenantId, id);
  if (!schedule) return null;
  const span = schedule.frequency === "weekly" ? 7 * DAY : DAY;
  return executeSchedule(tenantId, schedule, { from: new Date(Date.now() - span), to: new Date() });
}

/** True if a schedule is due: never run, or its period elapsed since lastRunAt. */
function isDue(schedule: ReportSchedule): boolean {
  if (!schedule.lastRunAt) return true;
  const span = schedule.frequency === "weekly" ? 7 * DAY : DAY;
  return Date.now() - schedule.lastRunAt.getTime() >= span;
}

/**
 * Drain-cron entrypoint: run every due schedule for the tenant. Returns how many
 * digests were produced. Best-effort — a failing schedule never blocks the rest.
 */
export async function runScheduledReports(tenantId: string): Promise<number> {
  await ensureReportIndexes();
  const due = (await schedules.findMany(tenantId)).filter(isDue);
  let ran = 0;
  for (const schedule of due) {
    const span = schedule.frequency === "weekly" ? 7 * DAY : DAY;
    try {
      await executeSchedule(tenantId, schedule, { from: new Date(Date.now() - span), to: new Date() });
      ran++;
    } catch (err) {
      console.error("[analytics] scheduled report failed", schedule.id, err);
    }
  }
  return ran;
}

export async function ensureReportIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("report_schedules").createIndex({ tenantId: 1 }),
    db.collection("report_runs").createIndex({ tenantId: 1, scheduleId: 1, createdAt: -1 }),
  ]);
}
