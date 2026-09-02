/**
 * Async WhatsApp webhook jobs (B3).
 *
 * The public Meta route only verifies the signature and writes a queue job.
 * The heavy work runs here through `/api/jobs/drain`, with retries and failed
 * jobs retained by `core/jobs`.
 */
import { enqueue } from "@/core/jobs";
import { defaultTenantId } from "@/core/tenant/context";
import { logError, logEvent } from "@/core/logs";
import { emitEvent } from "@/modules/integrations";
import { syncFromInbound } from "@/modules/contacts";
import { processWebhook, type InboundSummary, type RawTemplateStatusUpdate } from "@/modules/whatsapp/service";
import { applyStatusUpdate, type TemplateStatusUpdate } from "@/modules/templates";
import { handleInbound } from "./index";

export async function processQueuedWebhook(payload: unknown): Promise<void> {
  const outcome = await processWebhook(payload);
  if (!outcome.ok) {
    logEvent(defaultTenantId(), { level: "warn", source: "webhook", message: "webhook (בתור) נדחה", detail: outcome.reason });
    return;
  }

  for (const summary of outcome.inbound) {
    await enqueue(summary.tenantId, "whatsapp.inbound", { summary });
  }

  for (const update of outcome.templateUpdates) {
    await applyTemplateUpdate(update);
  }
}

export async function processQueuedInbound(payload: unknown): Promise<void> {
  const summary = coerceInboundSummary(payload);
  const contact = await syncFromInbound(summary);
  await handleInbound(summary, contact);
}

/**
 * Synchronous webhook processing for serverless without a sub-minute cron
 * (e.g. Vercel Hobby, whose crons run only daily). Does inline what the two
 * queued stages do, so the bot replies immediately instead of waiting for the
 * next `/api/jobs/drain`. Mongo dedup (`markIfNew`) keeps it idempotent across
 * Meta's retries. Timer-based work (flow `delay`/`wait_reply` timeouts) still
 * goes through the queue + drain.
 */
export async function processWebhookInline(payload: unknown): Promise<void> {
  const outcome = await processWebhook(payload);
  if (!outcome.ok) {
    logEvent(defaultTenantId(), { level: "warn", source: "webhook", message: "webhook נדחה (לא עובד)", detail: outcome.reason });
    return;
  }
  for (const summary of outcome.inbound) {
    try {
      const contact = await syncFromInbound(summary);
      await handleInbound(summary, contact);
    } catch (err) {
      logError(summary.tenantId, "webhook", "כשל בעיבוד הודעה נכנסת", err, { conversationId: summary.conversationId });
    }
  }
  for (const update of outcome.templateUpdates) {
    await applyTemplateUpdate(update);
  }
}

function coerceInboundSummary(payload: unknown): InboundSummary {
  const raw = isRecord(payload) && isRecord(payload.summary) ? payload.summary : payload;
  if (!isRecord(raw)) throw new Error("invalid whatsapp.inbound payload");

  return {
    tenantId: str(raw.tenantId, "tenantId"),
    conversationId: str(raw.conversationId, "conversationId"),
    messageId: str(raw.messageId, "messageId"),
    waId: str(raw.waId, "waId"),
    phoneNumberId: str(raw.phoneNumberId, "phoneNumberId"),
    profileName: nullableString(raw.profileName),
    text: nullableString(raw.text),
    interactiveReplyId: nullableString(raw.interactiveReplyId),
    optChange: raw.optChange === "opted_in" || raw.optChange === "opted_out" ? raw.optChange : null,
    order: (raw.order as InboundSummary["order"]) ?? null,
    referral: (raw.referral as InboundSummary["referral"]) ?? null,
    sentAt: raw.sentAt instanceof Date ? raw.sentAt : new Date(String(raw.sentAt)),
  };
}

async function applyTemplateUpdate(update: RawTemplateStatusUpdate): Promise<void> {
  const tenantId = defaultTenantId();
  await applyStatusUpdate(tenantId, update as TemplateStatusUpdate);
  // External webhook fan-out (§22.2) so subscribers learn of approvals/rejections.
  void emitEvent(tenantId, "template_status_update", {
    template_name: update.message_template_name ?? null,
    language: update.message_template_language ?? null,
    event: update.event ?? null,
    reason: update.reason ?? null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown, field: string): string {
  if (typeof value === "string" && value) return value;
  throw new Error(`invalid whatsapp.inbound payload: ${field}`);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
