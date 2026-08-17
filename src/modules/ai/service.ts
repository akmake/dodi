/**
 * AI Agent service — [קטגוריה 10].
 *
 * The reasoning loop (§10.1): read the turn (NLU §10.2), retrieve grounding
 * (RAG, [12]), answer ONLY from sources — with tool access ([13]) so it can act,
 * not just talk — then run guardrails (§10.5) before sending. No grounded source,
 * blocked output, negative sentiment, or explicit request → escalate with an
 * auto-generated context bundle (§10.4 / [14]) instead of guessing.
 */
import { MessageRepository } from "@/modules/whatsapp/repository";
import { sendText } from "@/modules/whatsapp/service";
import type { Conversation } from "@/modules/whatsapp/models";
import type { Contact } from "@/modules/contacts/models";
import { retrieve } from "@/modules/knowledge/service";
import type { RetrievedChunk } from "@/modules/knowledge/models";
import { escalate } from "@/modules/handoff/service";
import { chat, chatWithTools, type ChatMessage } from "./provider";
import { analyze } from "./nlu";
import { checkOutput } from "./guardrails";
import { enrich } from "./enrich";
import { buildActionTools, makeActionExecutor } from "./tools";
import { resolveAgentContext } from "./agent";
import { AIResponseRepository } from "./repository";
import { selectSkillForTurn, composeSkillPrompt, type AISkill } from "@/modules/skills";
import { track } from "@/modules/analytics/events";
import { incrementUsage } from "@/modules/billing";
import type { AIResponse, NluResult } from "./models";

const messages = new MessageRepository();
const aiResponses = new AIResponseRepository();

/** Lexical/semantic relevance below this → treat as "no grounded answer" (§10.5). */
const MIN_RELEVANCE = 0.15;
/** How much recent history to feed the model (§10.3). */
const HISTORY_TURNS = 8;

const HUMAN_REQUEST_PATTERNS = [
  "נציג", "אדם", "בן אדם", "לדבר עם", "human", "agent", "representative",
];

export type AIDecision = "answer" | "fallback" | "handoff";

export interface AIResult {
  decision: AIDecision;
  answer: string | null;
  confidence: number;
  sentiment: NluResult["sentiment"];
  usedSources: { sourceId: string; title?: string }[];
}

/**
 * Handle one customer turn: produce and send a reply, or escalate.
 * Used by the pipeline (auto-reply) and by Flow "ai" nodes.
 */
export async function respond(
  tenantId: string,
  conversation: Conversation,
  contact: Contact | null,
  userText: string,
  providedNlu?: NluResult
): Promise<AIResult> {
  const to = conversation.waId;

  // 1. NLU read (reuse the pipeline's if provided) + grounding retrieval (§10.2 / [12]).
  const [nlu, chunks] = await Promise.all([
    providedNlu ? Promise.resolve(providedNlu) : analyze(userText),
    retrieve(tenantId, userText, 4),
  ]);
  const top = chunks[0]?.score ?? 0;

  // 2. Explicit human request → straight to handoff (§14.2).
  if (wantsHuman(userText)) {
    await escalateWithContext(tenantId, conversation, "customer_request");
    await persist(tenantId, conversation.id, nlu, 1, "handoff", null, [], []);
    return { decision: "handoff", answer: null, confidence: 1, sentiment: nlu.sentiment, usedSources: [] };
  }

  // 3. No grounded source → restart the conversation, DON'T mute the AI.
  //    Previously this escalated, which set conversation.aiEnabled=false with no
  //    automatic handback — so the bot went permanently silent on the first
  //    off-topic / out-of-knowledge question ("הבוט נשבר ומפסיק לענות אחרי שיחה").
  //    Per the owner's choice we now send a friendly restart and stay live, so the
  //    customer can pick a valid path instead of hitting a dead bot.
  if (chunks.length === 0 || top < MIN_RELEVANCE) {
    const restart =
      "סליחה, לא הצלחתי להבין את זה 🙂 בוא נתחיל מהתחלה — איך אוכל לעזור לך?";
    await trySend(tenantId, to, restart);
    await persist(tenantId, conversation.id, nlu, top, "fallback", restart, [], []);
    return { decision: "fallback", answer: restart, confidence: top, sentiment: nlu.sentiment, usedSources: [] };
  }

  // 4. Grounded answer — with tool access so the agent can act ([13] A4).
  const history = await loadHistory(tenantId, conversation.id);
  const skill = await selectSkillForTurn(tenantId, nlu.intent, userText);
  // Resolve the active agent version / A-B variant for this conversation (§24.5).
  const agent = await resolveAgentContext(tenantId, conversation.id);
  const prompt = buildMessages(conversation, contact, chunks, history, userText, skill, agent.systemPrompt);
  const tools = await buildActionTools(tenantId, skill?.allowedActionIds);
  const exec = makeActionExecutor(tenantId, conversation.id);

  const result = await chatWithTools(prompt, tools, exec, { maxTokens: 600 });
  let answer = result.text.trim() || "מצטער/ת, לא הצלחתי לנסח תשובה. אפשר לנסות שוב?";

  // 5. Guardrails before sending (§10.5). Blocked → escalate instead of sending.
  const guard = checkOutput(answer);
  if (!guard.allowed) {
    console.warn("[ai] guardrail blocked reply", guard.violations);
    const safe = "אעביר אותך לנציג אנושי כדי לוודא שתקבל/י תשובה מדויקת 🙏";
    await trySend(tenantId, to, safe);
    await escalateWithContext(tenantId, conversation, "sensitive_topic");
    await persist(tenantId, conversation.id, nlu, top, "handoff", safe, sources(chunks), result.toolCalls);
    return { decision: "handoff", answer: safe, confidence: top, sentiment: nlu.sentiment, usedSources: sources(chunks) };
  }

  await sendText(tenantId, to, answer, { sender: "ai" });
  await persist(tenantId, conversation.id, nlu, top, "answer", answer, sources(chunks), result.toolCalls);
  void incrementUsage(tenantId, "ai_answers").catch(() => {}); // meter against plan ([25.6])
  // Attribute this answer to its agent version / experiment variant (§24.5).
  if (agent.experimentId || agent.version != null) {
    void track(tenantId, "ai_answer", {
      conversationId: conversation.id,
      attributes: { agentVersion: agent.version, experiment: agent.experimentId, variant: agent.variant },
    });
  }

  return {
    decision: "answer",
    answer,
    confidence: top,
    sentiment: nlu.sentiment,
    usedSources: sources(chunks),
  };
}

// --- helpers ---------------------------------------------------------------

function wantsHuman(text: string): boolean {
  const t = text.toLowerCase();
  return HUMAN_REQUEST_PATTERNS.some((p) => t.includes(p));
}

function sources(chunks: RetrievedChunk[]) {
  return chunks.map((c) => ({ sourceId: c.sourceId, title: c.title }));
}

async function trySend(tenantId: string, to: string, text: string): Promise<void> {
  try {
    await sendText(tenantId, to, text, { sender: "ai" });
  } catch {
    /* outside the 24h window — the handoff still records the need */
  }
}

/** Escalate with an auto-generated context bundle for the human (§10.4). */
async function escalateWithContext(
  tenantId: string,
  conversation: Conversation,
  reason: "customer_request" | "low_confidence" | "negative_sentiment" | "sensitive_topic"
): Promise<void> {
  let summary: string | undefined;
  try {
    const history = await loadHistory(tenantId, conversation.id);
    const e = await enrich(history);
    summary = `${e.title}\n${e.summary}${e.nextAction ? `\nNext: ${e.nextAction}` : ""}`;
  } catch {
    /* enrichment is best-effort */
  }
  await escalate(tenantId, conversation.id, { reason, summary, notice: null });
}

async function persist(
  tenantId: string,
  conversationId: string,
  nlu: NluResult,
  confidence: number,
  decision: AIResponse["decision"],
  answerText: string | null,
  usedSources: { sourceId: string; title?: string }[],
  toolCalls: { name: string; input: unknown; result: string }[]
): Promise<void> {
  try {
    await aiResponses.create(tenantId, {
      conversationId,
      intent: nlu.intent,
      language: nlu.language,
      sentiment: nlu.sentiment,
      urgency: nlu.urgency,
      confidence,
      decision,
      answerText,
      usedSources,
      toolCalls,
      inputTokens: 0,
      outputTokens: 0,
    });
  } catch (err) {
    console.warn("[ai] persist AIResponse failed", err);
  }
}

async function loadHistory(tenantId: string, conversationId: string): Promise<ChatMessage[]> {
  const recent = await messages.listByConversation(tenantId, conversationId, HISTORY_TURNS);
  // listByConversation is newest-first; reverse to chronological.
  return recent
    .reverse()
    .filter((m) => !m.isInternalNote && m.text)
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.text as string,
    }));
}

function buildMessages(
  conversation: Conversation,
  contact: Contact | null,
  chunks: RetrievedChunk[],
  history: ChatMessage[],
  userText: string,
  skill: AISkill | null = null,
  agentPrompt = ""
): ChatMessage[] {
  const sourcesText = chunks
    .map((c, i) => `[מקור ${i + 1}${c.title ? ` — ${c.title}` : ""}]\n${c.text}`)
    .join("\n\n");

  const facts = contact
    ? `פרטי הלקוח: שם=${contact.firstName ?? "לא ידוע"}, טלפון=${contact.phone}.`
    : "";

  const system = [
    "אתה נציג שירות וירטואלי של עסק, עונה בוואטסאפ.",
    agentPrompt,
    "ענה אך ורק על סמך המקורות שמסופקים לך למטה. אל תמציא מידע.",
    "אם התשובה לא נמצאת במקורות — אמור בנימוס שתעביר לנציג אנושי, אל תנחש.",
    "אם יש כלי (action) שמתאים לבקשת הלקוח — השתמש בו במקום רק לתאר אותה.",
    skill ? composeSkillPrompt(skill) : "",
    "ענה בשפה שבה הלקוח כתב, בקצרה, ידידותי ולעניין.",
    facts,
    "\n--- מקורות ידע ---\n" + sourcesText,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];
}

// Re-export so existing single-shot callers (Flow "ai" node) keep working.
export { chat };
