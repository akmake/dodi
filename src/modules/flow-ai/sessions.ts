/**
 * AI Flow Architect — persisted chat sessions ([קטגוריה 27]).
 *
 * The architect itself is stateless (each request carries its own history); this
 * stores the conversation so the author can reopen a past chat and re-apply a
 * flow the AI built earlier. Sessions are per-tenant and tagged with the flow
 * that was open at the time. Collection: `flow_ai_sessions`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { ArchitectSessionTurn, FlowAiSession, FlowAiSessionSummary } from "./models";

class FlowAiSessionRepository extends Repository<FlowAiSession> {
  constructor() {
    super("flow_ai_sessions");
  }

  async listByFlow(tenantId: string, flowId: string | null): Promise<FlowAiSession[]> {
    const col = await this.collection();
    const filter = (flowId ? { flowId } : {}) as Filter<FlowAiSession>;
    return col
      .find(this.scoped(tenantId, filter))
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray() as Promise<FlowAiSession[]>;
  }
}

const sessions = new FlowAiSessionRepository();

function deriveTitle(turns: ArchitectSessionTurn[]): string {
  const firstUser = turns.find((t) => t.role === "user");
  return (firstUser?.content?.trim() || "שיחה חדשה").slice(0, 60);
}

export interface UpsertSessionInput {
  id?: string | null;
  flowId: string | null;
  turns: ArchitectSessionTurn[];
}

export async function upsertSession(
  tenantId: string,
  input: UpsertSessionInput
): Promise<FlowAiSession> {
  await ensureSessionIndexes();
  const title = deriveTitle(input.turns);
  if (input.id) {
    const updated = await sessions.update(tenantId, input.id, {
      flowId: input.flowId,
      turns: input.turns,
      title,
    } as Partial<FlowAiSession>);
    if (updated) return updated;
  }
  return sessions.create(tenantId, { flowId: input.flowId, title, turns: input.turns });
}

export async function listSessions(
  tenantId: string,
  flowId: string | null
): Promise<FlowAiSessionSummary[]> {
  const all = await sessions.listByFlow(tenantId, flowId);
  return all.map((s) => ({
    id: s.id,
    flowId: s.flowId,
    title: s.title,
    turnCount: s.turns.length,
    updatedAt: s.updatedAt,
  }));
}

export function getSession(tenantId: string, id: string): Promise<FlowAiSession | null> {
  return sessions.findById(tenantId, id);
}

let indexesReady: Promise<void> | null = null;
export function ensureSessionIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await db
        .collection("flow_ai_sessions")
        .createIndex({ tenantId: 1, flowId: 1, updatedAt: -1 });
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
