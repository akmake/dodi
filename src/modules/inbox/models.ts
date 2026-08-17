/**
 * Inbox domain models — [קטגוריה 3].
 *
 * The Inbox is a workflow layer over the WhatsApp Conversation / Message
 * entities ([קטגוריה 2]); it does not redefine them. It owns only its own
 * artifacts — canned replies (§3.4). Internal notes (§3.3) are stored as
 * messages with `isInternalNote: true`.
 */
import type { BaseEntity } from "@/core/types";
import type { Conversation, WhatsAppMessage } from "@/modules/whatsapp/models";
import type { Contact } from "@/modules/contacts/models";

/** Reusable agent reply with variable substitution (§3.4). */
export interface CannedReply extends BaseEntity {
  scope: "personal" | "team";
  ownerId: string | null;
  teamId: string | null;
  title: string;
  /** Slash trigger, e.g. "/greeting". Unique per (tenant, scope owner). */
  shortcut: string;
  /** May contain `{{contact.first_name}}` style variables. */
  body: string;
  channel: "whatsapp" | null;
}

/** A conversation enriched with its customer card and recent messages (§3.1). */
export interface ConversationView {
  conversation: Conversation;
  contact: Contact | null;
  messages: WhatsAppMessage[];
}

/** A row in the conversation list (§3.1). */
export interface ConversationListItem {
  conversation: Conversation;
  contact: Contact | null;
}

export interface InboxFilters {
  status?: Conversation["status"];
  assigneeId?: string;
  /** "unassigned" → conversations with no assignee (the Unassigned pool, §3.1). */
  unassigned?: boolean;
  priority?: Conversation["priority"];
  tag?: string;
  limit?: number;
}

/** A saved, named filter over the conversation list (§3.1). */
export interface InboxView extends BaseEntity {
  name: string;
  filter: Omit<InboxFilters, "limit">;
  shared: boolean;
}

/** An @mention of an agent inside an internal note (§3.3). */
export interface Mention extends BaseEntity {
  conversationId: string;
  noteId: string;
  /** The mentioned agent's user id. */
  userId: string;
  /** Who wrote the note. */
  byUserId: string | null;
  text: string;
  read: boolean;
}
