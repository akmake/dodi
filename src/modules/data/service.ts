/**
 * Generic data platform — service ([קטגוריה 28]).
 *
 * Collection (table) CRUD + record CRUD/query, with schema validation, type
 * coercion, uniqueness, a small filter language compiled to Mongo, and an atomic
 * increment. Consumed by the dashboard, the API, and the flow `data` node.
 */
import {
  CollectionRepository,
  RecordRepository,
  ensureDataIndexes,
} from "./repository";
import type {
  AggregateInput,
  AggregateResult,
  CollectionDef,
  DataRecord,
  FieldDef,
  FilterCond,
  QueryInput,
} from "./models";

const collections = new CollectionRepository();
const records = new RecordRepository();

// ── Collections ───────────────────────────────────────────────────────────────
export async function listCollections(tenantId: string): Promise<CollectionDef[]> {
  await ensureDataIndexes();
  return collections.findMany(tenantId);
}
export function getCollection(tenantId: string, id: string): Promise<CollectionDef | null> {
  return collections.findById(tenantId, id);
}
export async function createCollection(
  tenantId: string,
  input: {
    name: string;
    label: string;
    description?: string | null;
    fields?: FieldDef[];
    aiAccess?: CollectionDef["aiAccess"];
  }
): Promise<CollectionDef> {
  await ensureDataIndexes();
  const name = input.name.trim();
  if (!name) throw new Error("שם הטבלה (מפתח) חובה");
  if (await collections.findByName(tenantId, name)) throw new Error(`כבר קיימת טבלה בשם "${name}"`);
  return collections.create(tenantId, {
    name,
    label: input.label?.trim() || name,
    description: input.description ?? null,
    fields: input.fields ?? [],
    aiAccess: input.aiAccess ?? "read",
  });
}
export function updateCollection(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<CollectionDef, "label" | "description" | "fields" | "aiAccess" | "readRoles" | "writeRoles">
  >
): Promise<CollectionDef | null> {
  return collections.update(tenantId, id, patch);
}
export async function deleteCollection(tenantId: string, id: string): Promise<boolean> {
  await records.deleteByCollection(tenantId, id);
  return collections.delete(tenantId, id);
}

async function resolveCollection(tenantId: string, ref: string): Promise<CollectionDef | null> {
  return (await collections.findById(tenantId, ref)) ?? (await collections.findByName(tenantId, ref));
}

// ── Records ─────────────────────────────────────────────────────────────────--
export async function findRecords(
  tenantId: string,
  ref: string,
  query: QueryInput = {}
): Promise<DataRecord[]> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  const rows = await records.query(
    tenantId,
    c.id,
    filterToMongo(c, query.filter ?? []),
    query.sort,
    query.limit
  );
  if (query.expand?.length) await expandReferences(tenantId, c, rows, query.expand);
  return rows;
}
export function getRecord(tenantId: string, id: string): Promise<DataRecord | null> {
  return records.findById(tenantId, id);
}
export async function insertRecord(
  tenantId: string,
  ref: string,
  data: Record<string, unknown>
): Promise<DataRecord> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  const coerced = coerceRecord(c, data, false);
  await assertUnique(tenantId, c, coerced);
  return records.create(tenantId, { collectionId: c.id, data: coerced });
}
export async function updateRecordById(
  tenantId: string,
  id: string,
  patch: Record<string, unknown>
): Promise<DataRecord | null> {
  const rec = await records.findById(tenantId, id);
  if (!rec) return null;
  const c = await collections.findById(tenantId, rec.collectionId);
  if (!c) return null;
  const coerced = coerceRecord(c, patch, true);
  await assertUnique(tenantId, c, coerced, id);
  return records.update(tenantId, id, { data: { ...rec.data, ...coerced } });
}
export async function updateRecords(
  tenantId: string,
  ref: string,
  filter: FilterCond[],
  patch: Record<string, unknown>
): Promise<number> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  return records.updateByFilter(tenantId, c.id, filterToMongo(c, filter), coerceRecord(c, patch, true));
}
export function deleteRecordById(tenantId: string, id: string): Promise<boolean> {
  return records.delete(tenantId, id);
}
export async function deleteRecords(
  tenantId: string,
  ref: string,
  filter: FilterCond[]
): Promise<number> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  return records.deleteByFilter(tenantId, c.id, filterToMongo(c, filter));
}
/** Atomic ± on a numeric field of the first matching row. Returns null if the guard blocked it. */
export async function incrementRecord(
  tenantId: string,
  ref: string,
  filter: FilterCond[],
  field: string,
  amount: number,
  guardNonNegative = true
): Promise<DataRecord | null> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  return records.increment(tenantId, c.id, filterToMongo(c, filter), field, amount, guardNonNegative);
}
export function countRecords(tenantId: string, collectionId: string): Promise<number> {
  return records.countByCollection(tenantId, collectionId);
}

// ── Aggregation (§28) ───────────────────────────────────────────────────────--
export async function aggregateRecords(
  tenantId: string,
  ref: string,
  input: AggregateInput
): Promise<AggregateResult[]> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  return records.aggregate(
    tenantId,
    c.id,
    filterToMongo(c, input.filter ?? []),
    input.metric,
    input.field,
    input.groupBy
  );
}

// ── Relations / expand (§28) ──────────────────────────────────────────────────
/**
 * Resolve `reference` fields in-place: for each requested key whose field points
 * at another collection, look up the referenced row (by id) and attach it under
 * `data.<key>__ref`. One batched query per referenced collection.
 */
async function expandReferences(
  tenantId: string,
  c: CollectionDef,
  rows: DataRecord[],
  keys: string[]
): Promise<void> {
  const refFields = c.fields.filter(
    (f) => f.type === "reference" && f.refCollection && keys.includes(f.key)
  );
  for (const f of refFields) {
    const target = await resolveCollection(tenantId, f.refCollection!);
    if (!target) continue;
    const ids = [...new Set(rows.map((r) => r.data[f.key]).filter(Boolean).map(String))];
    if (!ids.length) continue;
    const refs = await records.query(tenantId, target.id, { id: { $in: ids } }, undefined, undefined);
    const byId = new Map(refs.map((r) => [r.id, r]));
    for (const row of rows) {
      const v = row.data[f.key];
      if (v != null) row.data[`${f.key}__ref`] = byId.get(String(v)) ?? null;
    }
  }
}

// ── CSV import / export (§28) ─────────────────────────────────────────────────
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export all rows of a table as CSV (header = field keys). */
export async function exportCsv(tenantId: string, ref: string): Promise<string> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  const rows = await records.query(tenantId, c.id, {}, undefined, undefined);
  const cols = c.fields.map((f) => f.key);
  const header = cols.join(",");
  const lines = rows.map((r) => cols.map((k) => csvCell(r.data[k])).join(","));
  return [header, ...lines].join("\n");
}

/** Minimal RFC-4180 CSV parse (quotes, escaped quotes, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Import rows from CSV (header row = field keys). Returns inserted count + errors. */
export async function importCsv(
  tenantId: string,
  ref: string,
  csv: string
): Promise<{ inserted: number; errors: string[] }> {
  const c = await resolveCollection(tenantId, ref);
  if (!c) throw new Error(`טבלה לא נמצאה: ${ref}`);
  const grid = parseCsv(csv);
  if (grid.length < 2) return { inserted: 0, errors: ["אין שורות לייבוא"] };
  const header = grid[0].map((h) => h.trim());
  const errors: string[] = [];
  let inserted = 0;
  for (let i = 1; i < grid.length; i++) {
    const data: Record<string, unknown> = {};
    header.forEach((key, j) => {
      const v = grid[i][j];
      if (v !== undefined && v !== "") data[key] = v;
    });
    try {
      await insertRecord(tenantId, c.id, data);
      inserted++;
    } catch (err) {
      errors.push(`שורה ${i + 1}: ${String(err)}`);
    }
  }
  return { inserted, errors };
}

// ── Per-table permissions (§28 / [25]) ────────────────────────────────────────
/** Does a user holding `roles` have the requested access to this table? */
export function canAccessCollection(
  c: CollectionDef,
  roles: string[],
  mode: "read" | "write"
): boolean {
  const allow = mode === "write" ? c.writeRoles : c.readRoles;
  if (!allow || allow.length === 0) return true; // unrestricted
  return roles.some((r) => allow.includes(r));
}

// ── Validation / coercion / filtering ─────────────────────────────────────────
function coerceValue(field: FieldDef, value: unknown): unknown {
  if (value == null || value === "") return value;
  switch (field.type) {
    case "number": {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case "boolean":
      return value === true || value === "true" || value === "1" || value === 1;
    case "date":
    case "datetime": {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? value : d;
    }
    default:
      return value;
  }
}

function coerceRecord(
  c: CollectionDef,
  data: Record<string, unknown>,
  partial: boolean
): Record<string, unknown> {
  const byKey = new Map(c.fields.map((f) => [f.key, f]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    const f = byKey.get(k);
    out[k] = f ? coerceValue(f, v) : v;
  }
  if (!partial) {
    for (const f of c.fields) {
      if (!(f.key in out) && f.default !== undefined) out[f.key] = coerceValue(f, f.default);
    }
    for (const f of c.fields) {
      if (f.required && (out[f.key] == null || out[f.key] === "")) {
        throw new Error(`חסר שדה חובה: ${f.label}`);
      }
    }
  }
  return out;
}

async function assertUnique(
  tenantId: string,
  c: CollectionDef,
  data: Record<string, unknown>,
  exceptId?: string
): Promise<void> {
  for (const f of c.fields) {
    if (!f.unique) continue;
    const v = data[f.key];
    if (v == null || v === "") continue;
    if (await records.existsWith(tenantId, c.id, f.key, v, exceptId)) {
      throw new Error(`הערך "${String(v)}" כבר קיים בשדה ${f.label}`);
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Compile the small filter language to a Mongo query over `data.<field>`. */
function filterToMongo(c: CollectionDef, filter: FilterCond[]): Record<string, unknown> {
  const byKey = new Map(c.fields.map((f) => [f.key, f]));
  const out: Record<string, unknown> = {};
  for (const cond of filter ?? []) {
    if (!cond.field) continue;
    const key = `data.${cond.field}`;
    const f = byKey.get(cond.field);
    const cv = f ? coerceValue(f, cond.value) : cond.value;
    switch (cond.op) {
      case "eq": out[key] = cv; break;
      case "neq": out[key] = { $ne: cv }; break;
      case "contains": out[key] = { $regex: escapeRegex(String(cond.value ?? "")), $options: "i" }; break;
      case "gt": out[key] = { $gt: cv }; break;
      case "gte": out[key] = { $gte: cv }; break;
      case "lt": out[key] = { $lt: cv }; break;
      case "lte": out[key] = { $lte: cv }; break;
      case "in": out[key] = { $in: toArray(cond.value).map((x) => (f ? coerceValue(f, x) : x)) }; break;
      case "is_empty": out[key] = { $in: [null, ""] }; break;
      case "is_not_empty": out[key] = { $nin: [null, ""] }; break;
    }
  }
  return out;
}
