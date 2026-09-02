/**
 * AI agent config versioning + A/B testing — [קטגוריה 24.5].
 *
 * The tunable part of the agent (persona / tone / extra rules) is captured as a
 * versioned `AgentConfig`. An `AgentExperiment` splits live traffic between two
 * versions deterministically per conversation, so a customer always sees the same
 * variant, and per-variant outcomes are read back from the analytics event store
 * (events tagged with { experiment, variant }).
 *
 * Collections: `ai_agent_configs`, `ai_experiments`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";
import type { Filter } from "mongodb";

export interface AgentConfig extends BaseEntity {
  version: number;
  label: string;
  /** Extra system-prompt guidance appended for this version (persona/tone/rules). */
  systemPrompt: string;
  active: boolean;
}

export interface AgentExperiment extends BaseEntity {
  name: string;
  variantAConfigId: string;
  variantBConfigId: string;
  /** Share of traffic to variant A, 0..1 (the rest goes to B). */
  splitA: number;
  active: boolean;
}

class AgentConfigRepository extends Repository<AgentConfig> {
  constructor() {
    super("ai_agent_configs");
  }
  findActive(tenantId: string) {
    return this.findOne(tenantId, { active: true } as Filter<AgentConfig>);
  }
}
class AgentExperimentRepository extends Repository<AgentExperiment> {
  constructor() {
    super("ai_experiments");
  }
  findActive(tenantId: string) {
    return this.findOne(tenantId, { active: true } as Filter<AgentExperiment>);
  }
}

const configs = new AgentConfigRepository();
const experiments = new AgentExperimentRepository();

// ─── Config versions (§24.5) ──────────────────────────────────────────────────
export async function listConfigVersions(tenantId: string): Promise<AgentConfig[]> {
  await ensureAgentIndexes();
  return (await configs.findMany(tenantId)).sort((a, b) => b.version - a.version);
}

/** Create a new version. The first version created becomes active automatically. */
export async function createConfigVersion(
  tenantId: string,
  input: { label: string; systemPrompt: string }
): Promise<AgentConfig> {
  await ensureAgentIndexes();
  const all = await configs.findMany(tenantId);
  const version = all.reduce((mx, c) => Math.max(mx, c.version), 0) + 1;
  return configs.create(tenantId, {
    version,
    label: input.label,
    systemPrompt: input.systemPrompt,
    active: all.length === 0,
  });
}

/** Make one version the active one (deactivates the rest). */
export async function activateConfig(tenantId: string, id: string): Promise<AgentConfig | null> {
  const target = await configs.findById(tenantId, id);
  if (!target) return null;
  const all = await configs.findMany(tenantId);
  for (const c of all) if (c.active && c.id !== id) await configs.update(tenantId, c.id, { active: false });
  return configs.update(tenantId, id, { active: true });
}

export function getActiveConfig(tenantId: string): Promise<AgentConfig | null> {
  return configs.findActive(tenantId);
}

// ─── A/B experiment (§24.5) ───────────────────────────────────────────────────
export async function createExperiment(
  tenantId: string,
  input: { name: string; variantAConfigId: string; variantBConfigId: string; splitA?: number }
): Promise<AgentExperiment> {
  await ensureAgentIndexes();
  // Only one active experiment at a time — deactivate any prior.
  const prior = await experiments.findActive(tenantId);
  if (prior) await experiments.update(tenantId, prior.id, { active: false });
  return experiments.create(tenantId, {
    name: input.name,
    variantAConfigId: input.variantAConfigId,
    variantBConfigId: input.variantBConfigId,
    splitA: input.splitA ?? 0.5,
    active: true,
  });
}

export function getActiveExperiment(tenantId: string): Promise<AgentExperiment | null> {
  return experiments.findActive(tenantId);
}

export function listExperiments(tenantId: string): Promise<AgentExperiment[]> {
  return experiments.findMany(tenantId);
}

export async function stopExperiment(tenantId: string, id: string): Promise<AgentExperiment | null> {
  return experiments.update(tenantId, id, { active: false });
}

/** Stable 0..1 hash of a key, so a conversation always lands in the same bucket. */
function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface ResolvedAgent {
  configId: string | null;
  version: number | null;
  systemPrompt: string;
  experimentId: string | null;
  variant: "A" | "B" | null;
}

/**
 * Resolve the agent guidance for a conversation: if an experiment is active, pick
 * a stable variant; otherwise use the active config. Returns the systemPrompt
 * addition plus the variant tag to attribute analytics outcomes (§24.5).
 */
export async function resolveAgentContext(
  tenantId: string,
  conversationId: string
): Promise<ResolvedAgent> {
  const experiment = await experiments.findActive(tenantId);
  if (experiment) {
    const variant: "A" | "B" = hashUnit(conversationId) < experiment.splitA ? "A" : "B";
    const configId = variant === "A" ? experiment.variantAConfigId : experiment.variantBConfigId;
    const config = await configs.findById(tenantId, configId);
    return {
      configId: config?.id ?? null,
      version: config?.version ?? null,
      systemPrompt: config?.systemPrompt ?? "",
      experimentId: experiment.id,
      variant,
    };
  }
  const active = await configs.findActive(tenantId);
  return {
    configId: active?.id ?? null,
    version: active?.version ?? null,
    systemPrompt: active?.systemPrompt ?? "",
    experimentId: null,
    variant: null,
  };
}

export async function ensureAgentIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("ai_agent_configs").createIndex({ tenantId: 1, active: 1 }),
    db.collection("ai_experiments").createIndex({ tenantId: 1, active: 1 }),
  ]);
}
