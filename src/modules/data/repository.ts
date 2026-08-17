/**
 * Repositories for the generic data platform ([קטגוריה 28]).
 * `data_collections` (table defs) + `data_records` (all rows, keyed by collectionId).
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter, UpdateFilter } from "mongodb";
import type { CollectionDef, DataRecord } from "./models";

export class CollectionRepository extends Repository<CollectionDef> {
  constructor() {
    super("data_collections");
  }
  findByName(tenantId: string, name: string): Promise<CollectionDef | null> {
    return this.findOne(tenantId, { name } as Filter<CollectionDef>);
  }
}

export class RecordRepository extends Repository<DataRecord> {
  constructor() {
    super("data_records");
  }

  async query(
    tenantId: string,
    collectionId: string,
    mongoFilter: Record<string, unknown>,
    sort?: { field: string; dir: "asc" | "desc" },
    limit?: number
  ): Promise<DataRecord[]> {
    const col = await this.collection();
    let cursor = col.find(this.scoped(tenantId, { collectionId, ...mongoFilter } as Filter<DataRecord>));
    if (sort?.field) cursor = cursor.sort({ [`data.${sort.field}`]: sort.dir === "desc" ? -1 : 1 });
    if (limit && limit > 0) cursor = cursor.limit(limit);
    return cursor.toArray() as Promise<DataRecord[]>;
  }

  async countByCollection(tenantId: string, collectionId: string): Promise<number> {
    const col = await this.collection();
    return col.countDocuments(this.scoped(tenantId, { collectionId } as Filter<DataRecord>));
  }

  /**
   * Group + reduce over `data.<field>` via a Mongo aggregation pipeline. Returns
   * one bucket per group (or a single null-group bucket when `groupBy` is unset).
   */
  async aggregate(
    tenantId: string,
    collectionId: string,
    mongoFilter: Record<string, unknown>,
    metric: "count" | "sum" | "avg" | "min" | "max",
    field?: string,
    groupBy?: string
  ): Promise<Array<{ group: unknown; value: number; count: number }>> {
    const col = await this.collection();
    const match = this.scoped(tenantId, { collectionId, ...mongoFilter } as Filter<DataRecord>);
    const valueExpr = field ? `$data.${field}` : 1;
    const valueAcc =
      metric === "count" ? { $sum: 1 } : { [`$${metric}`]: valueExpr };
    const rows = (await col
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: groupBy ? `$data.${groupBy}` : null,
            value: valueAcc,
            count: { $sum: 1 },
          },
        },
        { $sort: { value: -1 } },
      ])
      .toArray()) as Array<{ _id: unknown; value: number | null; count: number }>;
    return rows.map((r) => ({ group: r._id, value: r.value ?? 0, count: r.count }));
  }

  /** Does any row in this collection already have data.<field> === value? (uniqueness) */
  async existsWith(
    tenantId: string,
    collectionId: string,
    field: string,
    value: unknown,
    exceptId?: string
  ): Promise<boolean> {
    const col = await this.collection();
    const f: Record<string, unknown> = { collectionId, [`data.${field}`]: value };
    if (exceptId) f.id = { $ne: exceptId };
    return (await col.countDocuments(this.scoped(tenantId, f as Filter<DataRecord>))) > 0;
  }

  async updateByFilter(
    tenantId: string,
    collectionId: string,
    mongoFilter: Record<string, unknown>,
    dataPatch: Record<string, unknown>
  ): Promise<number> {
    const col = await this.collection();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(dataPatch)) set[`data.${k}`] = v;
    const res = await col.updateMany(
      this.scoped(tenantId, { collectionId, ...mongoFilter } as Filter<DataRecord>),
      { $set: set } as unknown as UpdateFilter<DataRecord>
    );
    return res.modifiedCount;
  }

  async deleteByFilter(
    tenantId: string,
    collectionId: string,
    mongoFilter: Record<string, unknown>
  ): Promise<number> {
    const col = await this.collection();
    const res = await col.deleteMany(
      this.scoped(tenantId, { collectionId, ...mongoFilter } as Filter<DataRecord>)
    );
    return res.deletedCount ?? 0;
  }

  async deleteByCollection(tenantId: string, collectionId: string): Promise<void> {
    const col = await this.collection();
    await col.deleteMany(this.scoped(tenantId, { collectionId } as Filter<DataRecord>));
  }

  /**
   * Atomically add `amount` to data.<field> of the first matching row. When
   * `guardNonNegative` and decrementing, only succeeds if the field stays ≥ 0 —
   * the safe primitive for inventory ("take one room, fail if none left").
   */
  async increment(
    tenantId: string,
    collectionId: string,
    mongoFilter: Record<string, unknown>,
    field: string,
    amount: number,
    guardNonNegative: boolean
  ): Promise<DataRecord | null> {
    const col = await this.collection();
    const guard =
      guardNonNegative && amount < 0 ? { [`data.${field}`]: { $gte: -amount } } : {};
    const res = await col.findOneAndUpdate(
      this.scoped(tenantId, { collectionId, ...mongoFilter, ...guard } as Filter<DataRecord>),
      { $inc: { [`data.${field}`]: amount }, $set: { updatedAt: new Date() } } as unknown as UpdateFilter<DataRecord>,
      { returnDocument: "after" }
    );
    return (res as DataRecord | null) ?? null;
  }
}

let indexesReady: Promise<void> | null = null;
export function ensureDataIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("data_collections").createIndex({ tenantId: 1, name: 1 }, { unique: true }),
        db.collection("data_records").createIndex({ tenantId: 1, collectionId: 1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
