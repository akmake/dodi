/**
 * Generic data collections ([קטגוריה 28] — "מאגר מידע פנימי").
 *
 * The missing platform primitive: tenant-defined tables (CollectionDef) holding
 * rows (DataRecord), reachable from flows, the AI agent and the dashboard — so
 * ANY situation (appointments, inventory, registrations, orders, waitlists…) is
 * built on one mechanism instead of a vertical per use-case.
 *
 * Storage: definitions in `data_collections`; ALL rows in a single `data_records`
 * collection keyed by `collectionId` (uniform, tenant-scoped, indexable). Values
 * live under `data.<fieldKey>` so they query with Mongo dot-notation.
 */
import type { BaseEntity } from "@/core/types";

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "select"
  | "reference"
  | "json";

export interface FieldDef {
  /** Machine key, e.g. "roomType". Stable; used in filters and {{state}} maps. */
  key: string;
  /** Hebrew display label. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** Enforced at the service layer (single physical collection → no Mongo unique index). */
  unique?: boolean;
  default?: unknown;
  /** Allowed values for `select`. */
  options?: string[];
  /** Target collection name for `reference`. */
  refCollection?: string;
}

export interface CollectionDef extends BaseEntity {
  /** Machine key, unique per tenant, e.g. "rooms". */
  name: string;
  /** Hebrew display name. */
  label: string;
  description?: string | null;
  fields: FieldDef[];
  /**
   * How much the AI agent may touch this table as a tool ([13]→[10]).
   * "none" hides it; "read" exposes query/aggregate; "write" also exposes
   * insert/update/increment. Defaults to "read" when unset.
   */
  aiAccess?: "none" | "read" | "write";
  /**
   * Optional RBAC: roles allowed to view/edit rows in the dashboard ([25]).
   * Empty/unset = all roles (tenant-wide). Enforced at the API layer.
   */
  readRoles?: string[];
  writeRoles?: string[];
}

export interface DataRecord extends BaseEntity {
  collectionId: string;
  data: Record<string, unknown>;
}

// ── Query language (shared by the flow `data` node and the dashboard) ──────────
export type FilterOp =
  | "eq" | "neq" | "contains"
  | "gt" | "gte" | "lt" | "lte"
  | "in" | "is_empty" | "is_not_empty";

export interface FilterCond {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface QueryInput {
  filter?: FilterCond[]; // ANDed together
  sort?: { field: string; dir: "asc" | "desc" };
  limit?: number;
  /** Reference field keys to resolve into the referenced rows (§28 relations). */
  expand?: string[];
}

// ── Aggregation (§28 — count/sum/avg/min/max with optional group-by) ────────────
export type AggregateMetric = "count" | "sum" | "avg" | "min" | "max";

export interface AggregateInput {
  filter?: FilterCond[];
  metric: AggregateMetric;
  /** Numeric field for sum/avg/min/max. Ignored for count. */
  field?: string;
  /** Field to group rows by; omit for a single total. */
  groupBy?: string;
}

export interface AggregateResult {
  /** The group-by value, or null for an ungrouped total. */
  group: unknown;
  value: number;
  /** Rows in the group (always present, useful for avg context). */
  count: number;
}
