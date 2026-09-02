/**
 * Knowledge Base models — [קטגוריה 12].
 *
 * Sources are chunked into retrievable pieces that ground the AI's answers, so
 * it cites instead of guessing (§12.2). MVP retrieval is lexical (term overlap);
 * a vector store is the documented upgrade. Collections: `kb_sources`, `kb_chunks`.
 */
import type { BaseEntity } from "@/core/types";

export type SourceType =
  | "article"
  | "help_center"
  | "pdf"
  | "web_page"
  | "snippet"
  | "data_connector";

export type SourceStatus = "active" | "syncing" | "error" | "excluded";

export interface KnowledgeSource extends BaseEntity {
  type: SourceType;
  title: string;
  uri: string | null;
  status: SourceStatus;
  /** Restrict to segments/audiences (§12.4); null = everyone. */
  audienceScope: string[] | null;
  lastSyncedAt: Date | null;
}

export interface KnowledgeChunk extends BaseEntity {
  sourceId: string;
  text: string;
  /** Lowercased term set for lexical retrieval (fallback when no embedding). */
  terms: string[];
  /** Dense embedding for semantic retrieval (A3); null when no embeddings provider configured. */
  embedding: number[] | null;
  metadata: { title?: string; url?: string; lang?: string };
}

/** A retrieved chunk with its relevance score, for grounding + citation. */
export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  text: string;
  title?: string;
  url?: string;
  score: number;
}
