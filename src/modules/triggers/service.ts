/**
 * Triggers service — [קטגוריה 6].
 *
 * Matches an inbound event against enabled triggers and returns the flow to
 * start. Pure matching — starting the flow is the pipeline's job.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import { evaluate, type EvaluationContext } from "@/modules/conditions";
import type { Trigger } from "./models";

export class TriggerRepository extends Repository<Trigger> {
  constructor() {
    super("triggers");
  }
  findEnabled(tenantId: string) {
    return this.findMany(tenantId, { enabled: true } as Filter<Trigger>);
  }
}

const triggers = new TriggerRepository();

export interface CreateTriggerInput {
  type: Trigger["type"];
  config?: Record<string, unknown>;
  filters?: Trigger["filters"];
  targetFlowId: string;
  enabled?: boolean;
  priority?: number;
}

export interface InboundEvent {
  text: string | null;
  buttonReplyId: string | null;
  /** NLU-detected intent for this turn (enables `intent` triggers). */
  intent?: string | null;
  /** Click-to-WhatsApp ads referral id/source when Meta includes it. */
  adsReferralId?: string | null;
}

export interface TriggerEvent {
  type: Trigger["type"];
  key?: string | null;
  payload?: Record<string, unknown>;
}

export async function createTrigger(tenantId: string, input: CreateTriggerInput): Promise<Trigger> {
  await ensureTriggerIndexes();
  return triggers.create(tenantId, {
    type: input.type,
    config: input.config ?? {},
    filters: input.filters ?? null,
    targetFlowId: input.targetFlowId,
    enabled: input.enabled ?? true,
    priority: input.priority ?? 0,
  });
}

export function listTriggers(tenantId: string): Promise<Trigger[]> {
  return triggers.findMany(tenantId);
}

export function getTrigger(tenantId: string, id: string): Promise<Trigger | null> {
  return triggers.findById(tenantId, id);
}

export function updateTrigger(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Trigger, "config" | "filters" | "targetFlowId" | "enabled" | "priority">>
): Promise<Trigger | null> {
  return triggers.update(tenantId, id, patch);
}

export function deleteTrigger(tenantId: string, id: string): Promise<boolean> {
  return triggers.delete(tenantId, id);
}

/**
 * Return the target flow id of the highest-priority enabled trigger that matches
 * the event and whose filter passes, or null.
 */
export async function matchInbound(
  tenantId: string,
  event: InboundEvent,
  context: EvaluationContext
): Promise<string | null> {
  const all = (await triggers.findEnabled(tenantId)).sort((a, b) => b.priority - a.priority);

  for (const trigger of all) {
    if (!matchesType(trigger, event)) continue;
    if (!evaluate(trigger.filters, context)) continue;
    return trigger.targetFlowId;
  }
  return null;
}

/** Find an enabled `webhook` trigger by its key (for /api/hooks/{key}). */
export async function findWebhookTrigger(tenantId: string, key: string): Promise<Trigger | null> {
  const all = await triggers.findEnabled(tenantId);
  return all.find((t) => t.type === "webhook" && t.config.webhookKey === key) ?? null;
}

export async function matchingEventTriggers(
  tenantId: string,
  event: TriggerEvent,
  context: EvaluationContext
): Promise<Trigger[]> {
  const all = (await triggers.findEnabled(tenantId)).sort((a, b) => b.priority - a.priority);
  return all.filter((trigger) => matchesEvent(trigger, event) && evaluate(trigger.filters, context));
}

function matchesType(trigger: Trigger, event: InboundEvent): boolean {
  switch (trigger.type) {
    case "message":
      return true;
    case "keyword": {
      const keyword = String(trigger.config.keyword ?? "").toLowerCase().trim();
      return !!keyword && !!event.text && event.text.toLowerCase().includes(keyword);
    }
    case "button":
      return !!event.buttonReplyId && trigger.config.buttonId === event.buttonReplyId;
    case "intent":
      return !!event.intent && trigger.config.intent === event.intent;
    case "ads_referral":
      return !!event.adsReferralId && (!trigger.config.referralId || trigger.config.referralId === event.adsReferralId);
    default:
      return false; // webhook / conversation_* handled elsewhere
  }
}

function matchesEvent(trigger: Trigger, event: TriggerEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "webhook") {
    return !!event.key && trigger.config.webhookKey === event.key;
  }
  return true;
}

let indexesReady: Promise<void> | null = null;
export function ensureTriggerIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
        await Promise.all([
          db.collection("triggers").createIndex({ tenantId: 1, enabled: 1, priority: -1 }),
          db.collection("triggers").createIndex({ tenantId: 1, type: 1 }),
          db.collection("triggers").createIndex({ tenantId: 1, "config.webhookKey": 1 }, { sparse: true }),
        ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
