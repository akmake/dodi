/**
 * WhatsApp service — the brain of [קטגוריה 2].
 *
 * Route handlers stay thin and call into here. Responsibilities:
 *   - verify the webhook handshake (§2.2 GET) and signature (§2.2 POST);
 *   - ingest inbound messages + status updates, with DB-backed dedup (§2.2);
 *   - maintain the 24-hour service window and opt-in/out (§2.4);
 *   - send outbound messages, enforcing the window BEFORE calling Meta (§2.3/§2.4).
 *
 * Tenancy: the inbound `phone_number_id` resolves to a tenant via
 * `core/tenant/context`; everything below is tenant-scoped by the repositories.
 */
import { config } from "@/core/config";
import { decryptSecret } from "@/core/crypto";
import { resolveTenantByPhoneNumberId } from "@/core/tenant/context";
import { emitEvent } from "@/modules/integrations";
import { incrementUsage } from "@/modules/billing";
import {
  WhatsAppApiError,
  WhatsAppClient,
  defaultClient,
  type DownloadedMedia,
  type InteractiveHeader,
  type ListSection,
  type MediaKind,
  type MediaPayload,
  type ReplyButton,
  type SendContext,
  type SendResult,
  type UploadedMedia,
} from "./client";
import type {
  Conversation,
  MarketingOptIn,
  MessageSender,
  MessageType,
  OutboundStatus,
  WhatsAppMessage,
  WhatsAppMessageError,
} from "./models";
import {
  ConversationRepository,
  MessageRepository,
  WebhookDedupRepository,
  WhatsAppAccountRepository,
  ensureWhatsAppIndexes,
} from "./repository";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Stop/start keywords for opt-out handling (§2.4). Hebrew + English. */
const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "cancel", "הסר", "הסרה", "ביטול", "עצור", "הפסק"];
const OPT_IN_KEYWORDS = ["start", "subscribe", "הצטרף", "אישור", "כן"];

/** Outbound status ordering — we never regress a status (events arrive unordered, §2.2). */
const STATUS_RANK: Record<OutboundStatus, number> = {
  pending: 0,
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

const accounts = new WhatsAppAccountRepository();
const conversations = new ConversationRepository();
const messages = new MessageRepository();
const dedup = new WebhookDedupRepository();

// ===========================================================================
// Webhook — GET handshake
// ===========================================================================

export function verifyHandshake(
  mode: string | null,
  token: string | null,
  challenge: string | null
): { ok: boolean; challenge?: string } {
  if (mode === "subscribe" && token && token === config.whatsapp.verifyToken) {
    return { ok: true, challenge: challenge ?? "" };
  }
  return { ok: false };
}

// ===========================================================================
// Webhook — POST processing
// ===========================================================================

/**
 * Summary of a processed inbound message, returned so the caller (webhook route)
 * can wire higher layers — Contacts sync ([קטגוריה 4]), AI agent ([קטגוריה 10]) —
 * WITHOUT this module depending on them (dependency points the other way).
 */
export interface InboundSummary {
  tenantId: string;
  conversationId: string;
  messageId: string;
  waId: string;
  phoneNumberId: string;
  profileName: string | null;
  text: string | null;
  /** Selected button/list id when the inbound is an interactive reply. */
  interactiveReplyId: string | null;
  optChange: MarketingOptIn | null;
  /** Cart order from a `messages[].order` event ([קטגוריה 20] §20.3), if any. */
  order: InboundOrder | null;
  /** Click-to-WhatsApp ad referral ([קטגוריה 21] §21.1), if this turn carried one. */
  referral: InboundReferral | null;
  sentAt: Date;
}

/** Parsed cart order from an inbound `order` message. Prices are minor units as Meta sends them. */
export interface InboundOrder {
  catalogId: string;
  text: string | null;
  productItems: Array<{ retailerId: string; quantity: number; itemPrice: number; currency: string }>;
}

/** Click-to-WhatsApp referral metadata Meta attaches to the first inbound after an ad click. */
export interface InboundReferral {
  sourceType: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  ctwaClid: string | null;
}

/** Raw `message_template_status_update` value — consumed by the Templates module (§19.2). */
export type RawTemplateStatusUpdate = Record<string, unknown>;

export type WebhookOutcome =
  | {
      ok: true;
      processed: number;
      inbound: InboundSummary[];
      templateUpdates: RawTemplateStatusUpdate[];
    }
  | { ok: false; reason: "invalid_signature" | "ignored" };

/**
 * Process a verified webhook delivery. The caller passes the RAW body (for the
 * signature check) and the parsed payload. Always returns — the route answers
 * Meta with 200 regardless, to avoid retry storms (§2.2). Failures here are
 * logged, not thrown to Meta.
 *
 * Webhook routes enqueue this work; job handlers call here asynchronously.
 */
export async function processWebhook(payload: unknown): Promise<WebhookOutcome> {
  const body = payload as MetaWebhookBody;
  if (body?.object !== "whatsapp_business_account") {
    return { ok: false, reason: "ignored" };
  }

  await ensureWhatsAppIndexes();

  let processed = 0;
  const inbound: InboundSummary[] = [];
  const templateUpdates: RawTemplateStatusUpdate[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "message_template_status_update") {
        if (change.value) templateUpdates.push(change.value as RawTemplateStatusUpdate);
        continue;
      }
      if (change.field !== "messages") continue;
      const value = change.value as MetaChangeValue;
      if (!value?.metadata?.phone_number_id) continue;

      const phoneNumberId = value.metadata.phone_number_id;
      const tenantId = await resolveTenantByPhoneNumberId(phoneNumberId);

      for (const msg of value.messages ?? []) {
        if (!(await dedup.markIfNew(tenantId, msg.id, "message"))) continue;
        try {
          inbound.push(await ingestInbound(tenantId, phoneNumberId, value, msg));
          processed++;
        } catch (err) {
          console.error("[whatsapp] inbound ingest failed", msg.id, err);
        }
      }

      for (const status of value.statuses ?? []) {
        const eventId = `${status.id}:${status.status}`;
        if (!(await dedup.markIfNew(tenantId, eventId, "status"))) continue;
        try {
          await applyStatus(tenantId, status);
          processed++;
        } catch (err) {
          console.error("[whatsapp] status update failed", status.id, err);
        }
      }
    }
  }

  return { ok: true, processed, inbound, templateUpdates };
}

async function ingestInbound(
  tenantId: string,
  phoneNumberId: string,
  value: MetaChangeValue,
  msg: MetaInboundMessage
): Promise<InboundSummary> {
  const from = String(msg.from);
  const profileName = value.contacts?.[0]?.profile?.name ?? null;
  const { type, text, interactiveReplyId, mediaId, mediaMimeType, mediaFilename } = extractInbound(msg);
  const order = extractOrder(msg);
  const referral = extractReferral(msg);
  const sentAt = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

  const conv = await conversations.getOrCreate(tenantId, phoneNumberId, from);

  // Refresh the 24h service window and contact name (§2.4). A new inbound message
  // re-opens a closed conversation ([קטגוריה 3] §3.2).
  const patch: Partial<Conversation> = {
    lastInboundAt: sentAt,
    lastMessageAt: sentAt,
    lastMessagePreview: preview(text, type),
    serviceWindowExpiresAt: new Date(Date.now() + SERVICE_WINDOW_MS),
    unreadCount: (conv.unreadCount ?? 0) + 1,
    status: "open",
  };
  if (conv.status === "closed") patch.closedAt = null;
  if (profileName && profileName !== conv.contactName) patch.contactName = profileName;

  // Opt-out / opt-in keyword handling.
  const optChange = detectOptChange(text);
  if (optChange) {
    patch.marketingOptIn = optChange;
    patch.optInSource = "keyword";
    patch.optInAt = sentAt;
  }

  await conversations.update(tenantId, conv.id, patch);

  const message = await messages.create(tenantId, {
    conversationId: conv.id,
    wamid: msg.id,
    direction: "inbound",
    sender: "contact",
    isInternalNote: false,
    from,
    to: phoneNumberId,
    type,
    text,
    interactiveReplyId,
    mediaId,
    mediaMimeType,
    mediaFilename,
    status: null,
    errors: [],
    sentAt,
    raw: msg,
  });

  return {
    tenantId,
    conversationId: conv.id,
    messageId: message.id,
    waId: from,
    phoneNumberId,
    profileName,
    text,
    interactiveReplyId,
    optChange,
    order,
    referral,
    sentAt,
  };
}

/** Parse a `messages[].order` cart event into our flat shape (§20.3). */
function extractOrder(msg: MetaInboundMessage): InboundOrder | null {
  const o = msg.order;
  if (!o || !Array.isArray(o.product_items) || o.product_items.length === 0) return null;
  return {
    catalogId: String(o.catalog_id ?? ""),
    text: typeof o.text === "string" ? o.text : null,
    productItems: o.product_items.map((p) => ({
      retailerId: String(p.product_retailer_id ?? ""),
      quantity: Number(p.quantity ?? 0),
      itemPrice: Number(p.item_price ?? 0),
      currency: String(p.currency ?? "ILS"),
    })),
  };
}

/** Parse the Click-to-WhatsApp `referral` block Meta attaches after an ad click (§21.1). */
function extractReferral(msg: MetaInboundMessage): InboundReferral | null {
  const r = msg.referral;
  if (!r) return null;
  return {
    sourceType: typeof r.source_type === "string" ? r.source_type : null,
    sourceId: typeof r.source_id === "string" ? r.source_id : null,
    sourceUrl: typeof r.source_url === "string" ? r.source_url : null,
    headline: typeof r.headline === "string" ? r.headline : null,
    body: typeof r.body === "string" ? r.body : null,
    ctwaClid: typeof r.ctwa_clid === "string" ? r.ctwa_clid : null,
  };
}

async function applyStatus(tenantId: string, status: MetaStatus): Promise<void> {
  const msg = await messages.findByWamid(tenantId, status.id);
  if (!msg) return; // status for a message we never stored (e.g. sent before the module went live)

  const next = status.status as OutboundStatus;
  // Never regress (events are unordered, §2.2) — but always record a failure.
  if (next !== "failed" && msg.status && STATUS_RANK[next] <= STATUS_RANK[msg.status]) {
    return;
  }

  const patch: Partial<WhatsAppMessage> = { status: next };
  if (status.timestamp) patch.sentAt = new Date(Number(status.timestamp) * 1000);
  if (next === "failed" && status.errors?.length) {
    patch.errors = status.errors.map(
      (e): WhatsAppMessageError => ({
        code: e.code,
        title: e.title,
        detail: e.error_data?.details ?? e.message,
      })
    );
  }
  await messages.update(tenantId, msg.id, patch);
}

// ===========================================================================
// Sending (§2.3 + §2.4 window enforcement)
// ===========================================================================

export interface SendOptions {
  /** Quote/reply to a previous inbound message. */
  replyToWamid?: string;
  /** Who is sending: an agent (default), the AI, or the system. ([קטגוריה 3] §3.1) */
  sender?: MessageSender;
}

/** Send a free-form text message. Blocked outside the 24h window (§2.4). */
export async function sendText(
  tenantId: string,
  to: string,
  body: string,
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, "text", { kind: "text", body }, opts);
}

/**
 * Send interactive reply buttons (≤3). Free-form → window-checked.
 * `extras` (redesign §6.2A) optionally adds a text/media header + footer so
 * "image + text + buttons" becomes ONE WhatsApp message. Omitting it = today's behavior.
 */
export async function sendButtons(
  tenantId: string,
  to: string,
  body: string,
  buttons: ReplyButton[],
  opts: SendOptions = {},
  extras?: { header?: InteractiveHeader; footer?: string }
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, "interactive", { kind: "buttons", body, buttons, header: extras?.header, footer: extras?.footer }, opts);
}

/** Send an interactive list/menu (≤10 rows across sections). Free-form → window-checked. */
export async function sendList(
  tenantId: string,
  to: string,
  body: string,
  buttonLabel: string,
  sections: ListSection[],
  opts: SendOptions = {},
  extras?: { header?: string; footer?: string }
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, "interactive", { kind: "list", body, buttonLabel, sections, header: extras?.header, footer: extras?.footer }, opts);
}

/** Send a location pin. Free-form → window-checked. */
export async function sendLocation(
  tenantId: string,
  to: string,
  loc: { latitude: number; longitude: number; name?: string; address?: string },
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, "location", { kind: "location", loc }, opts);
}

/** Send a single-product message from the catalog ([קטגוריה 20] §20.2). Window-checked. */
export async function sendProduct(
  tenantId: string,
  to: string,
  body: string,
  catalogId: string,
  retailerId: string,
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, "interactive", { kind: "product", body, catalogId, retailerId }, opts);
}

/** Send a multi-product (catalog) message ([קטגוריה 20] §20.2). Window-checked. */
export async function sendProductList(
  tenantId: string,
  to: string,
  input: { header: string; body: string; catalogId: string; sections: ProductSection[] },
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(
    tenantId,
    to,
    "interactive",
    { kind: "product_list", header: input.header, body: input.body, catalogId: input.catalogId, sections: input.sections },
    opts
  );
}

/** Send an approved template. Allowed regardless of the service window (§2.4). */
export async function sendTemplate(
  tenantId: string,
  to: string,
  name: string,
  languageCode: string,
  components?: unknown[],
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(
    tenantId,
    to,
    "template",
    { kind: "template", name, languageCode, components },
    opts
  );
}

/** Send image/video/audio/document media. Free-form → window-checked. */
export async function sendMedia(
  tenantId: string,
  to: string,
  kind: MediaKind,
  media: MediaPayload,
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, kind, { kind: "media", mediaKind: kind, media }, opts);
}

export interface WhatsAppFlowMessageInput {
  flowId: string;
  flowToken: string;
  cta: string;
  body: string;
  header?: string;
  footer?: string;
  action?: "navigate" | "data_exchange";
  screen?: string;
  data?: Record<string, unknown>;
}

/** Send a native WhatsApp Flow message ([קטגוריה 9]). */
export async function sendWhatsAppFlow(
  tenantId: string,
  to: string,
  input: WhatsAppFlowMessageInput,
  opts: SendOptions = {}
): Promise<WhatsAppMessage> {
  return dispatch(tenantId, to, "interactive", { kind: "flow", input }, opts);
}

/** Upload media to Meta and get a reusable media id (§2.5). */
export async function uploadMedia(
  tenantId: string,
  file: Blob,
  filename: string,
  mimeType: string
): Promise<UploadedMedia> {
  const { client } = await resolveClient(tenantId);
  return client.uploadMedia(file, filename, mimeType);
}

/** Download a media object from Meta via its temporary URL (§2.5). */
export async function downloadMedia(tenantId: string, mediaId: string): Promise<DownloadedMedia> {
  const { client } = await resolveClient(tenantId);
  return client.downloadMedia(mediaId);
}

/** Download media attached to a stored message, with tenant scoping. */
export async function downloadMessageMedia(
  tenantId: string,
  messageId: string
): Promise<DownloadedMedia & { filename: string | null }> {
  const msg = await messages.findById(tenantId, messageId);
  if (!msg?.mediaId) throw new Error("message has no media");
  const media = await downloadMedia(tenantId, msg.mediaId);
  return { ...media, filename: msg.mediaFilename ?? media.filename };
}

type OutgoingPayload =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: ReplyButton[]; header?: InteractiveHeader; footer?: string }
  | { kind: "list"; body: string; buttonLabel: string; sections: ListSection[]; header?: string; footer?: string }
  | { kind: "location"; loc: { latitude: number; longitude: number; name?: string; address?: string } }
  | { kind: "template"; name: string; languageCode: string; components?: unknown[] }
  | { kind: "media"; mediaKind: MediaKind; media: MediaPayload }
  | { kind: "flow"; input: WhatsAppFlowMessageInput }
  | { kind: "product"; body: string; catalogId: string; retailerId: string }
  | { kind: "product_list"; header: string; body: string; catalogId: string; sections: ProductSection[] };

/** A section of a multi-product message ([קטגוריה 20] §20.2). */
export interface ProductSection {
  title: string;
  productRetailerIds: string[];
}

async function dispatch(
  tenantId: string,
  to: string,
  type: MessageType,
  payload: OutgoingPayload,
  opts: SendOptions
): Promise<WhatsAppMessage> {
  await ensureWhatsAppIndexes();

  const { client, phoneNumberId } = await resolveClient(tenantId);
  const conv = await conversations.getOrCreate(tenantId, phoneNumberId, to);

  // §2.4: free-form sends require an open window; only templates bypass it.
  // Enforce BEFORE calling Meta so we never burn an API call on a guaranteed 131047.
  if (payload.kind !== "template" && !windowOpen(conv)) {
    throw new WhatsAppApiError(
      131047,
      "Outside the 24-hour service window — only an approved template may be sent.",
      `conversation=${conv.id}`
    );
  }

  const context: SendContext | undefined = opts.replyToWamid
    ? { replyToWamid: opts.replyToWamid }
    : undefined;
  const sender: MessageSender = opts.sender ?? "agent";

  let result: SendResult;
  const bodyText =
    payload.kind === "template"
      ? null
      : payload.kind === "media"
      ? payload.media.caption ?? null
      : payload.kind === "flow"
      ? payload.input.body
      : payload.kind === "location"
      ? payload.loc.name ?? payload.loc.address ?? null
      : payload.body;
  try {
    result = await sendVia(client, to, payload, context);
  } catch (err) {
    // Persist the failed attempt so it shows in the Inbox ([קטגוריה 3]).
    const apiErr = err instanceof WhatsAppApiError ? err : null;
    await messages.create(tenantId, {
      conversationId: conv.id,
      wamid: null,
      direction: "outbound",
      sender,
      isInternalNote: false,
      from: phoneNumberId,
      to,
      type,
      text: bodyText,
      interactiveReplyId: null,
      mediaId: payload.kind === "media" ? payload.media.id ?? null : null,
      mediaMimeType: payload.kind === "media" ? payload.media.mimeType ?? null : null,
      mediaFilename: payload.kind === "media" ? payload.media.filename ?? null : null,
      status: "failed",
      errors: apiErr
        ? [{ code: apiErr.code, title: apiErr.title, detail: apiErr.detail }]
        : [{ code: 0, title: String(err) }],
      sentAt: new Date(),
      raw: null,
    });
    throw err;
  }

  const now = new Date();
  const message = await messages.create(tenantId, {
    conversationId: conv.id,
    wamid: result.wamid,
    direction: "outbound",
    sender,
    isInternalNote: false,
    from: phoneNumberId,
    to,
    type,
    text: bodyText,
    interactiveReplyId: null,
    mediaId: payload.kind === "media" ? payload.media.id ?? null : null,
    mediaMimeType: payload.kind === "media" ? payload.media.mimeType ?? null : null,
    mediaFilename: payload.kind === "media" ? payload.media.filename ?? null : null,
    status: "accepted",
    errors: [],
    sentAt: now,
    raw: result.raw,
  });

  await conversations.update(tenantId, conv.id, {
    lastOutboundAt: now,
    lastMessageAt: now,
    lastMessagePreview: preview(bodyText, type),
  });

  // Outbound webhook fan-out (§22.2). Fire-and-forget — never blocks the send.
  void emitEvent(tenantId, "message_sent", {
    conversation_id: conv.id,
    message: { id: message.id, wa_id: result.wamid, to, type, text: bodyText },
    sender,
  });
  // Meter outbound usage against the plan quota ([25.6]). Fire-and-forget.
  void incrementUsage(tenantId, "messages_out").catch(() => {});
  return message;
}

function sendVia(
  client: WhatsAppClient,
  to: string,
  payload: OutgoingPayload,
  context?: SendContext
): Promise<SendResult> {
  switch (payload.kind) {
    case "text":
      return client.sendText(to, payload.body, context);
    case "buttons":
      return client.sendButtons(to, payload.body, payload.buttons, context,
        (payload.header || payload.footer) ? { header: payload.header, footer: payload.footer } : undefined);
    case "list":
      return client.sendList(to, payload.body, payload.buttonLabel, payload.sections, context,
        (payload.header || payload.footer) ? { header: payload.header, footer: payload.footer } : undefined);
    case "location":
      return client.send({ to, type: "location", location: payload.loc }, context);
    case "template":
      return client.sendTemplate(to, payload.name, payload.languageCode, payload.components, context);
    case "media":
      return client.sendMedia(to, payload.mediaKind, payload.media, context);
    case "flow":
      return client.send(flowPayload(to, payload.input), context);
    case "product":
      return client.send(
        {
          to,
          type: "interactive",
          interactive: {
            type: "product",
            body: { text: payload.body },
            action: { catalog_id: payload.catalogId, product_retailer_id: payload.retailerId },
          },
        },
        context
      );
    case "product_list":
      return client.send(
        {
          to,
          type: "interactive",
          interactive: {
            type: "product_list",
            header: { type: "text", text: payload.header },
            body: { text: payload.body },
            action: {
              catalog_id: payload.catalogId,
              sections: payload.sections.map((s) => ({
                title: s.title,
                product_items: s.productRetailerIds.map((id) => ({ product_retailer_id: id })),
              })),
            },
          },
        },
        context
      );
  }
}

function flowPayload(to: string, input: WhatsAppFlowMessageInput): Record<string, unknown> {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      ...(input.header ? { header: { type: "text", text: input.header } } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: input.flowId,
          flow_token: input.flowToken,
          flow_cta: input.cta,
          flow_action: input.action ?? "navigate",
          flow_action_payload: {
            ...(input.screen ? { screen: input.screen } : {}),
            ...(input.data ? { data: input.data } : {}),
          },
        },
      },
    },
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function windowOpen(conv: Conversation): boolean {
  return !!conv.serviceWindowExpiresAt && conv.serviceWindowExpiresAt.getTime() > Date.now();
}

/** A short, list-friendly preview of a message for the conversation list (§3.1). */
function preview(text: string | null, type: MessageType): string {
  if (text && text.trim()) return text.trim().slice(0, 120);
  const labels: Partial<Record<MessageType, string>> = {
    image: "📷 תמונה",
    video: "🎥 וידאו",
    audio: "🎙️ הודעה קולית",
    document: "📎 מסמך",
    sticker: "סטיקר",
    location: "📍 מיקום",
    template: "תבנית",
    interactive: "כפתורים",
  };
  return labels[type] ?? "הודעה";
}

/**
 * Resolve the Meta client for a tenant.
 * Prefers a persisted account (multi-tenant, encrypted token); falls back to the
 * env-config single-tenant client — the bridge until onboarding ([§2.1]) lands.
 */
async function resolveClient(
  tenantId: string
): Promise<{ client: WhatsAppClient; phoneNumberId: string }> {
  const account = await accounts.findByPhoneNumberId(
    tenantId,
    config.whatsapp.phoneNumberId
  );
  if (account) {
    return {
      client: new WhatsAppClient({
        apiVersion: config.whatsapp.apiVersion,
        phoneNumberId: account.phoneNumberId,
        accessToken: decryptSecret(account.accessToken),
      }),
      phoneNumberId: account.phoneNumberId,
    };
  }
  return { client: defaultClient(), phoneNumberId: config.whatsapp.phoneNumberId };
}

function detectOptChange(text: string | null): MarketingOptIn | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (OPT_OUT_KEYWORDS.some((k) => t === k || t.startsWith(`${k} `))) return "opted_out";
  if (OPT_IN_KEYWORDS.some((k) => t === k || t.startsWith(`${k} `))) return "opted_in";
  return null;
}

interface ExtractedInbound {
  type: MessageType;
  text: string | null;
  interactiveReplyId: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
}

/** Normalize the many inbound shapes into our flat Message fields (§2.2). */
function extractInbound(msg: MetaInboundMessage): ExtractedInbound {
  const base: ExtractedInbound = {
    type: (msg.type as MessageType) ?? "unknown",
    text: null,
    interactiveReplyId: null,
    mediaId: null,
    mediaMimeType: null,
    mediaFilename: null,
  };

  switch (msg.type) {
    case "text":
      return { ...base, text: msg.text?.body ?? null };
    case "interactive": {
      const i = msg.interactive;
      if (i?.type === "button_reply") {
        return { ...base, interactiveReplyId: i.button_reply?.id ?? null, text: i.button_reply?.title ?? null };
      }
      if (i?.type === "list_reply") {
        return { ...base, interactiveReplyId: i.list_reply?.id ?? null, text: i.list_reply?.title ?? null };
      }
      return base;
    }
    case "button": // template quick-reply
      return { ...base, interactiveReplyId: msg.button?.payload ?? null, text: msg.button?.text ?? null };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const media = msg[msg.type] as MetaMedia | undefined;
      return {
        ...base,
        text: media?.caption ?? null,
        mediaId: media?.id ?? null,
        mediaMimeType: media?.mime_type ?? null,
        mediaFilename: media?.filename ?? null,
      };
    }
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Meta webhook payload shapes (only the fields we consume; §2.2)
// ---------------------------------------------------------------------------

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; changes?: MetaChange[] }>;
}

interface MetaChange {
  field?: string;
  value?: MetaChangeValue;
}

interface MetaChangeValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: MetaInboundMessage[];
  statuses?: MetaStatus[];
}

interface MetaMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

interface MetaInboundMessage {
  from: string;
  id: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  button?: { text?: string; payload?: string };
  image?: MetaMedia;
  video?: MetaMedia;
  audio?: MetaMedia;
  document?: MetaMedia;
  sticker?: MetaMedia;
  order?: MetaOrder;
  referral?: MetaReferral;
  [key: string]: unknown;
}

interface MetaOrder {
  catalog_id?: string;
  text?: string;
  product_items?: Array<{
    product_retailer_id?: string;
    quantity?: string | number;
    item_price?: string | number;
    currency?: string;
  }>;
}

interface MetaReferral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}
