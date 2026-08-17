/**
 * Entity extraction — [קטגוריה 10] §10.2 / [קטגוריה 8] AI extract entities.
 *
 * One cheap pass that pulls named fields (name, email, address, date, …) out of
 * a free-text message into structured values, for the flow `ai_extract` node.
 * Mirrors `nlu.analyze`: a single JSON-only completion with safe defaults — it
 * must never block a flow. Missing fields come back as `null`.
 */
import { chat } from "./provider";

export interface ExtractField {
  /** State key the value is written to. */
  key: string;
  /** Natural-language hint of what to capture (e.g. "the customer's email"). */
  description?: string;
}

export async function extractEntities(
  text: string,
  fields: ExtractField[]
): Promise<Record<string, string | null>> {
  const wanted = fields.filter((f) => f.key.trim());
  const empty = Object.fromEntries(wanted.map((f) => [f.key, null])) as Record<string, string | null>;
  if (!text.trim() || wanted.length === 0) return empty;

  const spec = wanted
    .map((f) => `- "${f.key}"${f.description ? `: ${f.description}` : ""}`)
    .join("\n");
  const system = [
    "You extract structured fields from a user's message for a business WhatsApp assistant.",
    "Respond with ONLY a compact JSON object, no prose. Keys are exactly:",
    spec,
    'For any field not present in the message, use null. Return values as plain strings.',
  ].join("\n");

  try {
    const res = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      { maxTokens: 300 }
    );
    return coerce(extractJson(res.text), wanted);
  } catch (err) {
    console.warn("[ai] extract failed, using nulls", err);
    return empty;
  }
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function coerce(o: Record<string, unknown>, fields: ExtractField[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    const v = o[f.key];
    out[f.key] = v == null || v === "" ? null : String(v);
  }
  return out;
}
