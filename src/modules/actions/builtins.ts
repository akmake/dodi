/**
 * Built-in action handlers — [קטגוריה 13 §13.2].
 *
 * The `builtin` action target ([13]) dispatches here by name. Today this exposes
 * the generic data platform ([קטגוריה 28]) as tools so a Flow, the API, or the AI
 * Agent can read and write tenant tables through the uniform Actions registry —
 * with confirmation, idempotency and audit intact (handled by the service above).
 *
 * Input is intentionally permissive (LLM-friendly): a query accepts either a
 * structured `filter` array or a flat `where` object of equality pairs.
 */
import * as data from "@/modules/data";
import type { FilterCond } from "@/modules/data";

export type BuiltinHandler = (
  tenantId: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>
) => Promise<unknown>;

/** Resolve the collection ref from the action config (fixed) or the call input. */
function ref(config: Record<string, unknown>, input: Record<string, unknown>): string {
  const r = config.collection ?? input.collection;
  if (!r) throw new Error("missing collection");
  return String(r);
}

/**
 * Build a filter list from either a structured `filter` array or a flat `where`
 * object ({ field: value } → eq). Lets the LLM pass the simpler form.
 */
function coerceFilter(input: Record<string, unknown>): FilterCond[] {
  if (Array.isArray(input.filter)) return input.filter as FilterCond[];
  const where = input.where;
  if (where && typeof where === "object") {
    return Object.entries(where as Record<string, unknown>).map(([field, value]) => ({
      field,
      op: "eq" as const,
      value,
    }));
  }
  return [];
}

/** Strip reserved query keys, leaving the field map for insert/update payloads. */
function payload(input: Record<string, unknown>): Record<string, unknown> {
  if (input.data && typeof input.data === "object") return input.data as Record<string, unknown>;
  const { collection, filter, where, id, field, amount, sort, limit, ...rest } = input;
  void collection; void filter; void where; void id; void field; void amount; void sort; void limit;
  return rest;
}

export const BUILTINS: Record<string, BuiltinHandler> = {
  "data.find": (tenantId, config, input) =>
    data.findRecords(tenantId, ref(config, input), {
      filter: coerceFilter(input),
      sort: input.sort as { field: string; dir: "asc" | "desc" } | undefined,
      limit: typeof input.limit === "number" ? input.limit : Number(input.limit) || undefined,
    }),

  "data.get": (tenantId, _config, input) => data.getRecord(tenantId, String(input.id)),

  "data.insert": (tenantId, config, input) =>
    data.insertRecord(tenantId, ref(config, input), payload(input)),

  "data.update": (tenantId, config, input) => {
    if (input.id) return data.updateRecordById(tenantId, String(input.id), payload(input));
    return data.updateRecords(tenantId, ref(config, input), coerceFilter(input), payload(input));
  },

  "data.delete": (tenantId, config, input) => {
    if (input.id) return data.deleteRecordById(tenantId, String(input.id));
    return data.deleteRecords(tenantId, ref(config, input), coerceFilter(input));
  },

  "data.increment": (tenantId, config, input) =>
    data.incrementRecord(
      tenantId,
      ref(config, input),
      coerceFilter(input),
      String(input.field),
      Number(input.amount ?? 1),
      input.guardNonNegative !== false
    ),

  "data.aggregate": (tenantId, config, input) =>
    data.aggregateRecords(tenantId, ref(config, input), {
      filter: coerceFilter(input),
      groupBy: input.groupBy ? String(input.groupBy) : undefined,
      metric: (input.metric as "count" | "sum" | "avg" | "min" | "max") ?? "count",
      field: input.field ? String(input.field) : undefined,
    }),
};

/** Run a built-in by name. Throws for unknown names so the run is recorded failed. */
export function runBuiltin(
  tenantId: string,
  name: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>
): Promise<unknown> {
  const handler = BUILTINS[name];
  if (!handler) throw new Error(`unknown builtin action: ${name}`);
  return handler(tenantId, config, input);
}
