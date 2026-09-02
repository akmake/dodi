/**
 * AI Agent repositories — persists reasoning turns for analytics/optimization.
 */
import { Repository } from "@/core/db/repository";
import type { Filter } from "mongodb";
import type { AIResponse } from "./models";

export class AIResponseRepository extends Repository<AIResponse> {
  constructor() {
    super("ai_responses");
  }

  listByConversation(tenantId: string, conversationId: string) {
    return this.findMany(tenantId, { conversationId } as Filter<AIResponse>);
  }
}
