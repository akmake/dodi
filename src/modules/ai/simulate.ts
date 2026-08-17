/**
 * Skill simulator — [קטגוריה 11 §11.3].
 *
 * A no-side-effect dry run: given a skill (or auto-selected by intent) and a
 * test message, it builds the same prompt the live agent would and returns the
 * model's reply plus the tools that WOULD have been available — without running
 * any tool or sending a WhatsApp message. Lives in the AI module because skills
 * must not import the AI layer (that would form a cycle).
 */
import { chat, type ChatMessage } from "./provider";
import { buildActionTools } from "./tools";
import { getSkill, selectSkillForTurn, composeSkillPrompt, type AISkill } from "@/modules/skills";

export interface SimulateTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SimulateInput {
  skillId?: string;
  message: string;
  intent?: string;
  /** Prior turns of this simulated conversation, oldest first (multi-turn memory). */
  history?: SimulateTurn[];
}

export interface SimulateResult {
  skill: { id: string; name: string; version: number } | null;
  reply: string;
  availableTools: string[];
}

export async function simulateSkill(tenantId: string, input: SimulateInput): Promise<SimulateResult> {
  let skill: AISkill | null = null;
  if (input.skillId) skill = await getSkill(tenantId, input.skillId);
  else skill = await selectSkillForTurn(tenantId, input.intent ?? "", input.message);

  const tools = await buildActionTools(tenantId, skill?.allowedActionIds);

  const system = [
    "אתה נציג שירות וירטואלי של עסק, עונה בוואטסאפ.",
    "זוהי סימולציה — אל תבצע פעולות בפועל, רק הסבר/הדגם את התגובה.",
    skill ? composeSkillPrompt(skill) : "אין Skill תואם — תגובה כללית.",
    tools.length ? `כלים זמינים: ${tools.map((t) => t.name).join(", ")}.` : "אין כלים זמינים.",
    "ענה בשפה שבה הלקוח כתב, בקצרה ולעניין.",
  ].filter(Boolean).join("\n");

  // Carry the prior turns so the simulated agent has the same memory the live
  // agent gets from loadHistory — a real back-and-forth, not isolated shots.
  const priorTurns: ChatMessage[] = (input.history ?? [])
    .filter((t) => t.content?.trim())
    .map((t) => ({ role: t.role, content: t.content }));

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...priorTurns,
    { role: "user", content: input.message },
  ];
  const result = await chat(messages, { maxTokens: 400 });

  return {
    skill: skill ? { id: skill.id, name: skill.name, version: skill.version } : null,
    reply: result.text,
    availableTools: tools.map((t) => t.name),
  };
}
