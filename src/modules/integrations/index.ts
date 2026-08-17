/**
 * Integrations module — public surface ([קטגוריה 22]).
 *
 * Outbound webhooks (§22.2) + Public REST API keys (§22.3). The in-flow HTTP
 * request node (§22.1) already lives in the Flow Builder engine ([8] `api`/
 * `webhook` nodes); native connectors (§22.4) and AI data-connectors (§22.5)
 * build on these primitives.
 */
import { getDb } from "@/core/db/mongo";

export * from "./models";
export {
  createSubscription,
  listSubscriptions,
  updateSubscription,
  deleteSubscription,
  listDeliveries,
  emitEvent,
  deliver,
  type CreateSubscriptionInput,
} from "./webhooks";
export {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  authenticate,
  type CreateApiKeyInput,
  type ApiKeyContext,
} from "./apikeys";

export async function ensureIntegrationIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("webhook_subscriptions").createIndex({ tenantId: 1, events: 1, active: 1 }),
    db.collection("webhook_deliveries").createIndex({ tenantId: 1, subscriptionId: 1 }),
    db.collection("webhook_deliveries").createIndex({ status: 1, nextRetryAt: 1 }),
    db.collection("api_keys").createIndex({ keyHash: 1 }, { unique: true }),
    db.collection("api_keys").createIndex({ tenantId: 1 }),
  ]);
}
