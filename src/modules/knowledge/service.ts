/**
 * Knowledge service — [קטגוריה 12].
 *
 * Ingests sources into chunks and retrieves the most relevant chunks for a
 * query to ground the AI (§12.1/§12.2). Retrieval is lexical term-overlap for
 * the MVP; swapping in embeddings later touches only `tokenize` + `retrieve`.
 */
import type { KnowledgeChunk, RetrievedChunk, SourceType } from "./models";
import {
  KnowledgeChunkRepository,
  KnowledgeSourceRepository,
  ensureKnowledgeIndexes,
} from "./repository";
import { cosine, embedBatch, embedOne, embeddingsEnabled } from "./embeddings";

const sources = new KnowledgeSourceRepository();
const chunks = new KnowledgeChunkRepository();

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "is", "are", "to", "of", "in", "on", "for", "with",
  "של", "את", "עם", "על", "אם", "כי", "זה", "מה", "לא", "כן", "אני", "אתה", "הוא", "היא",
]);

/** Lowercase, strip punctuation, drop stop/short words, dedupe. */
export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(raw)];
}

/** Split text into ~chunkSize-char pieces on paragraph/sentence boundaries. */
function chunkText(text: string, chunkSize = 600): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > chunkSize && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [text.trim()].filter(Boolean);
}

export interface AddSourceInput {
  type: SourceType;
  title: string;
  uri?: string;
  text: string;
  url?: string;
  lang?: string;
}

export async function addSource(tenantId: string, input: AddSourceInput) {
  await ensureKnowledgeIndexes();
  const source = await sources.create(tenantId, {
    type: input.type,
    title: input.title,
    uri: input.uri ?? null,
    status: "active",
    audienceScope: null,
    lastSyncedAt: new Date(),
  });

  const pieces = chunkText(input.text);
  // Embed all pieces in one batch when a provider is configured (A3); else null → lexical.
  const vectors = await embedBatch(pieces);
  for (let i = 0; i < pieces.length; i++) {
    await chunks.create(tenantId, {
      sourceId: source.id,
      text: pieces[i],
      terms: tokenize(pieces[i]),
      embedding: vectors[i] ?? null,
      metadata: { title: input.title, url: input.url, lang: input.lang },
    });
  }
  return { source, chunks: pieces.length };
}

/**
 * Retrieve the top-K chunks for a query by term overlap, normalized by chunk
 * length so long chunks don't dominate (§12.2). Empty result → caller falls
 * back instead of guessing (§10.5).
 */
export async function retrieve(
  tenantId: string,
  query: string,
  topK = 4
): Promise<RetrievedChunk[]> {
  // Semantic path: embed the query and rank by cosine over embedded chunks (A3).
  if (embeddingsEnabled()) {
    const qv = await embedOne(query);
    if (qv) {
      const embedded = await chunks.findWithEmbedding(tenantId);
      const ranked = embedded
        .map((c) => ({ c, score: c.embedding ? cosine(qv, c.embedding) : 0 }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      if (ranked.length > 0) {
        return ranked.map(({ c, score }) => ({
          chunkId: c.id,
          sourceId: c.sourceId,
          text: c.text,
          title: c.metadata.title,
          url: c.metadata.url,
          score,
        }));
      }
    }
  }

  // Lexical fallback (no embeddings, or nothing embedded yet).
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];
  const querySet = new Set(queryTerms);

  const candidates = await chunks.findByTerms(tenantId, queryTerms);
  const scored = candidates
    .map((c) => ({ c, score: score(querySet, c) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ c, score }) => ({
    chunkId: c.id,
    sourceId: c.sourceId,
    text: c.text,
    title: c.metadata.title,
    url: c.metadata.url,
    score,
  }));
}

function score(querySet: Set<string>, chunk: KnowledgeChunk): number {
  let overlap = 0;
  for (const term of chunk.terms) if (querySet.has(term)) overlap++;
  if (overlap === 0) return 0;
  // Overlap weighted by query coverage; mild length normalization.
  return overlap / Math.sqrt(chunk.terms.length || 1);
}

export function listSources(tenantId: string) {
  return sources.findMany(tenantId);
}

export { ensureKnowledgeIndexes };
