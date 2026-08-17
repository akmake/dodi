/**
 * Flow Builder models — [קטגוריה 8].
 *
 * A Flow is a directed graph (nodes + edges) run by a Trigger ([קטגוריה 6]).
 * Each customer runs in a FlowRun whose state is persisted, so a "wait" node
 * sleeps the run until the next inbound message resumes it — replacing the old
 * in-memory session store. Collections: `flows`, `flow_runs`.
 */
import type { BaseEntity } from "@/core/types";
import type { ConditionExpr } from "@/modules/conditions";

export type FlowStatus = "draft" | "published";

export type FlowNodeType =
  | "start"
  | "message"
  | "buttons"
  | "list" // interactive list/menu (≤10 rows) → waits for the customer's choice
  | "location" // send a location pin (§8.2)
  | "question" // open question → waits for the customer's reply
  | "wait_reply" // wait for a reply with a timeout branch (§8.2 Wait for reply)
  | "condition" // if/else split (§8.2)
  | "switch" // multi-branch by a field's value (§8.2)
  | "split" // weighted random branch — A/B testing (§8.2)
  | "jump_to_node" // jump to another node in the same flow — loops/shortcuts (§8.2)
  | "set_field"
  | "set_var" // compute/format a value into the run state (§8.2 Set variable / Formula)
  | "data" // read/write a generic data collection ([קטגוריה 28])
  | "tag"
  | "template"
  | "media"
  | "action" // call a Business Action ([קטגוריה 13])
  | "api" // direct HTTP call with response mapping (§8.3)
  | "validate" // validate collected input and branch valid/invalid (§8.3)
  | "ai"
  | "ai_classify" // classify intent via NLU and branch on it (§8.2 AI classify)
  | "ai_extract" // extract named fields from free text into state (§8.2 AI extract entities)
  | "run_code" // run sandboxed JS (isolated-vm) and branch success/error (§8.2 Run code)
  | "handoff"
  | "appointment" // offer free slots, wait, book the chosen one ([קטגוריה 13])
  | "delay" // wait N minutes, resumed by the scheduler (§8.4)
  | "jump" // jump to another flow
  | "stop"
  | "end";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  data: Record<string, unknown>;
}

export interface FlowEdge {
  source: string;
  target: string;
  /** Branch key: a button id, "true"/"false" for conditions, else default. */
  sourceHandle?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Flow extends BaseEntity {
  name: string;
  version: number;
  status: FlowStatus;
  graph: FlowGraph;
  /** Optional keyword that starts this flow when no trigger entity is used. */
  keyword: string | null;
  enabled: boolean;
}

export type FlowRunStatus = "running" | "waiting" | "done" | "stopped";

export interface FlowRun extends BaseEntity {
  flowId: string;
  flowVersion: number;
  /**
   * Immutable snapshot of the flow graph taken when the run started (§8.1
   * "גרסה ננעלת לריצה"). The engine resumes from THIS, not the live flow, so
   * editing/publishing a flow never disrupts runs already in flight. Optional
   * for backward compatibility with runs created before snapshots existed.
   */
  graph?: FlowGraph;
  contactId: string | null;
  conversationId: string;
  /** The node we're parked on while `waiting`. */
  currentNodeId: string;
  state: Record<string, unknown>;
  status: FlowRunStatus;
  waitUntil: Date | null;
  resumeEvent: string | null;
  /**
   * Token identifying the *current* no-reply timer armed for this run. Each time
   * the run parks on (or re-prompts) a waiting node a fresh token is issued and
   * carried in the `flow.timeout` job; a timer whose token no longer matches is a
   * stale re-prompt/advance and fires nothing. Optional for legacy runs.
   */
  waitToken?: string | null;
}

/**
 * An immutable snapshot of a flow as it was at one save ([קטגוריה 8] — version
 * history). Written on every `saveBuilderFlow`, capped per flow. Lets the author
 * browse "what it was" and restore a past version (which itself becomes a new
 * version, so a restore is always reversible). Collection: `flow_versions`.
 */
export interface FlowVersion extends BaseEntity {
  flowId: string;
  version: number;
  name: string;
  status: FlowStatus;
  keyword: string | null;
  enabled: boolean;
  graph: FlowGraph;
  /** When this version became the live flow. */
  savedAt: Date;
}
