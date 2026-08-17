/**
 * AI Flow Architect — orchestration ([קטגוריה 27]).
 *
 * Turns a natural-language request into a clarify/plan/build response. The build
 * path is guarded: the model's graph is validated deterministically, and on
 * errors we feed them back for self-repair (≤3 model calls total). A graph only
 * leaves this function if it passes validation; otherwise we return an honest
 * message plus the issues, never invalid graph for the canvas to render.
 */
import { chat, type ChatMessage } from "@/modules/ai";
import { buildSystemPrompt, repairPrompt } from "./prompt";
import { validateGraph, describeIssues, type KnownEntities, type Graph } from "./validator";
import type {
  ArchitectRequest,
  ArchitectResult,
  ArchitectModelOutput,
  ArchitectCollection,
  ArchitectFieldType,
} from "./models";

const MAX_BUILD_ATTEMPTS = 3;
const MAX_TOKENS = 4096;

export async function runArchitect(
  req: ArchitectRequest,
  known: KnownEntities = {}
): Promise<ArchitectResult> {
  const system = buildSystemPrompt(known);
  const messages: ChatMessage[] = [{ role: "system", content: system }];

  for (const t of req.history ?? []) messages.push({ role: t.role, content: t.content });

  // Give the model the current flow as context (edit mode).
  const userContent = req.currentFlow && req.currentFlow.nodes?.length
    ? `${req.message}\n\n[התהליך הנוכחי על הקנבס, לעריכה]:\n${JSON.stringify(req.currentFlow)}`
    : req.message;
  messages.push({ role: "user", content: userContent });

  let lastIssuesText = "";
  let lastWarnings: ArchitectResult["warnings"];
  let lastFailed: ArchitectResult["failedValidation"];

  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const { text } = await chat(messages, { maxTokens: MAX_TOKENS, temperature: 0.2 });
    const parsed = parseModelOutput(text);

    if (!parsed) {
      // Couldn't parse — ask once more, plainly.
      if (attempt < MAX_BUILD_ATTEMPTS - 1) {
        messages.push({ role: "assistant", content: text });
        messages.push({ role: "user", content: "החזר אך ורק JSON תקין לפי הפורמט, ללא טקסט נוסף." });
        continue;
      }
      return { mode: "clarify", message: "לא הצלחתי לעבד את התשובה. נסה לנסח שוב מה תרצה שהבוט יעשה." };
    }

    // Non-build modes need no validation.
    if (parsed.mode !== "build" || !parsed.flow) {
      return {
        mode: parsed.mode,
        message: parsed.message,
        questions: parsed.questions,
        plan: parsed.plan,
      };
    }

    // The architect may declare tables it needs; treat them as "known" for this
    // validation so it doesn't warn about a collection it's about to create.
    const declaredNames = (parsed.collections ?? []).map((c) => c.name).filter(Boolean);
    const knownForValidation: KnownEntities = declaredNames.length
      ? { ...known, collectionNames: [...(known.collectionNames ?? []), ...declaredNames] }
      : known;

    const result = validateGraph(parsed.flow, knownForValidation);
    if (result.ok) {
      return {
        mode: "build",
        message: parsed.message,
        flow: normalizeGraph(parsed.flow),
        collections: parsed.collections?.length ? parsed.collections : undefined,
        warnings: result.warnings.length ? result.warnings : undefined,
      };
    }

    // Invalid → feed issues back for repair (unless this was the last attempt).
    lastIssuesText = describeIssues(result);
    lastWarnings = result.warnings;
    lastFailed = result.errors;
    if (attempt < MAX_BUILD_ATTEMPTS - 1) {
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: repairPrompt(lastIssuesText) });
    }
  }

  // Exhausted repair attempts — be honest, don't render invalid graph.
  return {
    mode: "clarify",
    message:
      "ניסיתי לבנות את התהליך אך נותרו כמה בעיות שלא הצלחתי לסגור. רוצה לפשט או לדייק את הבקשה? הנה מה שנתקעתי בו:\n" +
      lastIssuesText,
    failedValidation: lastFailed,
    warnings: lastWarnings,
  };
}

// ── Parsing ──────────────────────────────────────────────────────────

/** Extract the JSON object from the model's text, tolerating code fences/prose. */
function parseModelOutput(text: string): ArchitectModelOutput | null {
  const raw = extractJsonObject(text);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<ArchitectModelOutput>;
    if (obj.mode !== "clarify" && obj.mode !== "plan" && obj.mode !== "build") return null;
    return {
      mode: obj.mode,
      message: typeof obj.message === "string" ? obj.message : "",
      questions: Array.isArray(obj.questions) ? obj.questions.map(String) : undefined,
      plan: Array.isArray(obj.plan) ? obj.plan.map(String) : undefined,
      flow: isGraph(obj.flow) ? obj.flow : undefined,
      collections: parseCollections(obj.collections),
    };
  } catch {
    return null;
  }
}

const FIELD_TYPES = new Set<ArchitectFieldType>(["text", "number", "boolean", "date", "datetime", "select"]);

/** Defensively coerce the model's `collections` into well-formed table specs. */
function parseCollections(value: unknown): ArchitectCollection[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ArchitectCollection[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!name) continue;
    const fields = Array.isArray(c.fields)
      ? c.fields
          .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as Record<string, unknown>).key === "string")
          .map((f) => {
            const t = String(f.type);
            return {
              key: String(f.key).trim(),
              label: typeof f.label === "string" && f.label.trim() ? f.label.trim() : String(f.key).trim(),
              type: (FIELD_TYPES.has(t as ArchitectFieldType) ? t : "text") as ArchitectFieldType,
              options: Array.isArray(f.options) ? f.options.map(String) : undefined,
              required: f.required === true,
            };
          })
          .filter((f) => f.key)
      : [];
    out.push({
      name,
      label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : name,
      fields,
      seedRows: Array.isArray(c.seedRows)
        ? c.seedRows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        : undefined,
    });
  }
  return out.length ? out : undefined;
}

/** Find the outermost {...} block, ignoring fences and surrounding prose. */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

function isGraph(v: unknown): v is Graph {
  return !!v && typeof v === "object" && Array.isArray((v as Graph).nodes) && Array.isArray((v as Graph).edges);
}

/** Strip any stray positions and coerce edge handles to the engine's shape. */
function normalizeGraph(g: Graph): Graph {
  return {
    nodes: g.nodes.map((n) => {
      const data = { ...(n.data ?? {}) };
      delete (data as Record<string, unknown>).position;
      return { id: n.id, type: n.type, data };
    }),
    edges: g.edges.map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  };
}
