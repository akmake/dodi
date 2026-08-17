/**
 * Event-trigger runner (C2).
 *
 * Turns non-message events (CRM updates, segment enter/exit, public webhooks)
 * into Flow starts. Message/intent triggers still run in the inbound pipeline.
 */
import { config } from "@/core/config";
import { evaluate, type EvaluationContext } from "@/modules/conditions";
import { ContactRepository } from "@/modules/contacts/repository";
import { ConversationRepository } from "@/modules/whatsapp/repository";
import type { Contact } from "@/modules/contacts/models";
import type { Conversation } from "@/modules/whatsapp/models";
import type { Trigger } from "./models";
import { findWebhookTrigger, matchingEventTriggers, type TriggerEvent } from "./service";

const contacts = new ContactRepository();
const conversations = new ConversationRepository();

export interface AutomationEventInput {
  type: Trigger["type"];
  key?: string;
  contactId?: string;
  conversationId?: string;
  waId?: string;
  payload?: Record<string, unknown>;
}

export interface AutomationEventResult {
  matched: number;
  started: number;
  flowIds: string[];
}

export async function fireAutomationEvent(
  tenantId: string,
  input: AutomationEventInput
): Promise<AutomationEventResult> {
  const ctx = await buildContext(tenantId, input);
  const event: TriggerEvent = { type: input.type, key: input.key, payload: input.payload };
  const triggers =
    input.type === "webhook" && input.key
      ? compact([await findWebhookTrigger(tenantId, input.key)]).filter((t) => evaluate(t.filters, ctx.context))
      : await matchingEventTriggers(tenantId, event, ctx.context);

  const result: AutomationEventResult = { matched: triggers.length, started: 0, flowIds: [] };
  for (const trigger of triggers) {
    if (!(await runTrigger(tenantId, trigger, ctx.conversation, ctx.contact, input.payload))) continue;
    result.started++;
    result.flowIds.push(trigger.targetFlowId);
  }
  return result;
}

async function runTrigger(
  tenantId: string,
  trigger: Trigger,
  conversation: Conversation | null,
  contact: Contact | null,
  payload: Record<string, unknown> = {}
): Promise<boolean> {
  if (!conversation) return false;
  // Lazy import to break the contacts → triggers/events → flows → contacts cycle
  // (CRM is a lower layer than automation; the static graph must stay acyclic).
  const { FlowRepository, startFlow } = await import("@/modules/flows");
  const flows = new FlowRepository();
  const flow = await flows.findById(tenantId, trigger.targetFlowId);
  if (!flow || !flow.enabled || flow.status !== "published") return false;
  await startFlow(tenantId, flow, {
    conversation,
    contact,
    input: { text: String(payload.text ?? ""), buttonReplyId: String(payload.buttonReplyId ?? "") || undefined },
  });
  return true;
}

async function buildContext(tenantId: string, input: AutomationEventInput) {
  let contact: Contact | null = null;
  if (input.contactId) contact = await contacts.findById(tenantId, input.contactId);
  if (!contact && input.waId) contact = await contacts.findByWaId(tenantId, input.waId);

  let conversation: Conversation | null = null;
  if (input.conversationId) conversation = await conversations.findById(tenantId, input.conversationId);
  const waId = input.waId ?? contact?.waId;
  if (!conversation && waId && config.whatsapp.phoneNumberId) {
    conversation = await conversations.getOrCreate(tenantId, config.whatsapp.phoneNumberId, waId);
  }

  return {
    contact,
    conversation,
    context: {
      contact: (contact as unknown as Record<string, unknown>) ?? null,
      conversation: (conversation as unknown as Record<string, unknown>) ?? null,
      event: input.payload ?? {},
      now: new Date(),
    } satisfies EvaluationContext,
  };
}

function compact<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null);
}
