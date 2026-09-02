/**
 * Trigger models — [קטגוריה 6].
 *
 * A Trigger maps an event to a target Flow, optionally gated by a condition
 * filter ([קטגוריה 7]). The pipeline consults enabled triggers (by priority) to
 * decide which flow, if any, an inbound message starts. Collection: `triggers`.
 */
import type { BaseEntity } from "@/core/types";
import type { ConditionExpr } from "@/modules/conditions";

export type TriggerType =
  | "message" // any inbound message (catch-all)
  | "keyword"
  | "button" // interactive reply id
  | "intent" // AI-detected intent (from NLU)
  | "ads_referral"
  | "webhook" // external inbound webhook (/api/hooks/{key})
  | "contact_created"
  | "contact_updated"
  | "segment_entered"
  | "segment_exited"
  | "conversation_opened"
  | "conversation_closed"
  | "campaign_sent"
  | "campaign_failed";

export interface Trigger extends BaseEntity {
  type: TriggerType;
  /** Type-specific match config: { keyword } | { buttonId } | { intent }. */
  config: Record<string, unknown>;
  /** Entry condition evaluated against the runtime context (§6.1). */
  filters: ConditionExpr | null;
  targetFlowId: string;
  enabled: boolean;
  /** Higher runs first when several triggers match the same event. */
  priority: number;
}
