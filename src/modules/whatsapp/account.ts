/**
 * WhatsApp account management — [קטגוריה 2] §2.1.
 *
 * The single source of truth for the tenant's official-WhatsApp connection.
 * `wa_accounts` (encrypted token) is preferred; the env config is the
 * single-tenant fallback bridge, mirroring `service.resolveClient`.
 *
 * The status object returned here is what the dashboard "מרכז וואטסאפ" shows —
 * it never contains a usable token, only a masked preview.
 */
import { config } from "@/core/config";
import { decryptSecret, encryptSecret } from "@/core/crypto";
import { listLogs } from "@/core/logs";
import type { AccountStatus, MessagingLimitTier, QualityRating, WhatsAppAccount } from "./models";
import { ConversationRepository, WhatsAppAccountRepository, ensureWhatsAppIndexes } from "./repository";

const accounts = new WhatsAppAccountRepository();
const conversations = new ConversationRepository();

// ---------------------------------------------------------------------------
// Status (GET)
// ---------------------------------------------------------------------------

export interface WebhookHealthEntry {
  at: Date;
  level: "error" | "warn";
  message: string;
}

export interface WhatsAppConnectionStatus {
  /** Where the live credentials come from: persisted account, env bridge, or nothing. */
  source: "db" | "env" | "none";
  connected: boolean;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  verifiedName: string | null;
  qualityRating: QualityRating | null;
  messagingLimitTier: MessagingLimitTier | null;
  accountStatus: AccountStatus | null;
  /** First+last characters only — the full token never leaves the server. */
  tokenPreview: string | null;
  tokenUpdatedAt: Date | null;
  tokenExpiresAt: Date | null;
  /** Both `WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` are configured. */
  webhookConfigured: boolean;
  health: {
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
    /** Recent non-info webhook log entries (signature failures, ingest errors). */
    recentWebhookIssues: WebhookHealthEntry[];
  };
}

function maskToken(token: string): string | null {
  if (!token) return null;
  if (token.length <= 10) return "•".repeat(token.length);
  return `${token.slice(0, 5)}…${token.slice(-4)}`;
}

/** Resolve the persisted account the send-path would use (see `resolveClient`). */
async function findActiveAccount(tenantId: string): Promise<WhatsAppAccount | null> {
  await ensureWhatsAppIndexes();
  if (config.whatsapp.phoneNumberId) {
    const byEnvPhone = await accounts.findByPhoneNumberId(tenantId, config.whatsapp.phoneNumberId);
    if (byEnvPhone) return byEnvPhone;
  }
  return accounts.findOne(tenantId, {});
}

export async function getConnectionStatus(tenantId: string): Promise<WhatsAppConnectionStatus> {
  const account = await findActiveAccount(tenantId);

  const [latestInbound, latestOutbound, webhookLogs] = await Promise.all([
    conversations.list(tenantId, { lastInboundAt: { $ne: null } }, 1),
    conversations.list(tenantId, { lastOutboundAt: { $ne: null } }, 1),
    listLogs(tenantId, { source: "webhook", limit: 20 }).catch(() => []),
  ]);

  const health = {
    lastInboundAt: latestInbound[0]?.lastInboundAt ?? null,
    lastOutboundAt: latestOutbound[0]?.lastOutboundAt ?? null,
    recentWebhookIssues: webhookLogs
      .filter((l) => l.level !== "info")
      .slice(0, 5)
      .map((l) => ({ at: l.createdAt, level: l.level as "error" | "warn", message: l.message })),
  };

  const webhookConfigured = Boolean(config.whatsapp.verifyToken && config.whatsapp.appSecret);

  if (account) {
    let tokenPreview: string | null = null;
    try {
      tokenPreview = maskToken(decryptSecret(account.accessToken));
    } catch {
      tokenPreview = null; // ENCRYPTION_KEY missing/rotated — surfaced as "no token"
    }
    return {
      source: "db",
      connected: account.status === "connected",
      phoneNumberId: account.phoneNumberId,
      displayPhoneNumber: account.displayPhoneNumber || null,
      wabaId: account.wabaId || null,
      verifiedName: account.verifiedName || null,
      qualityRating: account.qualityRating,
      messagingLimitTier: account.messagingLimitTier,
      accountStatus: account.status,
      tokenPreview,
      tokenUpdatedAt: account.updatedAt,
      tokenExpiresAt: account.tokenExpiresAt,
      webhookConfigured,
      health,
    };
  }

  if (config.whatsapp.token && config.whatsapp.phoneNumberId) {
    return {
      source: "env",
      connected: true,
      phoneNumberId: config.whatsapp.phoneNumberId,
      displayPhoneNumber: null,
      wabaId: config.whatsapp.wabaId || null,
      verifiedName: null,
      qualityRating: null,
      messagingLimitTier: null,
      accountStatus: "connected",
      tokenPreview: maskToken(config.whatsapp.token),
      tokenUpdatedAt: null,
      tokenExpiresAt: null,
      webhookConfigured,
      health,
    };
  }

  return {
    source: "none",
    connected: false,
    phoneNumberId: null,
    displayPhoneNumber: null,
    wabaId: null,
    verifiedName: null,
    qualityRating: null,
    messagingLimitTier: null,
    accountStatus: null,
    tokenPreview: null,
    tokenUpdatedAt: null,
    tokenExpiresAt: null,
    webhookConfigured,
    health,
  };
}

// ---------------------------------------------------------------------------
// Upsert (PUT) — connect / update credentials
// ---------------------------------------------------------------------------

export interface UpsertAccountInput {
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  businessId?: string;
  verifiedName?: string;
  /** Plain token from the user; stored encrypted. Omit to keep the current one. */
  accessToken?: string;
  tokenExpiresAt?: Date | null;
}

export async function upsertAccount(
  tenantId: string,
  input: UpsertAccountInput
): Promise<WhatsAppConnectionStatus> {
  await ensureWhatsAppIndexes();
  const phoneNumberId = input.phoneNumberId.trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");

  const existing = await accounts.findByPhoneNumberId(tenantId, phoneNumberId);

  if (existing) {
    const patch: Partial<WhatsAppAccount> = {
      status: "connected",
    };
    if (input.wabaId !== undefined) patch.wabaId = input.wabaId.trim();
    if (input.displayPhoneNumber !== undefined) patch.displayPhoneNumber = input.displayPhoneNumber.trim();
    if (input.businessId !== undefined) patch.businessId = input.businessId.trim();
    if (input.verifiedName !== undefined) patch.verifiedName = input.verifiedName.trim();
    if (input.accessToken) {
      patch.accessToken = encryptSecret(input.accessToken.trim());
      patch.tokenExpiresAt = input.tokenExpiresAt ?? null;
    }
    await accounts.update(tenantId, existing.id, patch);
    return getConnectionStatus(tenantId);
  }

  if (!input.accessToken?.trim()) {
    throw new Error("accessToken is required when connecting a new account");
  }
  await accounts.create(tenantId, {
    wabaId: input.wabaId?.trim() ?? "",
    phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber?.trim() ?? "",
    businessId: input.businessId?.trim() ?? "",
    accessToken: encryptSecret(input.accessToken.trim()),
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    verifiedName: input.verifiedName?.trim() ?? "",
    qualityRating: "UNKNOWN",
    messagingLimitTier: "TIER_250",
    status: "connected",
  });
  return getConnectionStatus(tenantId);
}

// ---------------------------------------------------------------------------
// Disconnect (DELETE)
// ---------------------------------------------------------------------------

/**
 * Disconnect the persisted account. Conversations and messages are untouched —
 * only the send credentials are removed. When an env token exists, the send
 * path falls back to it (the record is deleted, not flagged), so a true
 * disconnect in single-tenant mode also requires clearing `WHATSAPP_TOKEN`.
 */
export async function disconnectAccount(tenantId: string): Promise<{ removed: boolean }> {
  const account = await findActiveAccount(tenantId);
  if (!account) return { removed: false };
  const removed = await accounts.delete(tenantId, account.id);
  return { removed };
}
