/**
 * Generic tenant-scoped repository.
 *
 * Every method takes `tenantId` first and folds it into the Mongo filter, so a
 * query can never accidentally cross tenants. Domain repositories extend this
 * and add their own methods; they inherit isolation for free.
 *
 * We use the native driver (no ORM) for full control and to avoid Mongoose's
 * model-recompilation pitfalls under Next.js. Documents store `id` (app UUID)
 * separately from Mongo's `_id`.
 */
import { randomUUID } from "crypto";
import type {
  Collection,
  Filter,
  OptionalUnlessRequiredId,
  UpdateFilter,
} from "mongodb";
import { getDb } from "./mongo";
import type { BaseEntity, CreateInput } from "../types";

export class Repository<T extends BaseEntity> {
  constructor(private readonly collectionName: string) {}

  protected async collection(): Promise<Collection<T>> {
    const db = await getDb();
    return db.collection<T>(this.collectionName);
  }

  /** Merge tenant scoping into any caller-supplied filter. */
  protected scoped(tenantId: string, filter: Filter<T> = {}): Filter<T> {
    return { ...filter, tenantId } as Filter<T>;
  }

  async create(tenantId: string, data: CreateInput<T>): Promise<T> {
    const now = new Date();
    const entity = {
      ...data,
      id: randomUUID(),
      tenantId,
      createdAt: now,
      updatedAt: now,
    } as unknown as T;

    const col = await this.collection();
    await col.insertOne(entity as OptionalUnlessRequiredId<T>);
    return entity;
  }

  async findById(tenantId: string, id: string): Promise<T | null> {
    const col = await this.collection();
    return col.findOne(this.scoped(tenantId, { id } as Filter<T>)) as Promise<T | null>;
  }

  async findOne(tenantId: string, filter: Filter<T>): Promise<T | null> {
    const col = await this.collection();
    return col.findOne(this.scoped(tenantId, filter)) as Promise<T | null>;
  }

  async findMany(tenantId: string, filter: Filter<T> = {}): Promise<T[]> {
    const col = await this.collection();
    return col.find(this.scoped(tenantId, filter)).toArray() as Promise<T[]>;
  }

  async update(tenantId: string, id: string, patch: Partial<T>): Promise<T | null> {
    const col = await this.collection();
    const update = {
      $set: { ...patch, updatedAt: new Date() },
    } as unknown as UpdateFilter<T>;
    const result = await col.findOneAndUpdate(
      this.scoped(tenantId, { id } as Filter<T>),
      update,
      { returnDocument: "after" }
    );
    return (result as T | null) ?? null;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const col = await this.collection();
    const result = await col.deleteOne(this.scoped(tenantId, { id } as Filter<T>));
    return result.deletedCount === 1;
  }
}
