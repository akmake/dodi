/**
 * Conversation enrichment — [קטגוריה 10] §10.4.
 *
 * Produces a summary / title / escalation-reason / next-action from the
 * conversation history. Consumed by Handoff ([14]), Inbox ([3]) and Tickets
 * ([16]) so a human picks up with full context. Best-effort: returns a minimal
 * fallback on any failure.
 */
import { chat, type ChatMessage } from "./provider";
import type { Enrichment } from "./models";

const SYSTEM = [
  "Summarize this customer-support conversation for the human agent taking over.",
  "Respond with ONLY a compact JSON object, no prose:",
  '{"summary": string, "title": short string, "reason": why escalate/what is needed, "nextAction": recommended next step}',
  "Write summary/title/reason/nextAction in the conversation's language.",
].join("\n");

export async function enrich(history: ChatMessage[]): Promise<Enrichment> {
  const transcript = history
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`)
    .join("\n");

  const fallback: Enrichment = {
    summary: transcript.slice(0, 500),
    title: "שיחה",
    reason: "",
    nextAction: "",
  };
  if (!transcript.trim()) return fallback;

  try {
    const res = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: transcript },
      ],
      { maxTokens: 400 }
    );
    const match = res.text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const o = JSON.parse(match[0]) as Partial<Enrichment>;
    return {
      summary: o.summary ?? fallback.summary,
      title: o.title ?? fallback.title,
      reason: o.reason ?? "",
      nextAction: o.nextAction ?? "",
    };
  } catch (err) {
    console.warn("[ai] enrich failed", err);
    return fallback;
  }
}
