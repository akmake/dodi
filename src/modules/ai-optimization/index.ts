/**
 * AI Optimization — [קטגוריה 24].
 *
 * Testing/simulation (§24.1), feedback loop + knowledge gaps (§24.3), and the
 * conversation trace (§24.4). Builds entirely on existing layers: the AI
 * provider for sandbox runs, NLU for intent comparison, the persisted
 * `AIResponse` turns for traces, and the Analytics event store for gap mining.
 */
import { randomUUID } from "crypto";
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import { chat, analyze } from "@/modules/ai";
import { AIResponseRepository } from "@/modules/ai/repository";
import { topIntents, type DateRange } from "@/modules/analytics";
import type { AIResponse } from "@/modules/ai";
import {
  type TestSuite,
  type TestCase,
  type Feedback,
  type FeedbackRating,
} from "./models";

export * from "./models";

class TestSuiteRepository extends Repository<TestSuite> {
  constructor() {
    super("test_suites");
  }
}
class FeedbackRepository extends Repository<Feedback> {
  constructor() {
    super("ai_feedback");
  }
}

const suites = new TestSuiteRepository();
const feedback = new FeedbackRepository();
const aiResponses = new AIResponseRepository();

// ─── Test suites (§24.1) ──────────────────────────────────────────────────────

export interface CaseInput {
  input: string;
  expectContains?: string[];
  expectIntent?: string | null;
  expectDecision?: TestCase["expectDecision"];
}

function buildCase(input: CaseInput): TestCase {
  return {
    id: randomUUID(),
    input: input.input,
    expectContains: input.expectContains ?? [],
    expectIntent: input.expectIntent ?? null,
    expectDecision: input.expectDecision ?? null,
    result: null,
  };
}

export function createSuite(
  tenantId: string,
  input: { name: string; cases?: CaseInput[] }
): Promise<TestSuite> {
  return suites.create(tenantId, {
    name: input.name,
    cases: (input.cases ?? []).map(buildCase),
    passRate: null,
    lastRunAt: null,
  });
}

export function listSuites(tenantId: string) {
  return suites.findMany(tenantId);
}

export function getSuite(tenantId: string, id: string) {
  return suites.findById(tenantId, id);
}

export async function updateSuite(
  tenantId: string,
  id: string,
  patch: { name?: string; cases?: CaseInput[] }
): Promise<TestSuite | null> {
  const update: Partial<TestSuite> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.cases !== undefined) update.cases = patch.cases.map(buildCase);
  return suites.update(tenantId, id, update);
}

const SANDBOX_SYSTEM =
  "אתה הסוכן הנבדק. ענה בקצרה, בעברית, על סמך השאלה בלבד. אל תמציא מידע שאין לך.";

/**
 * Run every case against the current agent in a sandbox (no customer messages
 * are sent). Comparison is substring-/intent-based to tolerate non-deterministic
 * phrasing (§24.1 edge case). Persists per-case results and the suite pass rate.
 */
export async function runSuite(tenantId: string, id: string): Promise<TestSuite | null> {
  const suite = await suites.findById(tenantId, id);
  if (!suite) return null;

  const cases: TestCase[] = [];
  let passed = 0;
  for (const c of suite.cases) {
    const result = await runCase(c);
    if (result.result?.passed) passed++;
    cases.push(result);
  }

  return suites.update(tenantId, id, {
    cases,
    passRate: suite.cases.length > 0 ? passed / suite.cases.length : null,
    lastRunAt: new Date(),
  });
}

async function runCase(c: TestCase): Promise<TestCase> {
  let actualText = "";
  let actualIntent: string | null = null;
  try {
    const res = await chat([
      { role: "system", content: SANDBOX_SYSTEM },
      { role: "user", content: c.input },
    ]);
    actualText = res.text;
    try {
      actualIntent = (await analyze(c.input)).intent;
    } catch {
      /* intent optional */
    }
  } catch (err) {
    actualText = `__error__: ${String(err)}`;
  }

  const lower = actualText.toLowerCase();
  const containsOk = c.expectContains.every((s) => lower.includes(s.toLowerCase()));
  const intentOk = !c.expectIntent || actualIntent === c.expectIntent;
  const passed = containsOk && intentOk && !actualText.startsWith("__error__");

  return { ...c, result: { passed, actualText, actualIntent, ranAt: new Date() } };
}

// ─── Feedback loop (§24.3) ────────────────────────────────────────────────────

export function recordFeedback(
  tenantId: string,
  input: {
    conversationId: string;
    aiResponseId?: string | null;
    rating: FeedbackRating;
    note?: string | null;
    source?: Feedback["source"];
  }
): Promise<Feedback> {
  return feedback.create(tenantId, {
    conversationId: input.conversationId,
    aiResponseId: input.aiResponseId ?? null,
    rating: input.rating,
    note: input.note ?? null,
    source: input.source ?? "agent",
  });
}

export function listFeedback(tenantId: string, rating?: FeedbackRating) {
  return feedback.findMany(tenantId, (rating ? { rating } : {}) as Filter<Feedback>);
}

/**
 * Knowledge gaps (§24.3): intents that most often ended in handoff — the
 * questions the AI struggles with. Mined from the Analytics event store.
 */
export async function knowledgeGaps(tenantId: string, range: DateRange = {}) {
  const topics = await topIntents(tenantId, range, 50);
  return topics
    .filter((t) => t.handoffRate > 0)
    .sort((a, b) => b.handoffRate - a.handoffRate || b.count - a.count);
}

// ─── Conversation trace (§24.4) ───────────────────────────────────────────────

/** The persisted reasoning turns for a conversation: intent, sources, decision, tools, tokens. */
export function getTrace(tenantId: string, conversationId: string): Promise<AIResponse[]> {
  return aiResponses.listByConversation(tenantId, conversationId);
}

export async function ensureAiOptimizationIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("test_suites").createIndex({ tenantId: 1, name: 1 }),
    db.collection("ai_feedback").createIndex({ tenantId: 1, conversationId: 1 }),
    db.collection("ai_feedback").createIndex({ tenantId: 1, rating: 1 }),
  ]);
}
