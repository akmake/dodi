/**
 * AI Skills / procedures — [קטגוריה 11].
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";
import type { Filter } from "mongodb";

/** One ordered step of a structured procedure the AI follows for this skill (§11.2). */
export interface ProcedureStep {
  instruction: string;
  /** A field to collect from the customer at this step, if any. */
  collect?: string | null;
  /** An action/tool to invoke at this step, if any. */
  actionId?: string | null;
}

/** A point-in-time snapshot kept for the version history (§11.4). */
export interface SkillRevision {
  version: number;
  instructions: string;
  procedure: ProcedureStep[];
  at: Date;
}

export interface AISkill extends BaseEntity {
  name: string;
  description: string;
  intents: string[];
  instructions: string;
  /** Ordered steps composed into the prompt when this skill is active (§11.2). */
  procedure: ProcedureStep[];
  allowedActionIds: string[];
  knowledgeScope: string[];
  enabled: boolean;
  version: number;
  history?: SkillRevision[];
}

/**
 * Compose a skill's full guidance (instructions + numbered procedure) for the
 * system prompt. Shared by the live AI and the simulator so they stay identical.
 */
export function composeSkillPrompt(skill: AISkill): string {
  const lines = [`Skill פעיל: ${skill.name}`, skill.instructions];
  if (skill.procedure?.length) {
    lines.push("נוהל מובנה — בצע לפי הסדר:");
    skill.procedure.forEach((step, i) => {
      const extras = [
        step.collect ? `אסוף: ${step.collect}` : "",
        step.actionId ? `הפעל פעולה: ${step.actionId}` : "",
      ].filter(Boolean).join("; ");
      lines.push(`${i + 1}. ${step.instruction}${extras ? ` (${extras})` : ""}`);
    });
  }
  return lines.filter(Boolean).join("\n");
}

class SkillRepository extends Repository<AISkill> {
  constructor() {
    super("ai_skills");
  }
  listEnabled(tenantId: string) {
    return this.findMany(tenantId, { enabled: true } as Filter<AISkill>);
  }
}

const skills = new SkillRepository();

export interface SaveSkillInput {
  name: string;
  description?: string;
  intents?: string[];
  instructions: string;
  procedure?: ProcedureStep[];
  allowedActionIds?: string[];
  knowledgeScope?: string[];
  enabled?: boolean;
}

export async function saveSkill(tenantId: string, input: SaveSkillInput): Promise<AISkill> {
  await ensureSkillIndexes();
  return skills.create(tenantId, {
    name: input.name,
    description: input.description ?? "",
    intents: input.intents ?? [],
    instructions: input.instructions,
    procedure: input.procedure ?? [],
    allowedActionIds: input.allowedActionIds ?? [],
    knowledgeScope: input.knowledgeScope ?? [],
    enabled: input.enabled ?? true,
    version: 1,
    history: [],
  });
}

export function listSkills(tenantId: string): Promise<AISkill[]> {
  return skills.findMany(tenantId);
}

export function getSkill(tenantId: string, id: string): Promise<AISkill | null> {
  return skills.findById(tenantId, id);
}

/**
 * Update a skill. When its instructions or procedure change, snapshot the
 * previous version into history and bump the version number (§11.4).
 */
export async function updateSkill(
  tenantId: string,
  id: string,
  patch: Partial<SaveSkillInput>
): Promise<AISkill | null> {
  const current = await skills.findById(tenantId, id);
  if (!current) return null;
  const contentChanged =
    (patch.instructions !== undefined && patch.instructions !== current.instructions) ||
    (patch.procedure !== undefined && JSON.stringify(patch.procedure) !== JSON.stringify(current.procedure));
  const full: Partial<AISkill> = { ...(patch as Partial<AISkill>) };
  if (contentChanged) {
    const snapshot: SkillRevision = {
      version: current.version,
      instructions: current.instructions,
      procedure: current.procedure ?? [],
      at: new Date(),
    };
    full.version = current.version + 1;
    full.history = [...(current.history ?? []), snapshot];
  }
  return skills.update(tenantId, id, full);
}

export function deleteSkill(tenantId: string, id: string): Promise<boolean> {
  return skills.delete(tenantId, id);
}

export async function selectSkillForTurn(tenantId: string, intent: string, text: string): Promise<AISkill | null> {
  const enabled = await skills.listEnabled(tenantId);
  const normalized = intent.toLowerCase();
  return (
    enabled.find((s) => s.intents.map((i) => i.toLowerCase()).includes(normalized)) ??
    enabled.find((s) => text.toLowerCase().includes(s.name.toLowerCase())) ??
    null
  );
}

export async function ensureSkillIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("ai_skills").createIndex({ tenantId: 1, enabled: 1 }),
    db.collection("ai_skills").createIndex({ tenantId: 1, name: 1 }),
  ]);
}
