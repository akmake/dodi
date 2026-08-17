/**
 * Outbound webhooks — [קטגוריה 22] §22.2.
 *
 * `emitEvent()` fans an event out to every matching active subscription by
 * creating a WebhookDelivery and enqueuing a `webhook.deliver` job. The drain
 * handler `deliver()` POSTs the signed payload, manages its own retry/backoff
 * chain, and auto-disables a subscription after sustained failure.
 *
 * `emitEvent` is fire-and-forget — it never throws into the caller's hot path.
 */
import { createHmac, randomBytes } from "crypto";
import { Repository } from "@/core/db/repository";
import type { Filter } from "mongodb";
import { enqueue } from "@/core/jobs";
import { encryptSecret, decryptSecret } from "@/core/crypto";
import type { WebhookSubscription, WebhookDelivery, OutboundEvent } from "./models";

class SubscriptionRepository extends Repository<WebhookSubscription> {
  constructor() {
    super("webhook_subscriptions");
  }
}
class DeliveryRepository extends Repository<WebhookDelivery> {
  constructor() {
    super("webhook_deliveries");
  }
}

const subscriptions = new SubscriptionRepository();
const deliveries = new DeliveryRepository();

const MAX_DELIVERY_ATTEMPTS = 6;
const DISABLE_AFTER_FAILURES = 15;
const TIMEOUT_MS = 10_000;

export interface CreateSubscriptionInput {
  targetUrl: string;
  events: string[];
  /** Caller-supplied secret; generated if omitted. Returned in clear once. */
  secret?: string;
}

export async function createSubscription(
  tenantId: string,
  input: CreateSubscriptionInput
): Promise<{ subscription: WebhookSubscription; secret: string }> {
  const secret = input.secret?.trim() || `whsec_${randomBytes(24).toString("hex")}`;
  const subscription = await subscriptions.create(tenantId, {
    targetUrl: input.targetUrl,
    events: input.events,
    secretEncrypted: encryptSecret(secret),
    active: true,
    lastDelivery: null,
    failureCount: 0,
  });
  return { subscription, secret };
}

export function listSubscriptions(tenantId: string) {
  return subscriptions.findMany(tenantId);
}

export function updateSubscription(
  tenantId: string,
  id: string,
  patch: Partial<Pick<WebhookSubscription, "targetUrl" | "events" | "active">>
) {
  return subscriptions.update(tenantId, id, patch);
}

export function deleteSubscription(tenantId: string, id: string) {
  return subscriptions.delete(tenantId, id);
}

/**
 * Fan an event out to matching subscriptions. Safe to `void` from a hot path —
 * all errors are swallowed.
 */
export async function emitEvent(
  tenantId: string,
  event: OutboundEvent | string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const subs = await subscriptions.findMany(tenantId, {
      active: true,
      events: event,
    } as Filter<WebhookSubscription>);
    for (const sub of subs) {
      const delivery = await deliveries.create(tenantId, {
        subscriptionId: sub.id,
        event,
        payload: {
          event,
          timestamp: new Date().toISOString(),
          tenant_id: tenantId,
          data,
        },
        status: "pending",
        attempts: 0,
        lastError: null,
        nextRetryAt: new Date(),
      });
      await enqueue(tenantId, "webhook.deliver", { deliveryId: delivery.id });
    }
  } catch (err) {
    console.error("[integrations] emitEvent failed", event, err);
  }
}

/** Drain handler for `webhook.deliver` — POST + sign + manage retry chain. */
export async function deliver(tenantId: string, deliveryId: string): Promise<void> {
  const delivery = await deliveries.findById(tenantId, deliveryId);
  if (!delivery || delivery.status !== "pending") return;
  const sub = await subscriptions.findById(tenantId, delivery.subscriptionId);
  if (!sub || !sub.active) {
    await deliveries.update(tenantId, deliveryId, { status: "failed", lastError: "subscription inactive" });
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const signature = createHmac("sha256", decryptSecret(sub.secretEncrypted)).update(body).digest("hex");

  const result = await post(sub.targetUrl, body, signature);

  if (result.ok) {
    await deliveries.update(tenantId, deliveryId, { status: "success", attempts: delivery.attempts + 1 });
    await subscriptions.update(tenantId, sub.id, {
      failureCount: 0,
      lastDelivery: { status: "success", code: result.status, at: new Date() },
    });
    return;
  }

  const attempts = delivery.attempts + 1;
  const failureCount = sub.failureCount + 1;
  if (attempts < MAX_DELIVERY_ATTEMPTS) {
    // Exponential backoff, capped at 1h, and retry via a fresh job.
    const delayMin = Math.min(2 ** attempts, 60);
    const nextRetryAt = new Date(Date.now() + delayMin * 60_000);
    await deliveries.update(tenantId, deliveryId, { attempts, lastError: result.error, nextRetryAt });
    await enqueue(tenantId, "webhook.deliver", { deliveryId }, nextRetryAt);
  } else {
    await deliveries.update(tenantId, deliveryId, { status: "failed", attempts, lastError: result.error });
  }

  await subscriptions.update(tenantId, sub.id, {
    failureCount,
    lastDelivery: { status: "failed", code: result.status, at: new Date() },
    // Auto-disable a chronically failing endpoint (§22.2 edge case).
    active: failureCount >= DISABLE_AFTER_FAILURES ? false : sub.active,
  });
}

interface PostResult {
  ok: boolean;
  status: number;
  error: string | null;
}

async function post(url: string, body: string, signature: string): Promise<PostResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bootwhat-signature": `sha256=${signature}`,
      },
      body,
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function listDeliveries(tenantId: string, subscriptionId: string) {
  return deliveries.findMany(tenantId, { subscriptionId } as Filter<WebhookDelivery>);
}
