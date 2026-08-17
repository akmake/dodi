/**
 * LLM provider — [קטגוריה 10].
 *
 * The seam between agent logic and the model. Defaults to the latest Claude via
 * the Anthropic SDK (IMPLEMENTATION.md §2 target); falls back to Groq/Llama
 * (salvaged from src/lib/groq.ts) when no Anthropic key is configured. A third
 * backend, "local", talks to a self-hosted model (Ollama / vLLM) over the
 * OpenAI-compatible HTTP shape — fully on your own hardware, no external API and
 * no per-token cost. The agent never knows which backend answered — `chat()`
 * keeps one shape for all three.
 */
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { config } from "@/core/config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  /** Used only by the Groq backend — Claude (Opus 4.8) rejects `temperature`. */
  temperature?: number;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

type Provider = "anthropic" | "groq" | "local";

function activeProvider(): Provider {
  if (
    config.aiProvider === "anthropic" ||
    config.aiProvider === "groq" ||
    config.aiProvider === "local"
  ) {
    return config.aiProvider;
  }
  return config.anthropic.apiKey ? "anthropic" : "groq";
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  switch (activeProvider()) {
    case "anthropic":
      return chatAnthropic(messages, opts);
    case "local":
      return chatLocal(messages, opts);
    default:
      return chatGroq(messages, opts);
  }
}

// --- Anthropic (Claude) -----------------------------------------------------

let anthropicClient: Anthropic | null = null;
function claude(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  return anthropicClient;
}

async function chatAnthropic(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  // Claude takes the system prompt as a top-level param, and the message list
  // must begin with a user turn. Split the system blocks out and drop any
  // leading assistant turns. No `temperature` (Opus 4.8 rejects it); depth is
  // controlled via `effort` instead.
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const turns = messages.filter(
    (m): m is { role: "user" | "assistant"; content: string } => m.role !== "system"
  );
  while (turns.length && turns[0].role === "assistant") turns.shift();

  const response = await claude().messages.create({
    model: config.anthropic.model,
    max_tokens: opts.maxTokens ?? 512,
    output_config: { effort: config.anthropic.effort },
    ...(system ? { system } : {}),
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// --- Tool calling (Claude tool-use) — [קטגוריה 13 → 10] A4 -------------------

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ToolExecutor = (call: ToolCall) => Promise<string>;

export interface ToolChatResult extends ChatResult {
  toolCalls: { name: string; input: Record<string, unknown>; result: string }[];
}

/**
 * Agentic answer with tool access: Claude may call the supplied tools, we run
 * them via `exec`, feed results back, and loop until it produces a final answer.
 * Only the Anthropic backend supports tool-use — Groq falls back to a plain
 * answer with no tools.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolSpec[],
  exec: ToolExecutor,
  opts: ChatOptions = {}
): Promise<ToolChatResult> {
  if (activeProvider() !== "anthropic" || tools.length === 0) {
    const r = await chat(messages, opts);
    return { ...r, toolCalls: [] };
  }

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const convo: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (convo.length && convo[0].role === "assistant") convo.shift();

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const toolCalls: ToolChatResult["toolCalls"] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let text = "";

  for (let turn = 0; turn < 6; turn++) {
    const resp = await claude().messages.create({
      model: config.anthropic.model,
      max_tokens: opts.maxTokens ?? 600,
      output_config: { effort: config.anthropic.effort },
      ...(system ? { system } : {}),
      tools: anthropicTools,
      messages: convo,
    });
    inputTokens += resp.usage.input_tokens;
    outputTokens += resp.usage.output_tokens;
    text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (resp.stop_reason !== "tool_use") {
      return { text, inputTokens, outputTokens, toolCalls };
    }

    convo.push({ role: "assistant", content: resp.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      let result: string;
      try {
        result = await exec({ id: block.id, name: block.name, input });
      } catch (err) {
        result = `error: ${String(err)}`;
      }
      toolCalls.push({ name: block.name, input, result });
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    convo.push({ role: "user", content: toolResults });
  }

  return { text, inputTokens, outputTokens, toolCalls };
}

// --- Groq / Llama (legacy fallback) -----------------------------------------

let groqClient: Groq | null = null;
function groq(): Groq {
  if (!groqClient) groqClient = new Groq({ apiKey: config.groq.apiKey });
  return groqClient;
}

async function chatGroq(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const model = config.groq.model;
  const params = {
    messages,
    max_tokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.3,
  };

  try {
    const completion = await groq().chat.completions.create({ model, ...params });
    return toGroqResult(completion);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    console.error(`[ai] groq error (model=${model}, status=${status})`, err);
    // Retry once on rate-limit with the smaller fallback model.
    if (status === 429 && model !== config.groq.fallbackModel) {
      const completion = await groq().chat.completions.create({
        model: config.groq.fallbackModel,
        ...params,
        max_tokens: Math.min(params.max_tokens, 256),
      });
      return toGroqResult(completion);
    }
    throw err;
  }
}

function toGroqResult(completion: {
  choices: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): ChatResult {
  return {
    text: completion.choices[0]?.message?.content ?? "",
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

// --- Local (self-hosted: Ollama / vLLM / llama.cpp) -------------------------
//
// Runs entirely on your own hardware — zero external API, zero per-token cost.
// Speaks the OpenAI `/chat/completions` shape that Ollama (localhost:11434/v1),
// vLLM and llama.cpp all expose, so switching model is just `LOCAL_AI_MODEL`,
// and moving the model to its own GPU box later is just `LOCAL_AI_URL`.
// No SDK needed — a plain fetch keeps this dependency-free.

async function chatLocal(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const res = await fetch(`${config.local.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.local.apiKey}`,
    },
    body: JSON.stringify({
      model: config.local.model,
      messages,
      max_tokens: opts.maxTokens ?? 512,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[ai] local backend ${res.status} (url=${config.local.baseUrl}, model=${config.local.model}): ${body.slice(0, 300)}`
    );
  }

  const completion = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: completion.choices?.[0]?.message?.content ?? "",
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}
