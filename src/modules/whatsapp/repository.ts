/**
 * WhatsApp repositories — extend the generic tenant-scoped Repository.
 *
 * They inherit tenant isolation for free and add domain finders. Index creation
 * (uniqueness + dedup TTL) is centralized in `ensureWhatsAppIndexes`, invoked
 * lazily by the service before the first webhook is processed.
 */
import { randomUUID } from "crypto";
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type {
  Conversation,
  ProcessedWebhookEvent,
  WhatsAppAccount,
  WhatsAppMessage,
} from "./models";

export class WhatsAppAccountRepository extends Repository<WhatsAppAccount> {
  constructor() {
    super("wa_accounts");
  }

  findByPhoneNumberId(tenantId: string, phoneNumberId: string) {
    return this.findOne(tenantId, { phoneNumberId } as Filter<WhatsAppAccount>);
  }
}

export class ConversationRepository extends Repository<Conversation> {
  constructor() {
    super("wa_conversations");
  }

  findByWaId(tenantId: string, phoneNumberId: string, waId: string) {
    return this.findOne(tenantId, { phoneNumberId, waId } as Filter<Conversation>);
  }

  /** List conversations for the Inbox, most-recently-active first ([קטגוריה 3] §3.1). */
  async list(
    tenantId: string,
    filter: Filter<Conversation> = {},
    limit = 50
  ): Promise<Conversation[]> {
    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, filter))
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .toArray() as Promise<Conversation[]>;
  }

  /** Find the conversation for a customer or create a fresh, empty one. Race-safe. */
  async getOrCreate(
    tenantId: string,
    phoneNumberId: string,
    waId: string
  ): Promise<Conversation> {
    const existing = await this.findByWaId(tenantId, phoneNumberId, waId);
    if (existing) return existing;

    try {
      return await this.create(tenantId, {
        waId,
        phoneNumberId,
        channel: "whatsapp",
        contactId: null,
        contactName: null,
        serviceWindowExpiresAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        marketingOptIn: "unknown",
        optInSource: null,
        optInAt: null,
        status: "open",
        priority: "normal",
        assigneeId: null,
        teamId: null,
        tags: [],
        unreadCount: 0,
        aiEnabled: true,
        snoozedUntil: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        openedAt: new Date(),
        closedAt: null,
        sla: null,
      });
    } catch (err) {
      // Lost the create race against a concurrent webhook — read the winner.
      if (isDuplicateKey(err)) {
        const conv = await this.findByWaId(tenantId, phoneNumberId, waId);
        if (conv) return conv;
      }
      throw err;
    }
  }
}

export class MessageRepository extends Repository<WhatsAppMessage> {
  constructor() {
    super("wa_messages");
  }

  findByWamid(tenantId: string, wamid: string) {
    return this.findOne(tenantId, { wamid } as Filter<WhatsAppMessage>);
  }

  /** Most recent messages of a conversation, newest first. */
  async listByConversation(
    tenantId: string,
    conversationId: string,
    limit = 50
  ): Promise<WhatsAppMessage[]> {
    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, { conversationId } as Filter<WhatsAppMessage>))
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(limit)
      .toArray() as Promise<WhatsAppMessage[]>;
  }
}

export class WebhookDedupRepository extends Repository<ProcessedWebhookEvent> {
  constructor() {
    super("wa_dedup");
  }

  /**
   * Atomically record an event id. Returns `true` if this is the first time we
   * see it (caller should process), `false` if it is a duplicate (skip).
   *
   * The uniqueness is enforced by a unique index on (tenantId, eventId); we rely
   * on the insert failing rather than a read-then-write, so concurrent webhook
   * deliveries can never both win.
   */
  async markIfNew(
    tenantId: string,
    eventId: string,
    kind: ProcessedWebhookEvent["kind"]
  ): Promise<boolean> {
    const col = await this.collection();
    const now = new Date();
    try {
      await col.insertOne({
        id: randomUUID(),
        tenantId,
        eventId,
        kind,
        createdAt: now,
        updatedAt: now,
      } as unknown as ProcessedWebhookEvent);
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

let indexesReady: Promise<void> | null = null;

/**
 * Create the module's indexes once per process (memoized). Safe to call on every
 * request — Mongo's createIndex is idempotent and this resolves instantly after
 * the first success.
 */
export function ensureWhatsAppIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("wa_accounts").createIndex(
          { tenantId: 1, phoneNumberId: 1 },
          { unique: true }
        ),
        db.collection("wa_conversations").createIndex(
          { tenantId: 1, phoneNumberId: 1, waId: 1 },
          { unique: true }
        ),
        db.collection("wa_messages").createIndex({ tenantId: 1, wamid: 1 }),
        db.collection("wa_messages").createIndex({ tenantId: 1, conversationId: 1, sentAt: -1 }),
        db.collection("wa_dedup").createIndex(
          { tenantId: 1, eventId: 1 },
          { unique: true }
        ),
        // Auto-expire dedup records after 3 days — Meta retries are far shorter.
        db.collection("wa_dedup").createIndex(
          { createdAt: 1 },
          { expireAfterSeconds: 60 * 60 * 24 * 3 }
        ),
      ]);
    })().catch((err) => {
      indexesReady = null; // allow a retry on the next request
      throw err;
    });
  }
  return indexesReady;
}
