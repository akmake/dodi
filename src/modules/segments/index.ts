/**
 * Segments / Audience — [קטגוריה 5].
 *
 * A Segment is a saved audience defined by a condition tree ([קטגוריה 7]) over
 * contacts. Dynamic segments are evaluated on demand; static segments freeze a
 * member snapshot. Feeds Campaigns ([18]) and Routing ([17]). Collection:
 * `segments`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { BaseEntity } from "@/core/types";
import { evaluate, type ConditionExpr } from "@/modules/conditions";
import { ContactRepository } from "@/modules/contacts/repository";
import type { Contact } from "@/modules/contacts/models";
import { enqueue } from "@/core/jobs";
import { fireAutomationEvent } from "@/modules/triggers/events";

export interface Segment extends BaseEntity {
  name: string;
  type: "dynamic" | "static";
  definition: ConditionExpr;
  excludeSegmentIds: string[];
  estimatedSize: number;
  refreshedAt: Date | null;
  /** Static snapshot or last dynamic snapshot (used for enter/exit triggers). */
  memberIds: string[] | null;
  refreshEveryMinutes: number | null;
}

class SegmentRepository extends Repository<Segment> {
  constructor() {
    super("segments");
  }
}

const segments = new SegmentRepository();
const contacts = new ContactRepository();

export interface CreateSegmentInput {
  name: string;
  type?: "dynamic" | "static";
  definition: ConditionExpr;
  excludeSegmentIds?: string[];
  refreshEveryMinutes?: number | null;
}

export async function createSegment(tenantId: string, input: CreateSegmentInput): Promise<Segment> {
  const members = await computeMembers(tenantId, input.definition, input.excludeSegmentIds ?? []);
  return segments.create(tenantId, {
    name: input.name,
    type: input.type ?? "dynamic",
    definition: input.definition,
    excludeSegmentIds: input.excludeSegmentIds ?? [],
    estimatedSize: members.length,
    refreshedAt: new Date(),
    memberIds: members,
    refreshEveryMinutes: input.refreshEveryMinutes ?? null,
  });
}

export function listSegments(tenantId: string) {
  return segments.findMany(tenantId);
}

export function getSegment(tenantId: string, id: string) {
  return segments.findById(tenantId, id);
}

export interface UpdateSegmentInput {
  name?: string;
  definition?: ConditionExpr;
  excludeSegmentIds?: string[];
  refreshEveryMinutes?: number | null;
}

/** Update a segment; recomputes membership when the definition/exclusions change. */
export async function updateSegment(
  tenantId: string,
  id: string,
  input: UpdateSegmentInput
): Promise<Segment | null> {
  const segment = await segments.findById(tenantId, id);
  if (!segment) return null;
  const patch: Partial<Segment> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.refreshEveryMinutes !== undefined) patch.refreshEveryMinutes = input.refreshEveryMinutes;

  if (input.definition !== undefined || input.excludeSegmentIds !== undefined) {
    const definition = input.definition ?? segment.definition;
    const excludes = input.excludeSegmentIds ?? segment.excludeSegmentIds;
    const members = await computeMembers(tenantId, definition, excludes);
    patch.definition = definition;
    patch.excludeSegmentIds = excludes;
    patch.memberIds = members;
    patch.estimatedSize = members.length;
    patch.refreshedAt = new Date();
  }
  return segments.update(tenantId, id, patch);
}

export function deleteSegment(tenantId: string, id: string): Promise<boolean> {
  return segments.delete(tenantId, id);
}

/** Resolve a segment's current member contacts (dynamic) or snapshot (static). */
export async function resolveMembers(tenantId: string, segment: Segment): Promise<Contact[]> {
  if (segment.type === "static" && segment.memberIds) {
    return contacts.findMany(tenantId, { id: { $in: segment.memberIds } } as Filter<Contact>);
  }
  const ids = await computeMembers(tenantId, segment.definition, segment.excludeSegmentIds);
  return contacts.findMany(tenantId, { id: { $in: ids } } as Filter<Contact>);
}

/** Recompute estimated size (and snapshot for static). */
export async function refreshSegment(tenantId: string, id: string): Promise<Segment | null> {
  const segment = await segments.findById(tenantId, id);
  if (!segment) return null;
  const before = new Set(segment.memberIds ?? []);
  const members = await computeMembers(tenantId, segment.definition, segment.excludeSegmentIds);
  const after = new Set(members);

  await emitMembershipChanges(tenantId, segment, before, after);
  const updated = await segments.update(tenantId, id, {
    estimatedSize: members.length,
    refreshedAt: new Date(),
    memberIds: members,
  });
  if (segment.refreshEveryMinutes && segment.refreshEveryMinutes > 0) {
    await scheduleSegmentRefresh(
      tenantId,
      id,
      new Date(Date.now() + segment.refreshEveryMinutes * 60 * 1000)
    );
  }
  return updated;
}

export async function scheduleSegmentRefresh(
  tenantId: string,
  id: string,
  runAt: Date = new Date()
): Promise<void> {
  const segment = await segments.findById(tenantId, id);
  if (!segment) throw new Error("segment not found");
  await enqueue(tenantId, "segment.refresh", { segmentId: id }, runAt);
}

/** Evaluate the definition over all contacts, minus excluded-segment members. */
async function computeMembers(
  tenantId: string,
  definition: ConditionExpr,
  excludeSegmentIds: string[]
): Promise<string[]> {
  const all = await contacts.findMany(tenantId);
  const matched = all
    .filter((c) => evaluate(definition, { contact: c as unknown as Record<string, unknown> }))
    .map((c) => c.id);

  if (excludeSegmentIds.length === 0) return matched;

  const excluded = new Set<string>();
  for (const segId of excludeSegmentIds) {
    const seg = await segments.findById(tenantId, segId);
    if (!seg) continue;
    for (const id of await computeMembers(tenantId, seg.definition, [])) excluded.add(id);
  }
  return matched.filter((id) => !excluded.has(id));
}

export async function ensureSegmentIndexes(): Promise<void> {
  const db = await getDb();
  await db.collection("segments").createIndex({ tenantId: 1, name: 1 });
}

async function emitMembershipChanges(
  tenantId: string,
  segment: Segment,
  before: Set<string>,
  after: Set<string>
): Promise<void> {
  for (const id of after) {
    if (!before.has(id)) {
      const contact = await contacts.findById(tenantId, id);
      await fireSegmentEvent(tenantId, "segment_entered", segment, contact);
    }
  }
  for (const id of before) {
    if (!after.has(id)) {
      const contact = await contacts.findById(tenantId, id);
      await fireSegmentEvent(tenantId, "segment_exited", segment, contact);
    }
  }
}

async function fireSegmentEvent(
  tenantId: string,
  type: "segment_entered" | "segment_exited",
  segment: Segment,
  contact: Contact | null
): Promise<void> {
  if (!contact) return;
  await fireAutomationEvent(tenantId, {
    type,
    contactId: contact.id,
    waId: contact.waId,
    payload: { segmentId: segment.id, segmentName: segment.name },
  });
}
