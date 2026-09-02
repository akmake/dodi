/**
 * Routing — [קטגוריה 17].
 *
 * Decides who handles an inbound/handoff: agent, team, bot or queue. Rules match
 * in priority order (condition tree, [קטגוריה 7]); within a team an assignment
 * strategy picks the agent. Collection: `routing_rules`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { BaseEntity } from "@/core/types";
import { evaluate, type ConditionExpr, type EvaluationContext } from "@/modules/conditions";
import { TeamRepository } from "@/modules/admin/repository";
import { ConversationRepository } from "@/modules/whatsapp/repository";
import type { Conversation } from "@/modules/whatsapp/models";

export type RoutingTargetType = "agent" | "team" | "bot" | "queue" | "external";
export type AssignmentStrategy = "round_robin" | "capacity_based" | "skill_based" | "predictive";

export type PresenceStatus = "online" | "away" | "offline";

export interface RoutingRule extends BaseEntity {
  priority: number;
  match: ConditionExpr | null;
  target: { type: RoutingTargetType; id: string | null };
  assignmentStrategy: AssignmentStrategy;
  /** Skills an agent must have for skill_based/predictive strategies (§17.2). */
  requiredSkills: string[];
  enabled: boolean;
}

/** Per-agent presence + skills + capacity, the live state assignment draws on (§17.1). */
export interface AgentPresence extends BaseEntity {
  agentId: string;
  status: PresenceStatus;
  skills: string[];
  /** Max concurrent open conversations before the agent is considered full. */
  maxCapacity: number;
  lastSeenAt: Date;
}

export interface ResolvedTarget {
  type: RoutingTargetType;
  teamId: string | null;
  agentId: string | null;
}

class RoutingRuleRepository extends Repository<RoutingRule> {
  constructor() {
    super("routing_rules");
  }
  listEnabled(tenantId: string) {
    return this.findMany(tenantId, { enabled: true } as Filter<RoutingRule>);
  }
}

class AgentPresenceRepository extends Repository<AgentPresence> {
  constructor() {
    super("agent_presence");
  }
  findByAgent(tenantId: string, agentId: string) {
    return this.findOne(tenantId, { agentId } as Filter<AgentPresence>);
  }
}

const rules = new RoutingRuleRepository();
const presence = new AgentPresenceRepository();
const teams = new TeamRepository();
const conversations = new ConversationRepository();

export interface CreateRuleInput {
  priority?: number;
  match?: ConditionExpr | null;
  target: { type: RoutingTargetType; id: string | null };
  assignmentStrategy?: AssignmentStrategy;
  requiredSkills?: string[];
}

export async function createRule(tenantId: string, input: CreateRuleInput): Promise<RoutingRule> {
  return rules.create(tenantId, {
    priority: input.priority ?? 0,
    match: input.match ?? null,
    target: input.target,
    assignmentStrategy: input.assignmentStrategy ?? "round_robin",
    requiredSkills: input.requiredSkills ?? [],
    enabled: true,
  });
}

// ─── Agent presence & skills (§17.1) ──────────────────────────────────────────
export function listPresence(tenantId: string): Promise<AgentPresence[]> {
  return presence.findMany(tenantId);
}

export function getPresence(tenantId: string, agentId: string): Promise<AgentPresence | null> {
  return presence.findByAgent(tenantId, agentId);
}

/** Upsert an agent's presence/skills/capacity (heartbeat from the inbox client). */
export async function setPresence(
  tenantId: string,
  agentId: string,
  patch: Partial<Pick<AgentPresence, "status" | "skills" | "maxCapacity">>
): Promise<AgentPresence> {
  const existing = await presence.findByAgent(tenantId, agentId);
  const data = {
    agentId,
    status: patch.status ?? existing?.status ?? "offline",
    skills: patch.skills ?? existing?.skills ?? [],
    maxCapacity: patch.maxCapacity ?? existing?.maxCapacity ?? 5,
    lastSeenAt: new Date(),
  };
  if (existing) return (await presence.update(tenantId, existing.id, data)) ?? existing;
  return presence.create(tenantId, data);
}

export function listRules(tenantId: string) {
  return rules.findMany(tenantId);
}

/**
 * Resolve a target for a conversation context. Returns null if no rule matches
 * (caller falls back to an unassigned queue).
 */
export async function resolveTarget(
  tenantId: string,
  context: EvaluationContext
): Promise<ResolvedTarget | null> {
  const all = (await rules.listEnabled(tenantId)).sort((a, b) => b.priority - a.priority);

  for (const rule of all) {
    if (!evaluate(rule.match, context)) continue;

    if (rule.target.type === "agent") {
      return { type: "agent", teamId: null, agentId: rule.target.id };
    }
    if (rule.target.type === "team" && rule.target.id) {
      const agentId = await pickAgent(tenantId, rule.target.id, rule.assignmentStrategy, rule.requiredSkills ?? []);
      return { type: "team", teamId: rule.target.id, agentId };
    }
    return { type: rule.target.type, teamId: null, agentId: null };
  }
  return null;
}

/** Open-conversation load for an agent. */
async function agentLoad(tenantId: string, agentId: string): Promise<number> {
  const open = await conversations.findMany(tenantId, {
    assigneeId: agentId,
    status: { $in: ["open", "pending"] },
  } as Filter<Conversation>);
  return open.length;
}

interface Candidate {
  agentId: string;
  presence: AgentPresence | null;
  load: number;
}

const PRESENCE_RANK: Record<PresenceStatus, number> = { online: 2, away: 1, offline: 0 };

/**
 * Choose an agent within a team per the strategy. All strategies are now
 * presence-aware (offline agents are excluded when any online/away agent
 * exists) and respect per-agent capacity (§17). skill_based filters by the
 * rule's required skills; predictive ranks by presence × free-capacity.
 */
async function pickAgent(
  tenantId: string,
  teamId: string,
  strategy: AssignmentStrategy,
  requiredSkills: string[]
): Promise<string | null> {
  const team = await teams.findById(tenantId, teamId);
  const members = team?.memberIds ?? [];
  if (members.length === 0) return null;

  // Build candidates with live presence + load.
  let candidates: Candidate[] = await Promise.all(
    members.map(async (agentId) => ({
      agentId,
      presence: await presence.findByAgent(tenantId, agentId),
      load: await agentLoad(tenantId, agentId),
    }))
  );

  // Skill gate (skill_based / predictive use it; others ignore an empty list).
  if (requiredSkills.length && (strategy === "skill_based" || strategy === "predictive")) {
    const skilled = candidates.filter((c) => requiredSkills.every((s) => c.presence?.skills.includes(s)));
    if (skilled.length) candidates = skilled;
  }

  // Presence gate: drop offline agents if anyone reachable remains. Agents with
  // no presence record are treated as available (presence is opt-in).
  const reachable = candidates.filter((c) => !c.presence || c.presence.status !== "offline");
  if (reachable.length) candidates = reachable;

  // Capacity gate: prefer agents under their max; if all are full, keep all.
  const underCap = candidates.filter((c) => c.load < (c.presence?.maxCapacity ?? Infinity));
  if (underCap.length) candidates = underCap;
  if (candidates.length === 0) return members[0] ?? null;

  if (strategy === "capacity_based" || strategy === "skill_based") {
    return candidates.reduce((best, c) => (c.load < best.load ? c : best)).agentId;
  }
  if (strategy === "predictive") {
    // Highest score: more present + more free capacity. Tie-break on lower load.
    const score = (c: Candidate) => {
      const pr = c.presence ? PRESENCE_RANK[c.presence.status] : 1;
      const cap = c.presence?.maxCapacity ?? 5;
      const free = Math.max(0, cap - c.load) / cap;
      return pr * 2 + free;
    };
    return candidates.reduce((best, c) => (score(c) > score(best) ? c : best)).agentId;
  }

  // round_robin / default: rotate among the eligible candidates.
  return candidates[Math.floor(Date.now() / 1000) % candidates.length].agentId;
}

export async function ensureRoutingIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("routing_rules").createIndex({ tenantId: 1, enabled: 1, priority: -1 }),
    db.collection("agent_presence").createIndex({ tenantId: 1, agentId: 1 }, { unique: true }),
  ]);
}
