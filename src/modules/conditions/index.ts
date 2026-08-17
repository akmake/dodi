/**
 * Condition engine — [קטגוריה 7].
 *
 * A shared, side-effect-free evaluator for boolean expressions over a runtime
 * context. Consumed by Flow Builder (if/else), Triggers (filters), Segments and
 * Routing. No DB — the expression is stored inside whatever owns it.
 */

export type Operator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty"
  | "between";

export interface Rule {
  /** Dot path into the context, e.g. "contact.tags", "ai.confidence". */
  field: string;
  operator: Operator;
  value?: unknown;
}

export interface ConditionExpr {
  op: "AND" | "OR";
  rules: Rule[];
  /** Nested sub-expressions for grouping (§7.1). */
  groups?: ConditionExpr[];
}

export interface EvaluationContext {
  contact?: Record<string, unknown> | null;
  conversation?: Record<string, unknown> | null;
  message?: Record<string, unknown> | null;
  channel?: Record<string, unknown> | null;
  now?: Date;
  ai?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Resolve a dot path ("a.b.c") against the context; undefined if missing. */
function resolve(context: EvaluationContext, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, context);
}

function isEmpty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function evalRule(rule: Rule, context: EvaluationContext): boolean {
  const actual = resolve(context, rule.field);
  const expected = rule.value;

  switch (rule.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      if (Array.isArray(actual)) return actual.includes(expected);
      return String(actual ?? "").includes(String(expected ?? ""));
    case "not_contains":
      if (Array.isArray(actual)) return !actual.includes(expected);
      return !String(actual ?? "").includes(String(expected ?? ""));
    case "gt":
      return toNum(actual) > toNum(expected);
    case "gte":
      return toNum(actual) >= toNum(expected);
    case "lt":
      return toNum(actual) < toNum(expected);
    case "lte":
      return toNum(actual) <= toNum(expected);
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const n = toNum(actual);
      return n >= toNum(expected[0]) && n <= toNum(expected[1]);
    }
    default:
      return false;
  }
}

/**
 * Evaluate an expression tree. A missing/invalid expression evaluates to `true`
 * (open gate) so callers can treat "no filter" as "always pass". Errors fall
 * back to `false` for the individual rule (safe else branch, §7.1).
 */
export function evaluate(expr: ConditionExpr | null | undefined, context: EvaluationContext): boolean {
  if (!expr) return true;

  const ruleResults = (expr.rules ?? []).map((r) => {
    try {
      return evalRule(r, context);
    } catch {
      return false;
    }
  });
  const groupResults = (expr.groups ?? []).map((g) => evaluate(g, context));
  const all = [...ruleResults, ...groupResults];
  if (all.length === 0) return true;

  return expr.op === "OR" ? all.some(Boolean) : all.every(Boolean);
}
