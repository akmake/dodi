/**
 * Voice / Contact Center — IVR engine + call lifecycle — [קטגוריה 26].
 *
 * Inbound calls walk the tenant's active IVR flow, emitting carrier-neutral
 * `VoiceInstruction`s that the telephony webhook renders for the provider. Call
 * state, recordings and transcripts are persisted as `CallSession`s. This is the
 * foundation; a live deployment supplies a `TelephonyAdapter` (carrier) at the
 * webhook boundary.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import { track } from "@/modules/analytics/events";
import type {
  CallSession,
  CallStatus,
  IvrFlow,
  IvrNode,
  VoiceInstruction,
} from "./models";

export * from "./models";

class IvrFlowRepository extends Repository<IvrFlow> {
  constructor() {
    super("ivr_flows");
  }
  findEnabled(tenantId: string) {
    return this.findOne(tenantId, { enabled: true } as Filter<IvrFlow>);
  }
}
class CallSessionRepository extends Repository<CallSession> {
  constructor() {
    super("call_sessions");
  }
  findByExternalId(tenantId: string, externalCallId: string) {
    return this.findOne(tenantId, { externalCallId } as Filter<CallSession>);
  }
}

const flows = new IvrFlowRepository();
const calls = new CallSessionRepository();

// ─── IVR flow CRUD ────────────────────────────────────────────────────────────
export function listFlows(tenantId: string): Promise<IvrFlow[]> {
  return flows.findMany(tenantId);
}
export function getFlow(tenantId: string, id: string): Promise<IvrFlow | null> {
  return flows.findById(tenantId, id);
}
export async function createFlow(
  tenantId: string,
  input: { name: string; greeting?: string; nodes?: IvrNode[]; rootNodeId?: string | null; enabled?: boolean }
): Promise<IvrFlow> {
  await ensureVoiceIndexes();
  return flows.create(tenantId, {
    name: input.name,
    greeting: input.greeting ?? "שלום, הגעתם למוקד. נא להקשיב לאפשרויות.",
    nodes: input.nodes ?? [],
    rootNodeId: input.rootNodeId ?? input.nodes?.[0]?.id ?? null,
    enabled: input.enabled ?? false,
  });
}
export async function updateFlow(
  tenantId: string,
  id: string,
  patch: Partial<Pick<IvrFlow, "name" | "greeting" | "nodes" | "rootNodeId" | "enabled">>
): Promise<IvrFlow | null> {
  // Only one enabled flow at a time — enabling this one disables the others.
  if (patch.enabled) {
    for (const f of await flows.findMany(tenantId)) {
      if (f.enabled && f.id !== id) await flows.update(tenantId, f.id, { enabled: false });
    }
  }
  return flows.update(tenantId, id, patch);
}
export function deleteFlow(tenantId: string, id: string): Promise<boolean> {
  return flows.delete(tenantId, id);
}

// ─── Call lifecycle + IVR walk ────────────────────────────────────────────────
export function listCalls(tenantId: string, limit = 100): Promise<CallSession[]> {
  return calls.findMany(tenantId, {} as Filter<CallSession>).then((c) =>
    c.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit)
  );
}

/** Render the instructions for a node (and remember where we are). */
function nodeInstructions(node: IvrNode): VoiceInstruction[] {
  switch (node.action) {
    case "play":
      return node.prompt ? [{ verb: "say", text: node.prompt }] : [];
    case "menu":
      return [{ verb: "gather", prompt: node.prompt ?? "", numDigits: 1, timeoutSec: 6 }];
    case "dial_agent":
      return [
        ...(node.prompt ? [{ verb: "say", text: node.prompt } as VoiceInstruction] : []),
        { verb: "dial", target: node.target ?? "", kind: "agent" },
      ];
    case "dial_team":
      return [
        ...(node.prompt ? [{ verb: "say", text: node.prompt } as VoiceInstruction] : []),
        { verb: "dial", target: node.target ?? "", kind: "team" },
      ];
    case "voicemail":
      return [{ verb: "record", prompt: node.prompt ?? "השאירו הודעה אחרי הצליל." }];
    case "voicebot":
      // The voice bot turn is handled out-of-band (STT→AI→TTS); prompt the caller.
      return [{ verb: "say", text: node.prompt ?? "כיצד אוכל לעזור?" }, { verb: "gather", prompt: "", numDigits: 0, timeoutSec: 8 }];
    case "hangup":
      return [...(node.prompt ? [{ verb: "say", text: node.prompt } as VoiceInstruction] : []), { verb: "hangup" }];
  }
}

function statusForNode(node: IvrNode): CallStatus {
  if (node.action === "dial_agent" || node.action === "dial_team") return "connected";
  if (node.action === "voicemail") return "voicemail";
  if (node.action === "hangup") return "completed";
  return "in_ivr";
}

/** Start an inbound call: create the session and emit the greeting + first node. */
export async function handleInboundCall(
  tenantId: string,
  input: { externalCallId: string; from: string; to: string }
): Promise<{ call: CallSession; instructions: VoiceInstruction[] }> {
  await ensureVoiceIndexes();
  const flow = await flows.findEnabled(tenantId);
  const root = flow?.nodes.find((n) => n.id === flow.rootNodeId) ?? flow?.nodes[0] ?? null;

  const existing = await calls.findByExternalId(tenantId, input.externalCallId);
  const call =
    existing ??
    (await calls.create(tenantId, {
      externalCallId: input.externalCallId,
      from: input.from,
      to: input.to,
      direction: "inbound",
      status: flow ? "in_ivr" : "completed",
      flowId: flow?.id ?? null,
      currentNodeId: root?.id ?? null,
      assignedAgentId: null,
      recordingUrl: null,
      transcript: null,
      startedAt: new Date(),
      endedAt: null,
    }));

  void track(tenantId, "call_started" as string, { attributes: { from: input.from, hasFlow: !!flow } });

  const instructions: VoiceInstruction[] = [];
  if (flow?.greeting) instructions.push({ verb: "say", text: flow.greeting });
  if (root) instructions.push(...nodeInstructions(root));
  else instructions.push({ verb: "say", text: "אין מוקד זמין כרגע. נסו מאוחר יותר." }, { verb: "hangup" });

  return { call, instructions };
}

/** Advance the IVR after a DTMF digit; returns the next instruction set. */
export async function handleDigit(
  tenantId: string,
  externalCallId: string,
  digit: string
): Promise<{ call: CallSession | null; instructions: VoiceInstruction[] }> {
  const call = await calls.findByExternalId(tenantId, externalCallId);
  if (!call || !call.flowId) return { call, instructions: [{ verb: "hangup" }] };
  const flow = await flows.findById(tenantId, call.flowId);
  const current = flow?.nodes.find((n) => n.id === call.currentNodeId) ?? null;
  if (!flow || !current) return { call, instructions: [{ verb: "hangup" }] };

  const nextId =
    current.action === "menu"
      ? current.options?.find((o) => o.digit === digit)?.nextId ?? current.nextId
      : current.nextId;
  const next = nextId ? flow.nodes.find((n) => n.id === nextId) ?? null : null;

  if (!next) {
    return { call, instructions: [{ verb: "say", text: "בחירה לא חוקית." }, { verb: "hangup" }] };
  }

  const updated = await calls.update(tenantId, call.id, {
    currentNodeId: next.id,
    status: statusForNode(next),
    assignedAgentId: next.action === "dial_agent" ? next.target ?? null : call.assignedAgentId,
  });
  return { call: updated, instructions: nodeInstructions(next) };
}

/** Attach a recording + optional transcript (from the carrier callback). */
export async function attachRecording(
  tenantId: string,
  externalCallId: string,
  recordingUrl: string,
  transcript?: string
): Promise<CallSession | null> {
  const call = await calls.findByExternalId(tenantId, externalCallId);
  if (!call) return null;
  return calls.update(tenantId, call.id, { recordingUrl, transcript: transcript ?? call.transcript });
}

export async function endCall(tenantId: string, externalCallId: string, status: CallStatus = "completed"): Promise<CallSession | null> {
  const call = await calls.findByExternalId(tenantId, externalCallId);
  if (!call) return null;
  void track(tenantId, "call_ended" as string, { attributes: { status, durationMs: Date.now() - call.startedAt.getTime() } });
  return calls.update(tenantId, call.id, { status, endedAt: new Date() });
}

export async function ensureVoiceIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("ivr_flows").createIndex({ tenantId: 1, enabled: 1 }),
    db.collection("call_sessions").createIndex({ tenantId: 1, externalCallId: 1 }, { unique: true }),
    db.collection("call_sessions").createIndex({ tenantId: 1, startedAt: -1 }),
  ]);
}
