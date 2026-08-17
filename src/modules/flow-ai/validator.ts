/**
 * Flow graph validator ([קטגוריה 27]) — the deterministic guard.
 *
 * Pure, side-effect-free. Checks a logical flow graph against the node CATALOG
 * and returns errors (block rendering) and warnings (render, but flag). Two
 * callers: the AI architect (errors+warnings feed the self-repair loop) and the
 * builder canvas (live validation, §8.5). Operates on the wire shape so a
 * `BuilderFlow` and an AI-produced flow both fit with no conversion.
 */
import { CATALOG, specFor, isKnownType, type NodeSpec } from "./catalog";

export interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}
export interface GraphEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type IssueLevel = "error" | "warning";
export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
  nodeId?: string;
}
export interface ValidationResult {
  ok: boolean; // no errors (warnings allowed)
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Known tenant entity ids/names, so references can be checked when available. */
export interface KnownEntities {
  actionIds?: string[];
  templateNames?: string[];
  resourceIds?: string[];
  /** Names of defined data collections ([קטגוריה 28]). */
  collectionNames?: string[];
}

export function validateGraph(graph: Graph, known: KnownEntities = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, nodeId?: string) =>
    issues.push({ level: "error", code, message, nodeId });
  const warn = (code: string, message: string, nodeId?: string) =>
    issues.push({ level: "warning", code, message, nodeId });

  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  // ── Structural: ids, types, edge endpoints ────────────────────────
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) err("duplicate_id", `מזהה צומת כפול: "${n.id}"`, n.id);
    seen.add(n.id);
    if (!isKnownType(n.type)) err("unknown_type", `סוג צומת לא מוכר: "${n.type}"`, n.id);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.source)) err("edge_bad_source", `חיבור ממקור לא-קיים: "${e.source}"`);
    if (!byId.has(e.target)) err("edge_bad_target", `חיבור ליעד לא-קיים: "${e.target}"`);
    const arr = outgoing.get(e.source);
    if (arr) arr.push(e);
    else outgoing.set(e.source, [e]);
  }

  // ── Start node: exactly one, must have an exit ────────────────────
  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length === 0) err("no_start", "אין צומת התחלה (start) — חובה אחד.");
  if (starts.length > 1) err("multi_start", `יש ${starts.length} צמתי התחלה — מותר אחד בלבד.`);
  if (starts.length === 1 && (outgoing.get(starts[0].id)?.length ?? 0) === 0) {
    err("start_no_exit", "צומת ההתחלה אינו מחובר לשום צומת.", starts[0].id);
  }

  // ── Per-node: required data + branch wiring ────────────────────────
  for (const n of nodes) {
    const spec = specFor(n.type);
    if (!spec) continue; // already reported as unknown_type
    const data = n.data ?? {};
    const outs = outgoing.get(n.id) ?? [];

    checkRequiredData(spec, data, n.id, err);
    checkEntityRef(spec, data, n.id, known, warn);
    checkBranches(spec, data, outs, n.id, err, warn);

    // Non-terminal, non-branching node with no exit → stuck.
    if (!spec.terminal && spec.handles.kind === "single" && outs.length === 0 && n.type !== "start") {
      warn("dead_end", `הצומת "${spec.label}" אינו מוביל לשום צומת.`, n.id);
    }
  }

  // ── Reachability from start (orphans) ─────────────────────────────
  if (starts.length === 1) {
    const reached = new Set<string>([starts[0].id]);
    const queue = [starts[0].id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of outgoing.get(cur) ?? []) {
        if (!reached.has(e.target) && byId.has(e.target)) {
          reached.add(e.target);
          queue.push(e.target);
        }
      }
    }
    for (const n of nodes) {
      if (n.type !== "start" && !reached.has(n.id)) {
        warn("unreachable", `הצומת "${specFor(n.type)?.label ?? n.type}" אינו נגיש מההתחלה.`, n.id);
      }
    }
  }

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return { ok: errors.length === 0, errors, warnings };
}

// ── Helpers ──────────────────────────────────────────────────────────

function checkRequiredData(
  spec: NodeSpec,
  data: Record<string, unknown>,
  nodeId: string,
  err: (c: string, m: string, n?: string) => void
): void {
  for (const f of spec.data) {
    if (!f.required) continue;
    const v = data[f.key];
    const empty =
      v == null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (f.key === "condValue" && false); // condValue handled by op below
    if (empty) {
      err("missing_field", `בצומת "${spec.label}" חסר שדה חובה: ${f.label}.`, nodeId);
    }
  }
  // condition: value is required unless the operator is empty-checking.
  if (spec.type === "condition") {
    const op = String(data.condOp ?? "");
    const needsValue = op !== "is_empty" && op !== "is_not_empty";
    if (needsValue && (data.condValue == null || data.condValue === "")) {
      err("missing_field", `בצומת "${spec.label}" חסר ערך להשוואה.`, nodeId);
    }
  }
}

function checkEntityRef(
  spec: NodeSpec,
  data: Record<string, unknown>,
  nodeId: string,
  known: KnownEntities,
  warn: (c: string, m: string, n?: string) => void
): void {
  if (spec.needsEntity === "action" && known.actionIds) {
    const id = String(data.actionId ?? "");
    if (id && !known.actionIds.includes(id)) warn("unknown_action", `הפעולה "${id}" אינה קיימת.`, nodeId);
  }
  if (spec.needsEntity === "template" && known.templateNames) {
    const name = String(data.name ?? "");
    if (name && !known.templateNames.includes(name)) warn("unknown_template", `התבנית "${name}" אינה קיימת.`, nodeId);
  }
  if (spec.needsEntity === "resource" && known.resourceIds) {
    const id = String(data.resourceId ?? "");
    if (id && !known.resourceIds.includes(id)) warn("unknown_resource", `המשאב "${id}" אינו קיים.`, nodeId);
  }
  if (spec.needsEntity === "collection" && known.collectionNames) {
    const name = String(data.collection ?? "");
    if (name && !known.collectionNames.includes(name)) warn("unknown_collection", `טבלת הנתונים "${name}" אינה קיימת.`, nodeId);
  }
}

function checkBranches(
  spec: NodeSpec,
  data: Record<string, unknown>,
  outs: GraphEdge[],
  nodeId: string,
  err: (c: string, m: string, n?: string) => void,
  warn: (c: string, m: string, n?: string) => void
): void {
  const present = new Set(outs.map((e) => e.sourceHandle ?? "").filter(Boolean));

  if (spec.handles.kind === "fixed") {
    const { handles, optional = [] } = spec.handles;
    // A pure brancher (condition/validate) with no exits at all is broken.
    if (handles.length >= 2 && outs.length === 0) {
      err("brancher_no_exit", `הצומת "${spec.label}" מסתעף אך אינו מחובר לשום צומת.`, nodeId);
      return;
    }
    for (const h of handles) {
      if (!present.has(h) && outs.length > 0) warn("missing_branch", `בצומת "${spec.label}" חסר ענף "${h}".`, nodeId);
    }
    for (const h of optional) {
      if (!present.has(h)) warn("missing_optional_branch", `בצומת "${spec.label}" כדאי לחבר ענף "${h}" (טיפול בכשל).`, nodeId);
    }
  }

  if (spec.handles.kind === "dynamic") {
    const arr = (data[spec.handles.from] as Array<Record<string, unknown>>) ?? [];
    const keyField = spec.handles.from === "buttons" || spec.handles.from === "rows" ? "id" : "handle";
    if (arr.length === 0) {
      warn("no_options", `לצומת "${spec.label}" אין אפשרויות מוגדרות.`, nodeId);
    }
    for (const opt of arr) {
      const h = String(opt[keyField] ?? "");
      if (h && !present.has(h)) warn("option_no_edge", `באפשרות של "${spec.label}" אין חיבור יוצא.`, nodeId);
    }
    if (spec.handles.defaultHandle && !present.has(spec.handles.defaultHandle)) {
      warn("missing_default", `בצומת "${spec.label}" כדאי לחבר ענף "${spec.handles.defaultHandle}".`, nodeId);
    }
  }
}

/** Compact human summary of a result — used by the architect's repair prompt. */
export function describeIssues(result: ValidationResult): string {
  const lines = [...result.errors, ...result.warnings].map(
    (i) => `- [${i.level === "error" ? "שגיאה" : "אזהרה"}] ${i.nodeId ? `(${i.nodeId}) ` : ""}${i.message}`
  );
  return lines.join("\n");
}

export { CATALOG };
