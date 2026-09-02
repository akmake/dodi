/**
 * Flow version history ([קטגוריה 8] — "תיעוד + שחזור").
 *
 * Every `saveBuilderFlow` snapshots the just-saved flow here, so the author can
 * see what a flow was at any earlier save and restore it. Restore is done on the
 * client (load the old graph onto the canvas → Save), which produces a NEW
 * version — so nothing is ever lost and a restore is itself reversible.
 *
 * History is capped per flow (MAX_VERSIONS_PER_FLOW) to bound growth.
 */
import { Repository } from "@/core/db/repository";
import type { Filter } from "mongodb";
import type { Flow, FlowStatus, FlowVersion } from "./models";

const MAX_VERSIONS_PER_FLOW = 50;

class FlowVersionRepository extends Repository<FlowVersion> {
  constructor() {
    super("flow_versions");
  }

  async listByFlow(tenantId: string, flowId: string): Promise<FlowVersion[]> {
    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, { flowId } as Filter<FlowVersion>))
      .sort({ version: -1 })
      .limit(MAX_VERSIONS_PER_FLOW)
      .toArray() as Promise<FlowVersion[]>;
  }

  getVersion(tenantId: string, flowId: string, version: number): Promise<FlowVersion | null> {
    return this.findOne(tenantId, { flowId, version } as Filter<FlowVersion>);
  }

  /** Drop versions older than the newest MAX_VERSIONS_PER_FLOW for a flow. */
  async prune(tenantId: string, flowId: string): Promise<void> {
    const col = await this.collection();
    const keep = await col
      .find(this.scoped(tenantId, { flowId } as Filter<FlowVersion>))
      .sort({ version: -1 })
      .limit(MAX_VERSIONS_PER_FLOW)
      .project<{ version: number }>({ version: 1 })
      .toArray();
    if (keep.length < MAX_VERSIONS_PER_FLOW) return;
    const minKeep = keep[keep.length - 1].version;
    await col.deleteMany(
      this.scoped(tenantId, { flowId, version: { $lt: minKeep } } as Filter<FlowVersion>)
    );
  }
}

const versions = new FlowVersionRepository();

/** Metadata-only view for the history list (graphs stay out of the list payload). */
export interface FlowVersionSummary {
  version: number;
  name: string;
  status: FlowStatus;
  enabled: boolean;
  savedAt: Date;
  nodeCount: number;
  edgeCount: number;
}

/** Record the just-saved flow as a version. Best-effort — callers don't fail a save on this. */
export async function snapshotVersion(tenantId: string, flow: Flow): Promise<void> {
  // saveBuilder bumps `version` on every save, so a version is recorded once.
  if (await versions.getVersion(tenantId, flow.id, flow.version)) return;
  await versions.create(tenantId, {
    flowId: flow.id,
    version: flow.version,
    name: flow.name,
    status: flow.status,
    keyword: flow.keyword,
    enabled: flow.enabled,
    graph: flow.graph,
    savedAt: new Date(),
  });
  await versions.prune(tenantId, flow.id);
}

export async function listVersions(tenantId: string, flowId: string): Promise<FlowVersionSummary[]> {
  const all = await versions.listByFlow(tenantId, flowId);
  return all.map((v) => ({
    version: v.version,
    name: v.name,
    status: v.status,
    enabled: v.enabled,
    savedAt: v.savedAt,
    nodeCount: v.graph?.nodes?.length ?? 0,
    edgeCount: v.graph?.edges?.length ?? 0,
  }));
}

export function getVersion(
  tenantId: string,
  flowId: string,
  version: number
): Promise<FlowVersion | null> {
  return versions.getVersion(tenantId, flowId, version);
}
