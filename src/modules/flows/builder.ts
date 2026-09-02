/**
 * Flow Builder bridge — [קטגוריה 8].
 *
 * Converts between the visual builder's wire shape (react-flow nodes with
 * positions, edges with handles) and the persisted Flow model the engine runs.
 * Positions / UI-only fields ride along inside `FlowNode.data` so a save→load
 * round-trip is lossless, while the engine ignores them.
 */
import type { Flow, FlowGraph, FlowNodeType } from "./models";
import { FlowRepository, ensureFlowIndexes } from "./repository";
import { snapshotVersion } from "./versions";

export interface BuilderNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface BuilderEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
}

export interface BuilderFlow {
  id: string;
  name: string;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  active: boolean;
}

const flows = new FlowRepository();

function nodeType(n: BuilderNode): FlowNodeType {
  return (n.data.nodeType as FlowNodeType) ?? (n.type as FlowNodeType);
}

function toGraph(b: BuilderFlow): FlowGraph {
  return {
    nodes: b.nodes.map((n) => ({
      id: n.id,
      type: nodeType(n),
      data: { ...n.data, position: n.position },
    })),
    edges: b.edges.map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
    })),
  };
}

function startKeyword(b: BuilderFlow): string | null {
  const start = b.nodes.find((n) => nodeType(n) === "start");
  const kw = start?.data.keyword;
  return typeof kw === "string" && kw.trim() ? kw.trim() : null;
}

export async function saveBuilderFlow(tenantId: string, b: BuilderFlow): Promise<Flow> {
  await ensureFlowIndexes();
  const saved = await flows.saveBuilder(tenantId, b.id, {
    name: b.name,
    status: b.active ? "published" : "draft",
    graph: toGraph(b),
    keyword: startKeyword(b),
    enabled: b.active,
  });
  // Record the version for history/restore — never block the save if it fails.
  try {
    await snapshotVersion(tenantId, saved);
  } catch (err) {
    console.warn("[flows] version snapshot failed", err);
  }
  return saved;
}

/** Split a persisted FlowGraph back into the builder's node/edge wire shape. */
export function graphToBuilder(graph: FlowGraph): Pick<BuilderFlow, "nodes" | "edges"> {
  return {
    nodes: graph.nodes.map((n) => {
      const data = n.data as { position?: { x: number; y: number } } & Record<string, unknown>;
      const { position, ...rest } = data;
      return { id: n.id, type: n.type, position: position ?? { x: 0, y: 0 }, data: rest };
    }),
    edges: graph.edges.map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
      targetHandle: null,
    })),
  };
}

function toBuilder(flow: Flow): BuilderFlow {
  return {
    id: flow.id,
    name: flow.name,
    active: flow.enabled && flow.status === "published",
    ...graphToBuilder(flow.graph),
  };
}

export async function listBuilderFlows(tenantId: string): Promise<BuilderFlow[]> {
  await ensureFlowIndexes();
  return (await flows.findMany(tenantId)).map(toBuilder);
}

export function deleteFlow(tenantId: string, id: string): Promise<boolean> {
  return flows.delete(tenantId, id);
}
