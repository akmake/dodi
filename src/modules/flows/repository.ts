/**
 * Flow + FlowRun repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { Flow, FlowRun } from "./models";

export class FlowRepository extends Repository<Flow> {
  constructor() {
    super("flows");
  }

  listPublished(tenantId: string) {
    return this.findMany(tenantId, { status: "published", enabled: true } as Filter<Flow>);
  }

  /**
   * Upsert a flow under a caller-provided id (the Flow Builder generates ids
   * client-side and round-trips them). Create path bypasses the auto-uuid.
   *
   * `version` is owned here, not by the caller: it increments on every save so
   * it is monotonic and meaningful. Combined with the per-run graph snapshot
   * (FlowRun.graph), this is what makes editing a live flow safe for in-flight
   * runs (§8.1) — they keep executing the version they started on.
   */
  async saveBuilder(
    tenantId: string,
    id: string,
    data: Pick<Flow, "name" | "status" | "graph" | "keyword" | "enabled">
  ): Promise<Flow> {
    const existing = await this.findById(tenantId, id);
    if (existing) {
      const patch = { ...data, version: existing.version + 1 };
      return (await this.update(tenantId, id, patch)) ?? existing;
    }

    const now = new Date();
    const entity = { ...data, version: 1, id, tenantId, createdAt: now, updatedAt: now } as Flow;
    const col = await this.collection();
    await col.insertOne(entity as unknown as Parameters<typeof col.insertOne>[0]);
    return entity;
  }
}

export class FlowRunRepository extends Repository<FlowRun> {
  constructor() {
    super("flow_runs");
  }

  /** The active (waiting/running) run for a conversation, if any. */
  findActiveByConversation(tenantId: string, conversationId: string) {
    return this.findOne(tenantId, {
      conversationId,
      status: { $in: ["running", "waiting"] },
    } as Filter<FlowRun>);
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureFlowIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("flows").createIndex({ tenantId: 1, status: 1 }),
        db.collection("flow_runs").createIndex({ tenantId: 1, conversationId: 1, status: 1 }),
        db.collection("flow_versions").createIndex({ tenantId: 1, flowId: 1, version: -1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
