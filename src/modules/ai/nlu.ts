/**
 * NLU — [קטגוריה 10] §10.2.
 *
 * One cheap classification pass over an inbound turn: intent, language,
 * sentiment, urgency. Output feeds Conditions ([7]), Routing ([17]) and the
 * sentiment-based handoff trigger ([14] §14.2). Safe defaults on any failure —
 * NLU must never block a reply.
 */
import { chat } from "./provider";
import type { NluResult, Sentiment, Urgency } from "./models";

const SYSTEM = [
  "You are an NLU classifier for a business WhatsApp assistant.",
  "Classify the user's message. Respond with ONLY a compact JSON object, no prose:",
  '{"intent": string, "language": ISO-639-1, "sentiment": "positive"|"neutral"|"negative", "urgency": "low"|"normal"|"high"}',
  "intent is a short snake_case label (e.g. order_status, pricing_question, complaint, greeting).",
].join("\n");

const DEFAULT: NluResult = {
  intent: "unknown",
  language: "he",
  sentiment: "neutral",
  urgency: "normal",
};

export async function analyze(text: string): Promise<NluResult> {
  if (!text.trim()) return DEFAULT;
  try {
    const res = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
      { maxTokens: 150 }
    );
    return coerce(extractJson(res.text));
  } catch (err) {
    console.warn("[ai] nlu failed, using defaults", err);
    return DEFAULT;
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

function coerce(o: Record<string, unknown>): NluResult {
  const sentiment = o.sentiment as Sentiment;
  const urgency = o.urgency as Urgency;
  return {
    intent: typeof o.intent === "string" && o.intent ? o.intent : DEFAULT.intent,
    language: typeof o.language === "string" && o.language ? o.language : DEFAULT.language,
    sentiment: ["positive", "neutral", "negative"].includes(sentiment) ? sentiment : "neutral",
    urgency: ["low", "normal", "high"].includes(urgency) ? urgency : "normal",
  };
}
