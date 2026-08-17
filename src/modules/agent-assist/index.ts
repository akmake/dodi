/**
 * Agent Assist / Copilot — [קטגוריה 15].
 */
import { MessageRepository } from "@/modules/whatsapp/repository";
import { chat, type ChatMessage } from "@/modules/ai/provider";

const messages = new MessageRepository();

export interface AssistResult {
  suggestedReply: string;
  summary: string;
  nextAction: string;
}

export async function suggestForConversation(
  tenantId: string,
  conversationId: string
): Promise<AssistResult> {
  const recent = (await messages.listByConversation(tenantId, conversationId, 20))
    .reverse()
    .filter((m) => !m.isInternalNote && m.text);

  const transcript = recent
    .map((m) => `${m.direction === "inbound" ? "לקוח" : m.sender}: ${m.text}`)
    .join("\n");

  const prompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "אתה Copilot לנציג שירות. החזר JSON תקין בלבד עם suggestedReply, summary, nextAction. עברית קצרה, מקצועית, בלי Markdown.",
    },
    { role: "user", content: transcript || "אין היסטוריה." },
  ];
  const res = await chat(prompt, { maxTokens: 500 });
  return parseAssist(res.text);
}

function parseAssist(text: string): AssistResult {
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as Partial<AssistResult>;
    return {
      suggestedReply: json.suggestedReply ?? "",
      summary: json.summary ?? "",
      nextAction: json.nextAction ?? "",
    };
  } catch {
    return { suggestedReply: text.trim(), summary: "", nextAction: "" };
  }
}
