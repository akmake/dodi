/**
 * Tickets / Helpdesk — [קטגוריה 16].
 *
 * A Ticket tracks a complex request with status, priority and SLA. Created
 * manually, from a flow/AI action, or automatically from a handoff ([קטגוריה 14]).
 * Linked to a contact and one or more conversations. Collection: `tickets`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { BaseEntity } from "@/core/types";
import type { Conversation } from "@/modules/whatsapp/models";

export type TicketStatus = "new" | "open" | "pending" | "on_hold" | "solved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface TicketNote {
  body: string;
  authorId: string | null;
  at: Date;
}

export interface TicketSla {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  breached: boolean;
}

export interface Ticket extends BaseEntity {
  contactId: string | null;
  conversationIds: string[];
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  teamId: string | null;
  topic: string | null;
  source: string;
  tags: string[];
  sla: TicketSla | null;
  internalNotes: TicketNote[];
  solvedAt: Date | null;
}

/** A canned response + bulk field changes an agent can apply in one click (§16.3). */
export interface TicketMacro extends BaseEntity {
  name: string;
  /** Canned reply text (added as an internal note on apply; can be sent separately). */
  body: string | null;
  setStatus: TicketStatus | null;
  setPriority: TicketPriority | null;
  addTags: string[];
}

/** A saved, named filter over the ticket list (§16.4). */
export interface TicketView extends BaseEntity {
  name: string;
  filter: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string; tag?: string };
  shared: boolean;
}

/** SLA targets per priority, in minutes (first response / resolution). */
export const SLA_TARGETS: Record<TicketPriority, { firstResponseMins: number; resolutionMins: number }> = {
  urgent: { firstResponseMins: 15, resolutionMins: 120 },
  high: { firstResponseMins: 60, resolutionMins: 480 },
  normal: { firstResponseMins: 240, resolutionMins: 1440 },
  low: { firstResponseMins: 480, resolutionMins: 2880 },
};

class TicketRepository extends Repository<Ticket> {
  constructor() {
    super("tickets");
  }
}
class TicketMacroRepository extends Repository<TicketMacro> {
  constructor() {
    super("ticket_macros");
  }
}
class TicketViewRepository extends Repository<TicketView> {
  constructor() {
    super("ticket_views");
  }
}

const tickets = new TicketRepository();
const macros = new TicketMacroRepository();
const views = new TicketViewRepository();

const MINUTE = 60 * 1000;

/** Compute SLA due dates from a priority at creation time. */
function slaFor(priority: TicketPriority): TicketSla {
  const t = SLA_TARGETS[priority];
  const now = Date.now();
  return {
    firstResponseDueAt: new Date(now + t.firstResponseMins * MINUTE),
    resolutionDueAt: new Date(now + t.resolutionMins * MINUTE),
    firstRespondedAt: null,
    breached: false,
  };
}

export interface CreateTicketInput {
  contactId?: string | null;
  conversationIds?: string[];
  subject: string;
  priority?: TicketPriority;
  assigneeId?: string | null;
  teamId?: string | null;
  topic?: string | null;
  source?: string;
  tags?: string[];
}

export async function createTicket(tenantId: string, input: CreateTicketInput): Promise<Ticket> {
  const priority = input.priority ?? "normal";
  return tickets.create(tenantId, {
    contactId: input.contactId ?? null,
    conversationIds: input.conversationIds ?? [],
    subject: input.subject,
    status: "new",
    priority,
    assigneeId: input.assigneeId ?? null,
    teamId: input.teamId ?? null,
    topic: input.topic ?? null,
    source: input.source ?? "whatsapp",
    tags: input.tags ?? [],
    sla: slaFor(priority),
    internalNotes: [],
    solvedAt: null,
  });
}

/** Open a ticket from a handoff (§16.1). */
export function createFromHandoff(
  tenantId: string,
  conversation: Conversation,
  opts: { subject?: string; teamId?: string | null; assigneeId?: string | null; reason?: string }
): Promise<Ticket> {
  return createTicket(tenantId, {
    contactId: conversation.contactId,
    conversationIds: [conversation.id],
    subject: opts.subject ?? `הסלמה: ${conversation.contactName ?? conversation.waId}`,
    priority: "high",
    teamId: opts.teamId ?? null,
    assigneeId: opts.assigneeId ?? null,
    topic: opts.reason ?? null,
  });
}

export interface TicketListFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  tag?: string;
}

export function listTickets(tenantId: string, filter: TicketListFilter = {}) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.priority) q.priority = filter.priority;
  if (filter.assigneeId) q.assigneeId = filter.assigneeId;
  if (filter.tag) q.tags = filter.tag;
  return tickets.findMany(tenantId, q as Filter<Ticket>);
}

export function getTicket(tenantId: string, id: string) {
  return tickets.findById(tenantId, id);
}

export async function setStatus(tenantId: string, id: string, status: TicketStatus): Promise<Ticket | null> {
  const patch: Partial<Ticket> = { status };
  if (status === "solved" || status === "closed") patch.solvedAt = new Date();
  return tickets.update(tenantId, id, patch);
}

export async function addNote(
  tenantId: string,
  id: string,
  body: string,
  authorId?: string
): Promise<Ticket | null> {
  const ticket = await tickets.findById(tenantId, id);
  if (!ticket) return null;
  const note: TicketNote = { body, authorId: authorId ?? null, at: new Date() };
  return tickets.update(tenantId, id, { internalNotes: [...ticket.internalNotes, note] });
}

export function assignTicket(tenantId: string, id: string, assigneeId: string | null) {
  return tickets.update(tenantId, id, { assigneeId });
}

/** Change priority and re-target the resolution SLA off the original creation time. */
export async function setPriority(tenantId: string, id: string, priority: TicketPriority): Promise<Ticket | null> {
  const ticket = await tickets.findById(tenantId, id);
  if (!ticket) return null;
  const created = ticket.createdAt.getTime();
  const target = SLA_TARGETS[priority];
  const sla: TicketSla = {
    firstResponseDueAt: ticket.sla?.firstRespondedAt
      ? ticket.sla.firstResponseDueAt
      : new Date(created + target.firstResponseMins * MINUTE),
    resolutionDueAt: new Date(created + target.resolutionMins * MINUTE),
    firstRespondedAt: ticket.sla?.firstRespondedAt ?? null,
    breached: ticket.sla?.breached ?? false,
  };
  return tickets.update(tenantId, id, { priority, sla });
}

/** Record the first agent response — stops the first-response SLA clock (§16.2). */
export async function markFirstResponse(tenantId: string, id: string): Promise<Ticket | null> {
  const ticket = await tickets.findById(tenantId, id);
  if (!ticket || ticket.sla?.firstRespondedAt) return ticket;
  const now = new Date();
  const breached = !!ticket.sla?.firstResponseDueAt && now > ticket.sla.firstResponseDueAt;
  return tickets.update(tenantId, id, {
    sla: { ...(ticket.sla ?? slaFor(ticket.priority)), firstRespondedAt: now, breached: breached || (ticket.sla?.breached ?? false) },
  });
}

/**
 * Flag SLA breaches across open tickets (§16.2). Intended as a periodic job:
 * a ticket breaches if its resolution is overdue while unsolved, or its first
 * response is overdue with none recorded yet. Returns the count newly breached.
 */
export async function sweepSlaBreaches(tenantId: string): Promise<number> {
  const open = await tickets.findMany(tenantId, { status: { $nin: ["solved", "closed"] } } as Filter<Ticket>);
  const now = new Date();
  let breached = 0;
  for (const t of open) {
    if (!t.sla || t.sla.breached) continue;
    const firstLate = !t.sla.firstRespondedAt && !!t.sla.firstResponseDueAt && now > t.sla.firstResponseDueAt;
    const resLate = !!t.sla.resolutionDueAt && now > t.sla.resolutionDueAt;
    if (firstLate || resLate) {
      await tickets.update(tenantId, t.id, { sla: { ...t.sla, breached: true } });
      breached++;
    }
  }
  return breached;
}

// ─── Macros (§16.3) ───────────────────────────────────────────────────────────
export function listMacros(tenantId: string) {
  return macros.findMany(tenantId);
}
export function createMacro(
  tenantId: string,
  input: { name: string; body?: string | null; setStatus?: TicketStatus | null; setPriority?: TicketPriority | null; addTags?: string[] }
): Promise<TicketMacro> {
  return macros.create(tenantId, {
    name: input.name,
    body: input.body ?? null,
    setStatus: input.setStatus ?? null,
    setPriority: input.setPriority ?? null,
    addTags: input.addTags ?? [],
  });
}
export function updateMacro(tenantId: string, id: string, patch: Partial<TicketMacro>) {
  return macros.update(tenantId, id, patch);
}
export function deleteMacro(tenantId: string, id: string) {
  return macros.delete(tenantId, id);
}

/** Apply a macro: change fields, add the canned text as a note. Returns the reply body to optionally send. */
export async function applyMacro(
  tenantId: string,
  ticketId: string,
  macroId: string,
  actorId?: string
): Promise<{ ticket: Ticket | null; reply: string | null }> {
  const ticket = await tickets.findById(tenantId, ticketId);
  const macro = await macros.findById(tenantId, macroId);
  if (!ticket || !macro) return { ticket: null, reply: null };
  const patch: Partial<Ticket> = {};
  if (macro.setStatus) patch.status = macro.setStatus;
  if (macro.setPriority) patch.priority = macro.setPriority;
  if (macro.addTags.length) patch.tags = [...new Set([...ticket.tags, ...macro.addTags])];
  if (macro.body) patch.internalNotes = [...ticket.internalNotes, { body: macro.body, authorId: actorId ?? null, at: new Date() }];
  if ((patch.status === "solved" || patch.status === "closed") && !ticket.solvedAt) patch.solvedAt = new Date();
  const updated = await tickets.update(tenantId, ticketId, patch);
  return { ticket: updated, reply: macro.body };
}

// ─── Views (§16.4) ────────────────────────────────────────────────────────────
export function listViews(tenantId: string) {
  return views.findMany(tenantId);
}
export function createView(
  tenantId: string,
  input: { name: string; filter: TicketView["filter"]; shared?: boolean }
): Promise<TicketView> {
  return views.create(tenantId, { name: input.name, filter: input.filter ?? {}, shared: input.shared ?? true });
}
export function deleteView(tenantId: string, id: string) {
  return views.delete(tenantId, id);
}

export async function ensureTicketIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("tickets").createIndex({ tenantId: 1, status: 1 }),
    db.collection("tickets").createIndex({ tenantId: 1, contactId: 1 }),
    db.collection("tickets").createIndex({ tenantId: 1, assigneeId: 1 }),
    db.collection("ticket_macros").createIndex({ tenantId: 1, name: 1 }),
    db.collection("ticket_views").createIndex({ tenantId: 1 }),
  ]);
}
