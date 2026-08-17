/**
 * Inbound automation pipeline — the bot's brain.
 *
 * Orchestrates the lower modules on every inbound message, in priority order:
 *   1. If a flow run is waiting on this conversation → resume it ([קטגוריה 8]).
 *   2. Else match a Trigger ([קטגוריה 6]) / flow keyword → start that flow.
 *   3. Else let the AI agent answer from the Knowledge Base ([קטגוריה 10/12]).
 *
 * Skipped entirely when `aiEnabled` is false — i.e. a human has taken over or
 * the conversation was handed off ([קטגוריה 3.5/14]). Each stage is isolated so
 * a failure never breaks webhook ingestion.
 *
 * Lives in its own module so the WhatsApp webhook stays a thin composition point
 * and no lower module depends on a higher one.
 */
import { ConversationRepository, MessageRepository } from "@/modules/whatsapp/repository";
import type { InboundSummary } from "@/modules/whatsapp/service";
import type { Conversation } from "@/modules/whatsapp/models";
import type { Contact } from "@/modules/contacts/models";
import { handback } from "@/modules/handoff";
import {
  FlowRepository,
  resumeActive,
  startFlow,
  tryStartByKeyword,
  type RunContext,
} from "@/modules/flows";
import { matchInbound } from "@/modules/triggers";
import { respond, analyze } from "@/modules/ai";
import type { NluResult } from "@/modules/ai";
import { track } from "@/modules/analytics/events";
import { emitEvent } from "@/modules/integrations";
import { ingestWhatsAppOrder } from "@/modules/ecommerce";
import { captureLead } from "@/modules/leads";
import { logError, logEvent } from "@/core/logs";

const conversations = new ConversationRepository();
const messages = new MessageRepository();
const flows = new FlowRepository();

export async function handleInbound(summary: InboundSummary, contact: Contact | null): Promise<void> {
  const { tenantId, conversationId } = summary;

  const conversation = await conversations.findById(tenantId, conversationId);
  if (!conversation) return;

  void track(tenantId, "message_in", {
    conversationId,
    contactId: contact?.id ?? null,
    attributes: { interactive: !!summary.interactiveReplyId },
  });
  void emitEvent(tenantId, "message_received", {
    conversation_id: conversationId,
    contact: { wa_id: summary.waId, name: summary.profileName },
    message: { id: summary.messageId, text: summary.text },
  });

  // Click-to-WhatsApp ad referral → capture a lead (§21.1). Non-blocking: the
  // customer's text still flows on to the AI/flow below. Lead dedup lives in
  // captureLead, so re-sends on the same open lead are harmless.
  if (summary.referral && contact) {
    try {
      await captureLead(tenantId, {
        contactId: contact.id,
        source: "ctwa_ad",
        sourceMeta: {
          adId: summary.referral.sourceId ?? undefined,
          referrer: summary.referral.sourceUrl ?? undefined,
          headline: summary.referral.headline ?? undefined,
          ctwaClid: summary.referral.ctwaClid ?? undefined,
          sourceType: summary.referral.sourceType ?? undefined,
        },
      });
    } catch (err) {
      logError(tenantId, "pipeline", "כשל בלכידת ליד מפרסומת (CTWA)", err, { conversationId });
    }
  }

  // Cart order (§20.3) → record it, then stop: an order carries no text/intent
  // for the trigger/AI stages, and acknowledging it is the merchant flow's job.
  if (summary.order) {
    try {
      await ingestWhatsAppOrder(tenantId, {
        contactId: contact?.id ?? null,
        conversationId,
        catalogId: summary.order.catalogId,
        productItems: summary.order.productItems,
      });
    } catch (err) {
      logError(tenantId, "pipeline", "כשל בקליטת הזמנה מהעגלה", err, { conversationId });
    }
    return;
  }

  // A human is handling / handed off → automation stays silent (§3.5).
  // BUT an automatic escalation (e.g. the AI had no grounded answer) also mutes the
  // AI, and nothing re-enables it — so the bot would stay silent forever even when
  // no human ever picked up (the "הבוט נשבר ומפסיק לענות" report). Auto-handback:
  // if the AI is muted but no agent has actually replied, wake it up on this inbound
  // and let it handle the message. A real human takeover is respected (stays muted).
  if (!conversation.aiEnabled) {
    const revived = await tryAutoHandback(tenantId, conversation);
    if (!revived) return;
    conversation.aiEnabled = true;
  }

  const ctx: RunContext = {
    conversation,
    contact,
    input: {
      text: summary.text ?? "",
      buttonReplyId: summary.interactiveReplyId ?? undefined,
    },
  };

  // 1. Resume a waiting flow (no NLU cost on this fast path).
  try {
    const resumed = await resumeActive(tenantId, conversationId, ctx);
    if (resumed) return;
  } catch (err) {
    logError(tenantId, "pipeline", "כשל בחידוש תהליך שיחה ממתין", err, { conversationId });
  }

  // NLU once per turn — feeds intent triggers AND the AI (avoids a second call).
  let nlu: NluResult | undefined;
  if (summary.text?.trim()) {
    try {
      nlu = await analyze(summary.text);
    } catch (err) {
      // Non-fatal — triggers/AI fall back to defaults — but worth seeing if the
      // NLU provider is down (a silent cause of "the bot stopped understanding").
      logEvent(tenantId, { level: "warn", source: "pipeline", message: "ניתוח NLU נכשל (נפילה לברירת מחדל)", detail: err instanceof Error ? err.message : String(err), context: { conversationId } });
    }
  }

  // 2. Start a flow via trigger (incl. intent) or keyword.
  try {
    const flowId = await matchInbound(
      tenantId,
      { text: summary.text, buttonReplyId: summary.interactiveReplyId, intent: nlu?.intent },
      {
        contact: (contact as unknown as Record<string, unknown>) ?? null,
        conversation: conversation as unknown as Record<string, unknown>,
        message: { text: summary.text ?? "", buttonReplyId: summary.interactiveReplyId },
        now: new Date(),
        ai: nlu ? { intent: nlu.intent, sentiment: nlu.sentiment, urgency: nlu.urgency } : undefined,
      }
    );
    if (flowId) {
      const flow = await flows.findById(tenantId, flowId);
      if (flow) {
        await startFlow(tenantId, flow, ctx);
        return;
      }
    }
    if (summary.text && (await tryStartByKeyword(tenantId, summary.text, ctx))) return;
  } catch (err) {
    logError(tenantId, "pipeline", "כשל בהפעלת טריגר / תהליך שיחה", err, { conversationId });
  }

  // 3. AI fallback — only if there's text to answer (reuses the NLU read).
  if (!summary.text?.trim()) return;
  try {
    await respond(tenantId, conversation, contact, summary.text, nlu);
    void track(tenantId, "ai_answer", {
      conversationId,
      contactId: contact?.id ?? null,
      attributes: { intent: nlu?.intent ?? null, sentiment: nlu?.sentiment ?? null },
    });
  } catch (err) {
    logError(tenantId, "pipeline", "כשל בתגובת ה-AI מהידע", err, { conversationId });
  }
}

/**
 * Re-enable the AI on a conversation that an automatic escalation muted but no
 * human ever answered. Returns true if the bot was revived. Any real agent reply
 * (an outbound message with sender "agent") means a human is handling it, so we
 * leave it muted and respect the handoff.
 */
async function tryAutoHandback(tenantId: string, conversation: Conversation): Promise<boolean> {
  try {
    const recent = await messages.listByConversation(tenantId, conversation.id, 50);
    const humanReplied = recent.some((m) => m.direction === "outbound" && m.sender === "agent");
    if (humanReplied) return false;
    await handback(tenantId, conversation.id);
    return true;
  } catch (err) {
    logError(tenantId, "pipeline", "כשל בהחזרת הבוט לפעולה (auto-handback)", err, { conversationId: conversation.id });
    return false;
  }
}
