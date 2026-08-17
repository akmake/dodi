/**
 * Action repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { Action, ActionRun } from "./models";

export class ActionRepository extends Repository<Action> {
  constructor() {
    super("actions");
  }
  findByName(tenantId: string, name: string) {
    return this.findOne(tenantId, { name } as Filter<Action>);
  }
  listEnabled(tenantId: string) {
    return this.findMany(tenantId, { enabled: true } as Filter<Action>);
  }
}

export class ActionRunRepository extends Repository<ActionRun> {
  constructor() {
    super("action_runs");
  }
  findByIdempotencyKey(tenantId: string, key: string) {
    return this.findOne(tenantId, { idempotencyKey: key } as Filter<ActionRun>);
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureActionIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("actions").createIndex({ tenantId: 1, name: 1 }, { unique: true }),
        db.collection("action_runs").createIndex({ tenantId: 1, idempotencyKey: 1 }, { sparse: true }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
