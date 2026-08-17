/**
 * Inbox service — [קטגוריה 3].
 *
 * The agent workspace. Reads/manages conversations and messages owned by the
 * WhatsApp module, joins the customer card from Contacts, and sends agent
 * replies through the WhatsApp send path (which enforces the 24h window).
 */
import type { Filter } from "mongodb";
import {
  ConversationRepository,
  MessageRepository,
} from "@/modules/whatsapp/repository";
import { sendText } from "@/modules/whatsapp/service";
import type { Conversation, WhatsAppMessage } from "@/modules/whatsapp/models";
import { ContactRepository } from "@/modules/contacts/repository";
import type { Contact } from "@/modules/contacts/models";
import { fireAutomationEvent } from "@/modules/triggers/events";
import { listUsers } from "@/modules/admin/service";
import type {
  CannedReply,
  ConversationListItem,
  ConversationView,
  InboxFilters,
  InboxView,
  Mention,
} from "./models";
import {
  CannedReplyRepository,
  InboxViewRepository,
  MentionRepository,
  ensureInboxIndexes,
} from "./repository";

const conversations = new ConversationRepository();
const messages = new MessageRepository();
const contacts = new ContactRepository();
const cannedReplies = new CannedReplyRepository();
const inboxViews = new InboxViewRepository();
const mentions = new MentionRepository();

// ===========================================================================
// Conversation list + view (§3.1)
// ===========================================================================

export async function listConversations(
  tenantId: string,
  filters: InboxFilters = {}
): Promise<ConversationListItem[]> {
  const filter: Record<string, unknown> = {};
  if (filters.status) filter.status = filters.status;
  if (filters.priority) filter.priority = filters.priority;
  if (filters.tag) filter.tags = filters.tag;
  if (filters.unassigned) filter.assigneeId = null;
  else if (filters.assigneeId) filter.assigneeId = filters.assigneeId;

  const convs = await conversations.list(
    tenantId,
    filter as Filter<Conversation>,
    filters.limit ?? 50
  );

  const contactById = await loadContacts(tenantId, convs);
  return convs.map((conversation) => ({
    conversation,
    contact: conversation.contactId ? contactById.get(conversation.contactId) ?? null : null,
  }));
}

export async function getConversationView(
  tenantId: string,
  conversationId: string,
  messageLimit = 50
): Promise<ConversationView | null> {
  const conversation = await conversations.findById(tenantId, conversationId);
  if (!conversation) return null;

  const [msgs, contact] = await Promise.all([
    messages.listByConversation(tenantId, conversationId, messageLimit),
    conversation.contactId ? contacts.findById(tenantId, conversation.contactId) : null,
  ]);

  // Oldest-first for display.
  msgs.reverse();
  return { conversation, contact, messages: msgs };
}

async function loadContacts(
  tenantId: string,
  convs: Conversation[]
): Promise<Map<string, Contact>> {
  const ids = [...new Set(convs.map((c) => c.contactId).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const list = await contacts.findMany(tenantId, { id: { $in: ids } } as Filter<Contact>);
  return new Map(list.map((c) => [c.id, c]));
}

// ===========================================================================
// Workflow: assignment, status, priority, tags, AI toggle (§3.2, §3.5)
// ===========================================================================

export function markRead(tenantId: string, conversationId: string) {
  return conversations.update(tenantId, conversationId, { unreadCount: 0 });
}

export function assign(tenantId: string, conversationId: string, assigneeId: string | null) {
  return conversations.update(tenantId, conversationId, { assigneeId });
}

export async function setStatus(
  tenantId: string,
  conversationId: string,
  status: Conversation["status"]
) {
  const patch: Partial<Conversation> = { status };
  if (status === "closed") patch.closedAt = new Date();
  if (status === "open") {
    patch.openedAt = new Date();
    patch.closedAt = null;
    patch.snoozedUntil = null;
  }
  if (status !== "snoozed") patch.snoozedUntil = null;
  const updated = await conversations.update(tenantId, conversationId, patch);
  if (updated && (status === "open" || status === "closed")) {
    await fireAutomationEvent(tenantId, {
      type: status === "open" ? "conversation_opened" : "conversation_closed",
      conversationId,
      waId: updated.waId,
      payload: { status },
    });
  }
  return updated;
}

export function snooze(tenantId: string, conversationId: string, until: Date) {
  return conversations.update(tenantId, conversationId, {
    status: "snoozed",
    snoozedUntil: until,
  });
}

export function setPriority(
  tenantId: string,
  conversationId: string,
  priority: Conversation["priority"]
) {
  return conversations.update(tenantId, conversationId, { priority });
}

export async function addTag(tenantId: string, conversationId: string, tag: string) {
  const conv = await conversations.findById(tenantId, conversationId);
  if (!conv) return null;
  if (conv.tags.includes(tag)) return conv;
  return conversations.update(tenantId, conversationId, { tags: [...conv.tags, tag] });
}

export async function removeTag(tenantId: string, conversationId: string, tag: string) {
  const conv = await conversations.findById(tenantId, conversationId);
  if (!conv) return null;
  return conversations.update(tenantId, conversationId, {
    tags: conv.tags.filter((t) => t !== tag),
  });
}

/** Mute/unmute the AI on this conversation (§3.5 / handoff). */
export function setAiEnabled(tenantId: string, conversationId: string, enabled: boolean) {
  return conversations.update(tenantId, conversationId, { aiEnabled: enabled });
}

// ===========================================================================
// Replies + internal notes (§3.1, §3.3)
// ===========================================================================

/** Send an agent reply to the customer. Refuses if the contact is blocked (§4.4). */
export async function reply(
  tenantId: string,
  conversationId: string,
  body: string,
  agentId?: string
): Promise<WhatsAppMessage> {
  const conv = await conversations.findById(tenantId, conversationId);
  if (!conv) throw new Error("conversation not found");

  if (conv.contactId) {
    const contact = await contacts.findById(tenantId, conv.contactId);
    if (contact?.status === "blocked") {
      throw new Error("contact is blocked — outbound refused");
    }
  }

  const message = await sendText(tenantId, conv.waId, body, { sender: "agent" });
  if (agentId && conv.assigneeId !== agentId) {
    // Replying takes ownership if unassigned (soft assignment).
    if (!conv.assigneeId) await conversations.update(tenantId, conversationId, { assigneeId: agentId });
  }
  return message;
}

/** Add an internal note — agent-only, never sent to the customer (§3.3). */
export async function addInternalNote(
  tenantId: string,
  conversationId: string,
  body: string,
  agentId?: string
): Promise<WhatsAppMessage | null> {
  const conv = await conversations.findById(tenantId, conversationId);
  if (!conv) return null;

  const now = new Date();
  const note = await messages.create(tenantId, {
    conversationId,
    wamid: null,
    direction: "outbound",
    sender: "agent",
    isInternalNote: true,
    from: agentId ?? "agent",
    to: conv.waId,
    type: "text",
    text: body,
    interactiveReplyId: null,
    mediaId: null,
    mediaMimeType: null,
    status: null,
    errors: [],
    sentAt: now,
    raw: null,
  });
  await conversations.update(tenantId, conversationId, { lastMessageAt: now });

  // Resolve @mentions in the note → notify the mentioned agents (§3.3).
  await createMentions(tenantId, conversationId, note.id, body, agentId ?? null);
  return note;
}

// ===========================================================================
// @mentions (§3.3)
// ===========================================================================

/** Slugify a user's display identity so `@yosef` matches "Yosef Dahan". */
function userSlug(u: { name: string | null; email: string }): string {
  return (u.name ?? u.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Parse `@token` handles in a note and create a Mention per matched agent. */
async function createMentions(
  tenantId: string,
  conversationId: string,
  noteId: string,
  body: string,
  byUserId: string | null
): Promise<void> {
  const handles = [...body.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1].toLowerCase());
  if (!handles.length) return;
  const users = await listUsers(tenantId);
  const targeted = new Set<string>();
  for (const handle of handles) {
    const user = users.find((u) => userSlug(u) === handle || u.id === handle);
    if (user && user.id !== byUserId) targeted.add(user.id);
  }
  for (const userId of targeted) {
    // The Mention row IS the notification — surfaced via listMentions + the
    // unread badge. (Automation triggers are a separate taxonomy.)
    await mentions.create(tenantId, { conversationId, noteId, userId, byUserId, text: body, read: false });
  }
}

export function listMentions(tenantId: string, userId: string, unreadOnly = false): Promise<Mention[]> {
  return mentions.listForUser(tenantId, userId, unreadOnly);
}

export async function markMentionRead(tenantId: string, id: string): Promise<Mention | null> {
  return mentions.update(tenantId, id, { read: true });
}

// ===========================================================================
// Saved views (§3.1)
// ===========================================================================

export function listInboxViews(tenantId: string): Promise<InboxView[]> {
  return inboxViews.findMany(tenantId);
}

export function createInboxView(
  tenantId: string,
  input: { name: string; filter: InboxView["filter"]; shared?: boolean }
): Promise<InboxView> {
  return inboxViews.create(tenantId, { name: input.name, filter: input.filter ?? {}, shared: input.shared ?? true });
}

export function deleteInboxView(tenantId: string, id: string): Promise<boolean> {
  return inboxViews.delete(tenantId, id);
}

// ===========================================================================
// Canned replies (§3.4)
// ===========================================================================

export async function createCannedReply(
  tenantId: string,
  input: Omit<CannedReply, "id" | "tenantId" | "createdAt" | "updatedAt">
): Promise<CannedReply> {
  await ensureInboxIndexes();
  return cannedReplies.create(tenantId, input);
}

export function listCannedReplies(tenantId: string) {
  return cannedReplies.findMany(tenantId);
}

/** Substitute `{{contact.*}}` variables in a canned reply body. */
export function renderCannedReply(body: string, contact: Contact | null): string {
  const vars: Record<string, string> = {
    "contact.first_name": contact?.firstName ?? "",
    "contact.last_name": contact?.lastName ?? "",
    "contact.phone": contact?.phone ?? "",
    "contact.email": contact?.email ?? "",
  };
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

export { ensureInboxIndexes };
