/**
 * Knowledge repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { KnowledgeChunk, KnowledgeSource } from "./models";

export class KnowledgeSourceRepository extends Repository<KnowledgeSource> {
  constructor() {
    super("kb_sources");
  }
}

export class KnowledgeChunkRepository extends Repository<KnowledgeChunk> {
  constructor() {
    super("kb_chunks");
  }

  findBySource(tenantId: string, sourceId: string) {
    return this.findMany(tenantId, { sourceId } as Filter<KnowledgeChunk>);
  }

  /** Candidate chunks that share at least one query term (lexical pre-filter). */
  async findByTerms(tenantId: string, terms: string[], limit = 200): Promise<KnowledgeChunk[]> {
    if (terms.length === 0) return [];
    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, { terms: { $in: terms } } as Filter<KnowledgeChunk>))
      .limit(limit)
      .toArray() as Promise<KnowledgeChunk[]>;
  }

  /** Chunks that carry an embedding, for in-app cosine retrieval (A3). */
  async findWithEmbedding(tenantId: string, limit = 2000): Promise<KnowledgeChunk[]> {
    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, { embedding: { $ne: null } } as Filter<KnowledgeChunk>))
      .limit(limit)
      .toArray() as Promise<KnowledgeChunk[]>;
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureKnowledgeIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("kb_chunks").createIndex({ tenantId: 1, terms: 1 }),
        db.collection("kb_chunks").createIndex({ tenantId: 1, sourceId: 1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
