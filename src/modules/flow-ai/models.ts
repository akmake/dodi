/**
 * AI Flow Architect — request/response contract ([קטגוריה 27]).
 *
 * The architect always returns ONE of three modes. The client renders each
 * differently: `clarify` → questions, `plan` → numbered steps + approve button,
 * `build` → the proposed graph (rendered fresh, or as a diff over the current
 * flow). The graph is LOGICAL only — no positions; the canvas lays it out.
 */
import type { BaseEntity } from "@/core/types";
import type { Graph, ValidationIssue } from "./validator";

export type ArchitectMode = "clarify" | "plan" | "build";

/** A turn in the architect chat (user ↔ assistant), kept by the client. */
export interface ArchitectTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ArchitectRequest {
  /** The user's latest message. */
  message: string;
  /** Prior chat turns for context (most recent last). */
  history?: ArchitectTurn[];
  /** The flow currently on the canvas, if any — enables edit/diff mode. */
  currentFlow?: Graph | null;
}

// ── Self-provisioned data tables ([קטגוריה 27] + [28]) ─────────────────────────
// A flow's `data` nodes reference collections by name. The architect used to
// build such a flow and then *nag the user* to go create the table by hand — the
// gap this closes. Now the architect DECLARES the tables it needs here, and the
// "apply" step creates them (and any starter rows) so the flow runs immediately.

export type ArchitectFieldType = "text" | "number" | "boolean" | "date" | "datetime" | "select";

export interface ArchitectCollectionField {
  /** Machine key the flow's data nodes read, e.g. "status". */
  key: string;
  /** Hebrew display label. */
  label: string;
  type: ArchitectFieldType;
  /** Allowed values for `select`. */
  options?: string[];
  required?: boolean;
}

export interface ArchitectCollection {
  /** Machine name the flow's `data` nodes point at, e.g. "appointments". */
  name: string;
  label: string;
  fields: ArchitectCollectionField[];
  /** Optional starter rows (e.g. free appointment slots) so the flow isn't empty. */
  seedRows?: Record<string, unknown>[];
}

/** What the model is asked to emit (before validation). */
export interface ArchitectModelOutput {
  mode: ArchitectMode;
  message: string;
  questions?: string[];
  plan?: string[];
  flow?: Graph;
  /** Data tables the flow needs that don't exist yet — created on apply. */
  collections?: ArchitectCollection[];
}

export interface ArchitectResult {
  mode: ArchitectMode;
  /** Hebrew text to show in the chat. */
  message: string;
  questions?: string[];
  plan?: string[];
  /** Present only when mode==="build" and the graph passed validation. */
  flow?: Graph;
  /** Tables to provision when the user applies this build. */
  collections?: ArchitectCollection[];
  /** Non-blocking issues to surface alongside a built flow. */
  warnings?: ValidationIssue[];
  /** Set when the model could not produce a valid flow after repair attempts. */
  failedValidation?: ValidationIssue[];
}

export type { Graph } from "./validator";

// ── Persisted architect chat ([קטגוריה 27] — "היסטוריית שיחה + שחזור") ──────
// The chat with the AI architect is saved so the author can reopen a past
// conversation and re-apply any flow it built. A turn stores the full result for
// assistant turns, so a past "build" keeps its apply-to-canvas affordance.

export interface ArchitectSessionTurn {
  role: "user" | "assistant";
  content: string;
  /** Assistant turns only: the architect result, enabling re-apply of a past build. */
  data?: ArchitectResult | null;
}

export interface FlowAiSession extends BaseEntity {
  /** The flow open in the builder when the chat happened (history is per-flow). */
  flowId: string | null;
  /** Derived from the first user message — the list label. */
  title: string;
  turns: ArchitectSessionTurn[];
}

/** Metadata-only view for the sessions list. */
export interface FlowAiSessionSummary {
  id: string;
  flowId: string | null;
  title: string;
  turnCount: number;
  updatedAt: Date;
}
