/**
 * Embeddings provider — [קטגוריה 12] A3.
 *
 * Anthropic has no embeddings endpoint; the documented choice is Voyage AI. This
 * is the seam: when VOYAGE_API_KEY is set we embed text for semantic retrieval,
 * otherwise `embed*` return null and the Knowledge service falls back to lexical
 * term-overlap. Swapping providers touches only this file.
 */
import { config } from "@/core/config";

export function embeddingsEnabled(): boolean {
  return !!config.embeddings.voyageApiKey;
}

export async function embedOne(text: string): Promise<number[] | null> {
  const [v] = await embedBatch([text]);
  return v ?? null;
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (!embeddingsEnabled() || texts.length === 0) return texts.map(() => null);
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.embeddings.voyageApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: config.embeddings.model }),
    });
    if (!res.ok) {
      console.warn("[kb] voyage embeddings failed:", res.status, await res.text());
      return texts.map(() => null);
    }
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    const data = json.data ?? [];
    return texts.map((_, i) => data[i]?.embedding ?? null);
  } catch (err) {
    console.warn("[kb] voyage embeddings error", err);
    return texts.map(() => null);
  }
}

/** Cosine similarity in [-1, 1]; 0 if either vector is empty/mismatched. */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
