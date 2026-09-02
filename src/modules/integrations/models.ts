/**
 * Integrations models — [קטגוריה 22].
 *
 * Two surfaces to the outside world:
 *   • Outbound webhooks (§22.2): the platform POSTs signed events to customer URLs.
 *   • Public REST API (§22.3): tenant-scoped API keys authenticate /api/v1/* calls.
 *
 * Collections:
 *   webhook_subscriptions → WebhookSubscription
 *   webhook_deliveries     → WebhookDelivery   (one attempt-chain per event)
 *   api_keys               → ApiKey            (only the hash is stored)
 */
import type { BaseEntity } from "@/core/types";
import type { Scope } from "@/modules/admin/rbac";

/** Events a customer can subscribe to (§22.2). */
export const OUTBOUND_EVENTS = [
  "message_received",
  "message_sent",
  "message_status",
  "conversation_assigned",
  "contact_created",
  "contact_updated",
  "lead_created",
  "template_status_update",
] as const;

export type OutboundEvent = (typeof OUTBOUND_EVENTS)[number];

export interface WebhookSubscription extends BaseEntity {
  targetUrl: string;
  events: string[];
  /** Encrypted at rest (AES-256-GCM via core/crypto); used to HMAC-sign payloads. */
  secretEncrypted: string;
  active: boolean;
  lastDelivery: { status: "success" | "failed"; code: number; at: Date } | null;
  /** Consecutive failures — auto-disables the subscription past a threshold. */
  failureCount: number;
}

export type DeliveryStatus = "pending" | "success" | "failed";

export interface WebhookDelivery extends BaseEntity {
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextRetryAt: Date | null;
}

export interface ApiKey extends BaseEntity {
  name: string;
  /** First chars of the token, shown in the UI to identify the key. */
  prefix: string;
  /** sha256(token) — the raw token is shown once on creation and never stored. */
  keyHash: string;
  scopes: Scope[];
  active: boolean;
  lastUsedAt: Date | null;
  createdBy: string | null;
}
