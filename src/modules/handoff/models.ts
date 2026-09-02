/**
 * Human Handoff models — [קטגוריה 14].
 *
 * Records an escalation from the bot to a human, with the context bundle the
 * agent needs (§14.1). Collection: `handoffs`.
 */
import type { BaseEntity } from "@/core/types";

export type HandoffReason =
  | "customer_request"
  | "low_confidence"
  | "sensitive_topic"
  | "negative_sentiment"
  | "no_skill"
  | "max_clarifications"
  | "business_hours";

export interface Handoff extends BaseEntity {
  conversationId: string;
  reason: HandoffReason;
  /** Conversation summary for the receiving agent (§10.4 / §14.1). */
  summary: string | null;
  collectedFields: Record<string, unknown>;
  targetTeamId: string | null;
  targetAgentId: string | null;
  resolvedAt: Date | null;
}
