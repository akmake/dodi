/**
 * Business Actions / Tools — [קטגוריה 13].
 *
 * A uniform registry of "tools" the AI Agent ([קטגוריה 10]) or a Flow
 * ([קטגוריה 8]) can invoke, with input schema, target and permissions. Compatible
 * with Claude tool-calling. Collections: `actions`, `action_runs`.
 */
import type { BaseEntity } from "@/core/types";

export type ActionTargetType = "builtin" | "http" | "webhook" | "integration";

export interface Action extends BaseEntity {
  name: string;
  /** Human/LLM-facing description used for tool selection. */
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  target: { type: ActionTargetType; config: Record<string, unknown> };
  /** Require explicit confirmation before running (irreversible/sensitive, §13.1). */
  requiresConfirmation: boolean;
  allowedInSkills: string[];
  enabled: boolean;
}

export type ActionRunStatus = "pending_confirmation" | "success" | "failed";

export interface ActionRun extends BaseEntity {
  actionId: string;
  conversationId: string | null;
  input: unknown;
  output: unknown;
  status: ActionRunStatus;
  error: unknown;
  /** Guards against double-submit (§13.1). */
  idempotencyKey: string | null;
}
