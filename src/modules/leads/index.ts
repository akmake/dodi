/**
 * Lead Management / Sales — [קטגוריה 21].
 *
 * Capture → qualify/score → pipeline → owner assignment → follow-up → conversion.
 * Builds on existing layers: Contacts ([4]) for identity, Routing ([17]) for
 * owner assignment, the job queue for drip follow-ups, and the Analytics event
 * store ([23]) for conversion attribution.
 *
 * Dependency direction stays clean: this module sits ABOVE contacts/routing and
 * never imports a higher layer.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import { enqueue } from "@/core/jobs";
import { track } from "@/modules/analytics/events";
import { emitEvent } from "@/modules/integrations";
import { resolveTarget } from "@/modules/routing";
import { ContactRepository } from "@/modules/contacts/repository";
import {
  type Lead,
  type LeadSource,
  type LeadStatus,
  type LeadSourceMeta,
  type PipelineStage,
  DEFAULT_STAGES,
  SCORING,
} from "./models";

export * from "./models";

class LeadRepository extends Repository<Lead> {
  constructor() {
    super("leads");
  }
  /** An active (non-terminal) lead for a contact, if any — used for dedup. */
  findOpenByContact(tenantId: string, contactId: string) {
    return this.findOne(tenantId, {
      contactId,
      status: { $nin: ["won", "lost"] },
    } as Filter<Lead>);
  }
}

class PipelineStageRepository extends Repository<PipelineStage> {
  constructor() {
    super("pipeline_stages");
  }
}

const leads = new LeadRepository();
const stages = new PipelineStageRepository();
const contacts = new ContactRepository();

// ─── Pipeline stages ────────────────────────────────────────────────────────

/** Return the tenant's stages, seeding the default funnel on first use (§21.3). */
export async function ensureDefaultPipeline(tenantId: string): Promise<PipelineStage[]> {
  const existing = await stages.findMany(tenantId);
  if (existing.length > 0) return sortStages(existing);
  for (const s of DEFAULT_STAGES) await stages.create(tenantId, s);
  return sortStages(await stages.findMany(tenantId));
}

export function listStages(tenantId: string): Promise<PipelineStage[]> {
  return stages.findMany(tenantId).then(sortStages);
}

export function createStage(
  tenantId: string,
  input: { name: string; order?: number; isWon?: boolean; isLost?: boolean }
): Promise<PipelineStage> {
  return stages.create(tenantId, {
    name: input.name,
    order: input.order ?? 0,
    isWon: input.isWon ?? false,
    isLost: input.isLost ?? false,
  });
}

export function updateStage(tenantId: string, id: string, patch: Partial<PipelineStage>) {
  return stages.update(tenantId, id, patch);
}

export function deleteStage(tenantId: string, id: string) {
  return stages.delete(tenantId, id);
}

function sortStages(list: PipelineStage[]): PipelineStage[] {
  return [...list].sort((a, b) => a.order - b.order);
}

// ─── Lead capture ─────────────────────────────────────────────────────────────

export interface CaptureLeadInput {
  contactId: string;
  source?: LeadSource;
  sourceMeta?: LeadSourceMeta;
  estimatedValue?: number | null;
  qualification?: Record<string, unknown>;
}

/**
 * Create a lead for a contact, or return the existing open one (dedup by
 * contact, §21.1). Seeds the pipeline and lands the lead in the first stage.
 */
export async function captureLead(tenantId: string, input: CaptureLeadInput): Promise<Lead> {
  const open = await leads.findOpenByContact(tenantId, input.contactId);
  if (open) return open;

  const pipeline = await ensureDefaultPipeline(tenantId);
  const firstStage = pipeline[0] ?? null;

  const lead = await leads.create(tenantId, {
    contactId: input.contactId,
    source: input.source ?? "inbound",
    sourceMeta: input.sourceMeta ?? {},
    status: "new",
    score: 0,
    ownerId: null,
    pipelineStageId: firstStage?.id ?? null,
    estimatedValue: input.estimatedValue ?? null,
    qualification: input.qualification ?? {},
    lostReason: null,
    lastActivityAt: new Date(),
  });

  // Initial score from any qualification provided at capture.
  if (input.qualification && Object.keys(input.qualification).length) {
    await qualify(tenantId, lead.id, input.qualification);
  }

  void track(tenantId, "lead_created", {
    contactId: lead.contactId,
    leadId: lead.id,
    attributes: { source: lead.source },
  });
  void emitEvent(tenantId, "lead_created", {
    lead_id: lead.id,
    contact_id: lead.contactId,
    source: lead.source,
  });
  return (await leads.findById(tenantId, lead.id)) ?? lead;
}

// ─── Scoring & qualification ──────────────────────────────────────────────────

interface SignalCounts {
  [signal: string]: number;
}

/** Recompute 0..100 score from filled BANT fields + recorded behaviour signals. */
export function computeScore(qualification: Record<string, unknown>): number {
  let score = 0;
  for (const [field, weight] of Object.entries(SCORING.qualificationFields)) {
    const v = qualification[field];
    if (v !== undefined && v !== null && v !== "") score += weight;
  }
  const signals = (qualification._signals as SignalCounts | undefined) ?? {};
  for (const [signal, weight] of Object.entries(SCORING.signals)) {
    score += (signals[signal] ?? 0) * weight;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Merge qualification answers, recompute score, and auto-qualify + assign when
 * the score crosses the threshold (§21.2).
 */
export async function qualify(
  tenantId: string,
  leadId: string,
  answers: Record<string, unknown>
): Promise<Lead | null> {
  const lead = await leads.findById(tenantId, leadId);
  if (!lead) return null;

  const qualification = { ...lead.qualification, ...answers };
  const score = computeScore(qualification);
  const crossed = score >= SCORING.qualifiedAt && (lead.status === "new" || lead.status === "contacted");

  const updated = await leads.update(tenantId, leadId, {
    qualification,
    score,
    status: crossed ? "qualified" : lead.status,
    lastActivityAt: new Date(),
  });

  if (crossed && updated && !updated.ownerId) await assignOwner(tenantId, leadId);
  return (await leads.findById(tenantId, leadId)) ?? updated;
}

/** Record a behaviour signal (replied/clicked/visited…) and rescore (§21.2). */
export async function recordSignal(
  tenantId: string,
  leadId: string,
  signal: keyof typeof SCORING.signals | string
): Promise<Lead | null> {
  const lead = await leads.findById(tenantId, leadId);
  if (!lead) return null;
  const signals: SignalCounts = { ...(lead.qualification._signals as SignalCounts | undefined) };
  signals[signal] = (signals[signal] ?? 0) + 1;
  return qualify(tenantId, leadId, { _signals: signals });
}

// ─── Pipeline & ownership ─────────────────────────────────────────────────────

/**
 * Assign an owner. Explicit `ownerId` wins; otherwise resolve via Routing
 * ([17]) using the contact context (round-robin/capacity).
 */
export async function assignOwner(
  tenantId: string,
  leadId: string,
  ownerId?: string
): Promise<Lead | null> {
  const lead = await leads.findById(tenantId, leadId);
  if (!lead) return null;

  let resolved = ownerId ?? null;
  if (!resolved) {
    const contact = await contacts.findById(tenantId, lead.contactId);
    const target = await resolveTarget(tenantId, {
      contact: (contact as unknown as Record<string, unknown>) ?? null,
      conversation: null,
      now: new Date(),
    });
    resolved = target?.agentId ?? null;
  }
  return leads.update(tenantId, leadId, { ownerId: resolved, lastActivityAt: new Date() });
}

/**
 * Move a lead to a pipeline stage. Terminal stages settle the status and a `won`
 * move emits a `conversion` event for analytics/attribution (§21.4 / [23]).
 */
export async function moveStage(
  tenantId: string,
  leadId: string,
  stageId: string
): Promise<Lead | null> {
  const lead = await leads.findById(tenantId, leadId);
  if (!lead) return null;
  const stage = await stages.findById(tenantId, stageId);
  if (!stage) throw new Error("stage not found");

  const status: LeadStatus = stage.isWon ? "won" : stage.isLost ? "lost" : lead.status;
  const updated = await leads.update(tenantId, leadId, {
    pipelineStageId: stageId,
    status,
    lastActivityAt: new Date(),
  });

  void track(tenantId, "lead_stage_changed", {
    contactId: lead.contactId,
    leadId,
    attributes: { stage: stage.name, status },
  });
  if (stage.isWon) {
    void track(tenantId, "conversion", {
      contactId: lead.contactId,
      leadId,
      attributes: { value: lead.estimatedValue ?? 0 },
    });
  }
  return updated;
}

// ─── Reads & generic updates ──────────────────────────────────────────────────

export interface ListLeadsFilter {
  status?: LeadStatus;
  stageId?: string;
  ownerId?: string;
}

export function listLeads(tenantId: string, filter: ListLeadsFilter = {}): Promise<Lead[]> {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.stageId) q.pipelineStageId = filter.stageId;
  if (filter.ownerId) q.ownerId = filter.ownerId;
  return leads.findMany(tenantId, q as Filter<Lead>);
}

export function getLead(tenantId: string, id: string) {
  return leads.findById(tenantId, id);
}

const MUTABLE: Array<keyof Lead> = ["estimatedValue", "lostReason", "sourceMeta", "status"];

export async function updateLead(
  tenantId: string,
  id: string,
  patch: Partial<Lead>
): Promise<Lead | null> {
  const allowed: Partial<Lead> = {};
  for (const k of MUTABLE) if (k in patch) (allowed as Record<string, unknown>)[k] = patch[k];
  return leads.update(tenantId, id, { ...allowed, lastActivityAt: new Date() });
}

// ─── Follow-up drip (§21.4) ───────────────────────────────────────────────────

/** Schedule a follow-up nudge for a stalled lead. */
export async function scheduleFollowup(
  tenantId: string,
  leadId: string,
  runAt: Date
): Promise<string> {
  return enqueue(tenantId, "lead.followup", { leadId }, runAt);
}

/**
 * Drain handler for `lead.followup`. Best-effort nudge: skipped if the lead has
 * since closed or already moved. Messaging itself is left to a follow-up flow
 * when configured; here we record the touch and emit a signal.
 */
export async function runFollowup(tenantId: string, leadId: string): Promise<void> {
  const lead = await leads.findById(tenantId, leadId);
  if (!lead || lead.status === "won" || lead.status === "lost") return;
  await recordSignal(tenantId, leadId, "opened");
}

export async function ensureLeadIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("leads").createIndex({ tenantId: 1, contactId: 1, status: 1 }),
    db.collection("leads").createIndex({ tenantId: 1, pipelineStageId: 1 }),
    db.collection("leads").createIndex({ tenantId: 1, ownerId: 1 }),
    db.collection("pipeline_stages").createIndex({ tenantId: 1, order: 1 }),
  ]);
}
