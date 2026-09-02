/**
 * AI Agent models — [קטגוריה 10].
 *
 * `AIResponse` persists one reasoning turn (§10.1): the NLU read, the decision,
 * grounding sources used, and token cost — feeding Analytics ([23]) and AI
 * Optimization ([24]). Collection: `ai_responses`.
 */
import type { BaseEntity } from "@/core/types";

export type Sentiment = "positive" | "neutral" | "negative";
export type Urgency = "low" | "normal" | "high";
export type AIDecision = "answer" | "clarify" | "action" | "handoff" | "fallback";

/** Structured NLU read of an inbound turn (§10.2). */
export interface NluResult {
  intent: string;
  language: string;
  sentiment: Sentiment;
  urgency: Urgency;
}

/** Conversation enrichment for agents/tickets (§10.4). */
export interface Enrichment {
  summary: string;
  title: string;
  reason: string;
  nextAction: string;
}

export interface AIResponse extends BaseEntity {
  conversationId: string;
  intent: string;
  language: string;
  sentiment: Sentiment;
  urgency: Urgency;
  /** 0..1 — grounding relevance of the best source. */
  confidence: number;
  decision: AIDecision;
  answerText: string | null;
  usedSources: { sourceId: string; title?: string }[];
  toolCalls: { name: string; input: unknown; result: string }[];
  inputTokens: number;
  outputTokens: number;
}
