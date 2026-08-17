/**
 * Billing — plans, quotas & usage metering — [קטגוריה 25.6].
 *
 * Each tenant has a Subscription (plan + current billing period). Usage is
 * metered per metric per month in `usage_counters`; `checkQuota` compares it to
 * the plan limits so any hot path (send, AI answer, campaign) can gate itself via
 * the exported seam. Payment-provider integration (Stripe/Paddle) plugs in at
 * `setPlan` later — this module owns the limits + accounting, not the charge.
 *
 * Collections: `subscriptions`, `usage_counters`.
 */
import { randomUUID } from "crypto";
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter, UpdateFilter } from "mongodb";
import type { BaseEntity } from "@/core/types";

export type PlanId = "trial" | "starter" | "pro" | "enterprise";
export type UsageMetric = "messages_out" | "ai_answers" | "campaigns" | "contacts";

export interface PlanLimits {
  messages_out: number;
  ai_answers: number;
  campaigns: number;
  contacts: number;
  seats: number;
}

export interface Plan {
  id: PlanId;
  label: string;
  /** Monthly price in agorot/cents (display only here). */
  priceMonthly: number;
  /** -1 = unlimited. */
  limits: PlanLimits;
}

/** The plan catalog. `-1` means unlimited. */
export const PLANS: Record<PlanId, Plan> = {
  trial: { id: "trial", label: "ניסיון", priceMonthly: 0, limits: { messages_out: 500, ai_answers: 200, campaigns: 2, contacts: 250, seats: 2 } },
  starter: { id: "starter", label: "בסיסי", priceMonthly: 9900, limits: { messages_out: 5000, ai_answers: 2000, campaigns: 20, contacts: 5000, seats: 5 } },
  pro: { id: "pro", label: "מקצועי", priceMonthly: 29900, limits: { messages_out: 50000, ai_answers: 20000, campaigns: 200, contacts: 50000, seats: 20 } },
  enterprise: { id: "enterprise", label: "ארגוני", priceMonthly: 0, limits: { messages_out: -1, ai_answers: -1, campaigns: -1, contacts: -1, seats: -1 } },
};

export interface Subscription extends BaseEntity {
  plan: PlanId;
  status: "active" | "past_due" | "cancelled";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface UsageCounter extends BaseEntity {
  metric: UsageMetric;
  /** Billing period key, YYYY-MM (UTC). */
  period: string;
  count: number;
}

class SubscriptionRepository extends Repository<Subscription> {
  constructor() {
    super("subscriptions");
  }
}
class UsageRepository extends Repository<UsageCounter> {
  constructor() {
    super("usage_counters");
  }
}

const subs = new SubscriptionRepository();
const usage = new UsageRepository();

function periodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function periodBounds(d = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Get the tenant's subscription, seeding a trial on first access. */
export async function getSubscription(tenantId: string): Promise<Subscription> {
  await ensureBillingIndexes();
  const existing = await subs.findOne(tenantId, {} as Filter<Subscription>);
  if (existing) return existing;
  const { start, end } = periodBounds();
  return subs.create(tenantId, { plan: "trial", status: "active", currentPeriodStart: start, currentPeriodEnd: end });
}

export async function setPlan(tenantId: string, plan: PlanId): Promise<Subscription> {
  const sub = await getSubscription(tenantId);
  return (await subs.update(tenantId, sub.id, { plan, status: "active" })) ?? sub;
}

export function planCatalog(): Plan[] {
  return Object.values(PLANS);
}

/** Atomically add `n` to a metric's counter for the current period. */
export async function incrementUsage(tenantId: string, metric: UsageMetric, n = 1): Promise<void> {
  await ensureBillingIndexes();
  const period = periodKey();
  const db = await getDb();
  await db.collection<UsageCounter>("usage_counters").updateOne(
    { tenantId, metric, period } as Filter<UsageCounter>,
    {
      $inc: { count: n },
      $setOnInsert: { tenantId, metric, period, id: randomUUID(), createdAt: new Date() },
      $set: { updatedAt: new Date() },
    } as unknown as UpdateFilter<UsageCounter>,
    { upsert: true }
  );
}

export async function getUsage(tenantId: string, period = periodKey()): Promise<Record<UsageMetric, number>> {
  const rows = await usage.findMany(tenantId, { period } as Filter<UsageCounter>);
  const out: Record<UsageMetric, number> = { messages_out: 0, ai_answers: 0, campaigns: 0, contacts: 0 };
  for (const r of rows) out[r.metric] = r.count;
  return out;
}

export interface QuotaCheck {
  metric: UsageMetric;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
}

/** Is the tenant within its plan limit for `metric` this period? `-1` limit = unlimited. */
export async function checkQuota(tenantId: string, metric: UsageMetric): Promise<QuotaCheck> {
  const sub = await getSubscription(tenantId);
  const limit = PLANS[sub.plan].limits[metric];
  const used = (await getUsage(tenantId))[metric];
  const allowed = limit < 0 || used < limit;
  return { metric, used, limit, remaining: limit < 0 ? -1 : Math.max(0, limit - used), allowed };
}

/** Throwing guard for hot paths that must hard-stop at the quota. */
export async function enforceQuota(tenantId: string, metric: UsageMetric): Promise<void> {
  const q = await checkQuota(tenantId, metric);
  if (!q.allowed) throw new Error(`חריגה ממכסת ${metric}: ${q.used}/${q.limit} בתוכנית הנוכחית`);
}

export interface BillingSummary {
  plan: Plan;
  status: Subscription["status"];
  period: string;
  usage: Array<QuotaCheck & { label: string }>;
}

const METRIC_LABEL: Record<UsageMetric, string> = {
  messages_out: "הודעות יוצאות", ai_answers: "תשובות AI", campaigns: "קמפיינים", contacts: "אנשי קשר",
};

export async function billingSummary(tenantId: string): Promise<BillingSummary> {
  const sub = await getSubscription(tenantId);
  const plan = PLANS[sub.plan];
  const used = await getUsage(tenantId);
  const metrics: UsageMetric[] = ["messages_out", "ai_answers", "campaigns", "contacts"];
  return {
    plan,
    status: sub.status,
    period: periodKey(),
    usage: metrics.map((m) => {
      const limit = plan.limits[m];
      const u = used[m];
      return { metric: m, label: METRIC_LABEL[m], used: u, limit, remaining: limit < 0 ? -1 : Math.max(0, limit - u), allowed: limit < 0 || u < limit };
    }),
  };
}

export async function ensureBillingIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("subscriptions").createIndex({ tenantId: 1 }),
    db.collection("usage_counters").createIndex({ tenantId: 1, metric: 1, period: 1 }, { unique: true }),
  ]);
}
