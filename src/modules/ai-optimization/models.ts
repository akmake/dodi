/**
 * AI Optimization models — [קטגוריה 24].
 *
 * Continuous improvement of the AI agent: regression test suites (§24.1),
 * quality feedback (§24.3), and the conversation trace (§24.4) which is read
 * straight from the persisted `AIResponse` reasoning turns ([קטגוריה 10]).
 * Guardrails (§24.2) already ship in `ai/guardrails` (phase A6).
 *
 * Collections:
 *   test_suites   → TestSuite  (cases embedded)
 *   ai_feedback   → Feedback
 */
import type { BaseEntity } from "@/core/types";
import type { AIDecision } from "@/modules/ai";

/** One regression case: an input and what a correct answer must look like (§24.1). */
export interface TestCase {
  /** Local id within the suite. */
  id: string;
  input: string;
  /** Substrings the answer must contain (case-insensitive — non-deterministic-safe). */
  expectContains: string[];
  /** Optional expected NLU intent / agent decision. */
  expectIntent: string | null;
  expectDecision: AIDecision | null;
  result: {
    passed: boolean;
    actualText: string;
    actualIntent: string | null;
    ranAt: Date;
  } | null;
}

export interface TestSuite extends BaseEntity {
  name: string;
  cases: TestCase[];
  /** 0..1 from the last run, or null if never run. */
  passRate: number | null;
  lastRunAt: Date | null;
}

export type FeedbackRating = "up" | "down";

export interface Feedback extends BaseEntity {
  conversationId: string;
  aiResponseId: string | null;
  rating: FeedbackRating;
  note: string | null;
  source: "agent" | "customer";
}
