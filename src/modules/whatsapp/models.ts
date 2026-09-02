/**
 * WhatsApp domain models — [קטגוריה 2] תשתית WhatsApp.
 *
 * Every entity extends BaseEntity, so it carries `tenantId` and is isolated by
 * the Repository. Collections:
 *   wa_accounts       → WhatsAppAccount   (§2.1)
 *   wa_conversations  → Conversation      (§2.4)
 *   wa_messages       → WhatsAppMessage   (§2.2, §2.3)
 *   wa_dedup          → ProcessedWebhookEvent (§2.2 dedup)
 */
import type { BaseEntity } from "@/core/types";

// ---------------------------------------------------------------------------
// WhatsAppAccount (§2.1)
// ---------------------------------------------------------------------------

export type QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export type MessagingLimitTier =
  | "TIER_250"
  | "TIER_1K"
  | "TIER_10K"
  | "TIER_100K"
  | "UNLIMITED";

export type AccountStatus = "connected" | "disconnected" | "flagged" | "restricted";

export interface WhatsAppAccount extends BaseEntity {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  businessId: string;
  /**
   * Meta access token, stored ENCRYPTED at rest (core/crypto). Callers that need
   * the live token must run it through `decryptSecret` — never send this field
   * to a Meta API call directly. See `service.resolveClient`.
   */
  accessToken: string;
  tokenExpiresAt: Date | null;
  verifiedName: string;
  qualityRating: QualityRating;
  messagingLimitTier: MessagingLimitTier;
  status: AccountStatus;
}

// ---------------------------------------------------------------------------
// Conversation (§2.4)
// ---------------------------------------------------------------------------

export type MarketingOptIn = "opted_in" | "opted_out" | "unknown";

/** Inbox workflow status ([קטגוריה 3] §3.2). */
export type ConversationStatus = "open" | "pending" | "snoozed" | "closed";

export type ConversationPriority = "low" | "normal" | "high" | "urgent";

/** Communication channel. WhatsApp only for now; the enum is the seam for [קטגוריה 1]. */
export type ConversationChannel = "whatsapp";

/** SLA clocks ([קטגוריה 3] §3.1). */
export interface ConversationSla {
  firstResponseDueAt: Date | null;
  nextResponseDueAt: Date | null;
}

export interface Conversation extends BaseEntity {
  /**
   * Customer WhatsApp id (digits, e.g. "16505551234"). The conversation's natural
   * key together with `phoneNumberId`. Linked to a Contact ([קטגוריה 4]) via `contactId`.
   */
  waId: string;
  /** Our business number that owns this conversation. */
  phoneNumberId: string;
  channel: ConversationChannel;
  /** Link to a Contact ([קטגוריה 4]). Set by the contacts sync on first inbound. */
  contactId: string | null;
  contactName: string | null;

  // --- 24h service window + consent (§2.4) ---
  /**
   * 24-hour service window (§2.4). Free-form sends are allowed only while
   * `now < serviceWindowExpiresAt`. Null = window never opened / already closed.
   */
  serviceWindowExpiresAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  /**
   * WhatsApp-level marketing consent, mirrored to the Contact (CRM source of
   * truth, [קטגוריה 4]). Detected here from STOP/START keywords (§2.4).
   */
  marketingOptIn: MarketingOptIn;
  optInSource: string | null;
  optInAt: Date | null;

  // --- Inbox / agent workflow ([קטגוריה 3]) ---
  status: ConversationStatus;
  priority: ConversationPriority;
  assigneeId: string | null;
  teamId: string | null;
  tags: string[];
  unreadCount: number;
  /** When false, the AI agent stays silent on this conversation (§3.5 / handoff). */
  aiEnabled: boolean;
  snoozedUntil: Date | null;
  lastMessageAt: Date | null;
  /** Short preview of the last message, for the conversation list (§3.1). */
  lastMessagePreview: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
  sla: ConversationSla | null;
}

// ---------------------------------------------------------------------------
// WhatsAppMessage (§2.2, §2.3)
// ---------------------------------------------------------------------------

export type MessageDirection = "inbound" | "outbound";

/** Who produced the message ([קטגוריה 3] §3.1/§3.3). */
export type MessageSender = "contact" | "agent" | "ai" | "system";

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "template"
  | "reaction"
  | "order"
  | "system"
  | "unsupported"
  | "unknown";

/** Outbound delivery lifecycle. Inbound messages have `status: null`. */
export type OutboundStatus =
  | "pending"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface WhatsAppMessageError {
  code: number;
  title: string;
  detail?: string;
}

export interface WhatsAppMessage extends BaseEntity {
  conversationId: string;
  /** Meta's `wamid` — the dedup key for inbound and the join key for status updates. */
  wamid: string | null;
  direction: MessageDirection;
  sender: MessageSender;
  /** Internal note ([קטגוריה 3] §3.3): visible to agents, never sent to the customer. */
  isInternalNote: boolean;
  from: string;
  to: string;
  type: MessageType;
  text: string | null;
  /** For interactive replies / quick-reply buttons: the selected id. */
  interactiveReplyId: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename?: string | null;
  /** Delivery state for outbound; null for inbound. */
  status: OutboundStatus | null;
  errors: WhatsAppMessageError[];
  /** Meta event timestamp (when known). */
  sentAt: Date | null;
  /** Original Meta payload fragment, kept for audit/debug. */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// ProcessedWebhookEvent (§2.2 dedup)
// ---------------------------------------------------------------------------

export interface ProcessedWebhookEvent extends BaseEntity {
  /** `wamid` for messages, `${wamid}:${status}` for status events. */
  eventId: string;
  kind: "message" | "status";
}
