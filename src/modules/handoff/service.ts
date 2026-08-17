/**
 * Handoff service — [קטגוריה 14].
 *
 * Escalating mutes the AI on the conversation (§3.5), parks it as `pending` for
 * an agent, records the context bundle, and tells the customer a human is coming.
 * Handback re-enables the AI (§14.3).
 *
 * Uses the conversation repository directly (not the inbox module) to keep the
 * dependency graph shallow.
 */
import { ConversationRepository } from "@/modules/whatsapp/repository";
import { sendText } from "@/modules/whatsapp/service";
import { resolveTarget } from "@/modules/routing";
import { createFromHandoff } from "@/modules/tickets";
import { Repository } from "@/core/db/repository";
import { track } from "@/modules/analytics/events";
import type { Handoff, HandoffReason } from "./models";

class HandoffRepository extends Repository<Handoff> {
  constructor() {
    super("handoffs");
  }
}

const handoffs = new HandoffRepository();
const conversations = new ConversationRepository();

export interface EscalateInput {
  reason: HandoffReason;
  summary?: string;
  collectedFields?: Record<string, unknown>;
  targetTeamId?: string;
  targetAgentId?: string;
  /** Also open a Ticket ([קטגוריה 16]) for this escalation. */
  createTicket?: boolean;
  /** Customer-facing notice; null to stay silent. */
  notice?: string | null;
}

const DEFAULT_NOTICE = "אני מעביר אותך לנציג אנושי 🙂 אחד מאנשי הצוות יחזור אליך בהקדם.";

export async function escalate(
  tenantId: string,
  conversationId: string,
  input: EscalateInput
): Promise<Handoff> {
  const conv = await conversations.findById(tenantId, conversationId);

  // Resolve a target via Routing ([קטגוריה 17]) unless the caller specified one.
  let teamId = input.targetTeamId ?? null;
  let agentId = input.targetAgentId ?? null;
  if (!teamId && !agentId && conv) {
    const target = await resolveTarget(tenantId, {
      contact: null,
      conversation: conv as unknown as Record<string, unknown>,
      ai: { reason: input.reason },
      now: new Date(),
    });
    if (target) {
      teamId = target.teamId;
      agentId = target.agentId;
    }
  }

  const handoff = await handoffs.create(tenantId, {
    conversationId,
    reason: input.reason,
    summary: input.summary ?? null,
    collectedFields: input.collectedFields ?? {},
    targetTeamId: teamId,
    targetAgentId: agentId,
    resolvedAt: null,
  });

  // Mute the AI and surface the conversation to agents (§3.5 / §3.2).
  await conversations.update(tenantId, conversationId, {
    aiEnabled: false,
    status: "pending",
    priority: input.reason === "negative_sentiment" ? "high" : "normal",
    assigneeId: agentId,
    teamId: teamId,
  });

  // Best-effort customer notice — must not block the escalation if it fails
  // (e.g. outside the 24h window).
  // Optionally open a ticket (§14.1 / §16.1).
  if (input.createTicket && conv) {
    try {
      await createFromHandoff(tenantId, conv, { teamId, assigneeId: agentId, reason: input.reason });
    } catch (err) {
      console.warn("[handoff] ticket creation failed", err);
    }
  }

  void track(tenantId, "handoff", {
    conversationId,
    agentId,
    attributes: { reason: input.reason, teamId },
  });

  const notice = input.notice === undefined ? DEFAULT_NOTICE : input.notice;
  if (notice && conv) {
    try {
      await sendText(tenantId, conv.waId, notice, { sender: "system" });
    } catch (err) {
      console.warn("[handoff] notice send failed", err);
    }
  }

  return handoff;
}

/** Return control to the AI (§14.3). */
export async function handback(tenantId: string, conversationId: string): Promise<void> {
  await conversations.update(tenantId, conversationId, { aiEnabled: true, status: "open" });
}

export function listOpenHandoffs(tenantId: string) {
  return handoffs.findMany(tenantId, { resolvedAt: null } as never);
}
