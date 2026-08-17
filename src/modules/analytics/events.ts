/**
 * Analytics event store — [קטגוריה 23] §23.1.
 *
 * A single, uniform event stream that every module feeds via `track()`. Reports
 * (timeseries, drill-down, topic clustering, the AI-optimization feed) are built
 * on top of it, in addition to the on-read KPI aggregation in `getOverview`.
 *
 * `track()` is fire-and-forget: it must NEVER throw into a caller's hot path
 * (a webhook, an AI turn). A lost analytics event is acceptable; a broken
 * conversation is not. Collection: `analytics_events`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";

/** Canonical event names. Free strings are allowed, but prefer these. */
export const EVENT_TYPES = [
  "message_in",
  "message_out",
  "ai_answer",
  "handoff",
  "ticket_created",
  "ticket_resolved",
  "campaign_sent",
  "lead_created",
  "lead_stage_changed",
  "conversion",
] as const;

export type AnalyticsEventType = (typeof EVENT_TYPES)[number];

export interface AnalyticsEvent extends BaseEntity {
  eventType: string;
  /** Dimensions — nullable so any module can emit what it has. */
  conversationId: string | null;
  contactId: string | null;
  agentId: string | null;
  campaignId: string | null;
  leadId: string | null;
  /** Free-form: confidence, intent, sentiment, channel, templateId, value… */
  attributes: Record<string, unknown>;
  /** Logical time the thing happened (may differ from createdAt for backfills). */
  occurredAt: Date;
}

class AnalyticsEventRepository extends Repository<AnalyticsEvent> {
  constructor() {
    super("analytics_events");
  }
}

const events = new AnalyticsEventRepository();

export interface TrackOptions {
  conversationId?: string | null;
  contactId?: string | null;
  agentId?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  attributes?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Record one analytics event. Swallows all errors by design — callers in hot
 * paths should `void track(...)` without awaiting if latency matters.
 */
export async function track(
  tenantId: string,
  eventType: AnalyticsEventType | string,
  opts: TrackOptions = {}
): Promise<void> {
  try {
    await events.create(tenantId, {
      eventType,
      conversationId: opts.conversationId ?? null,
      contactId: opts.contactId ?? null,
      agentId: opts.agentId ?? null,
      campaignId: opts.campaignId ?? null,
      leadId: opts.leadId ?? null,
      attributes: opts.attributes ?? {},
      occurredAt: opts.occurredAt ?? new Date(),
    });
  } catch (err) {
    console.error("[analytics] track failed", eventType, err);
  }
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

function matchStage(tenantId: string, range: DateRange, eventType?: string): Record<string, unknown> {
  const occurredAt: Record<string, Date> = {};
  if (range.from) occurredAt.$gte = range.from;
  if (range.to) occurredAt.$lte = range.to;
  const match: Record<string, unknown> = { tenantId };
  if (eventType) match.eventType = eventType;
  if (Object.keys(occurredAt).length) match.occurredAt = occurredAt;
  return match;
}

/** Total count per event type over a range. */
export async function countByType(
  tenantId: string,
  range: DateRange = {}
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .collection<AnalyticsEvent>("analytics_events")
    .aggregate<{ _id: string; count: number }>([
      { $match: matchStage(tenantId, range) },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD in the requested timezone
  count: number;
}

/** Default tenant timezone for day-bucketing (Israel). */
export const DEFAULT_TZ = "Asia/Jerusalem";

/**
 * Daily counts for one event type, bucketed into calendar days of `timezone`
 * (defaults to Israel) so "today" matches the tenant's clock, not UTC.
 */
export async function timeseries(
  tenantId: string,
  eventType: string,
  range: DateRange = {},
  timezone: string = DEFAULT_TZ
): Promise<TimeseriesPoint[]> {
  const db = await getDb();
  const rows = await db
    .collection<AnalyticsEvent>("analytics_events")
    .aggregate<{ _id: string; count: number }>([
      { $match: matchStage(tenantId, range, eventType) },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return rows.map((r) => ({ date: r._id, count: r.count }));
}

/**
 * Topic / intent clustering (§23.4): the most frequent intents seen on AI
 * answers, used to surface common topics and knowledge gaps (feeds [קטגוריה 24]).
 */
export async function topIntents(
  tenantId: string,
  range: DateRange = {},
  limit = 20
): Promise<Array<{ intent: string; count: number; handoffRate: number }>> {
  const db = await getDb();
  const rows = await db
    .collection<AnalyticsEvent>("analytics_events")
    .aggregate<{ _id: string; count: number; handoffs: number }>([
      { $match: { ...matchStage(tenantId, range, "ai_answer"), "attributes.intent": { $ne: null } } },
      {
        $group: {
          _id: "$attributes.intent",
          count: { $sum: 1 },
          handoffs: { $sum: { $cond: [{ $eq: ["$attributes.handedOff", true] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ])
    .toArray();
  return rows.map((r) => ({
    intent: r._id,
    count: r.count,
    handoffRate: r.count > 0 ? r.handoffs / r.count : 0,
  }));
}

/** Raw events of a type, newest first — backs the drill-down from a KPI row (§23.3). */
export async function drillDown(
  tenantId: string,
  eventType: string,
  range: DateRange = {},
  limit = 200
): Promise<AnalyticsEvent[]> {
  const db = await getDb();
  return db
    .collection<AnalyticsEvent>("analytics_events")
    .find(matchStage(tenantId, range, eventType))
    .sort({ occurredAt: -1 })
    .limit(limit)
    .toArray() as Promise<AnalyticsEvent[]>;
}

export async function ensureAnalyticsIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("analytics_events").createIndex({ tenantId: 1, eventType: 1, occurredAt: -1 }),
    db.collection("analytics_events").createIndex({ tenantId: 1, occurredAt: -1 }),
  ]);
}
