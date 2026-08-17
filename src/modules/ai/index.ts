/**
 * AI Agent module — public surface ([קטגוריה 10]).
 */
export { respond, type AIResult, type AIDecision } from "./service";
export {
  chat,
  chatWithTools,
  type ChatMessage,
  type ChatResult,
  type ToolSpec,
  type ToolCall,
} from "./provider";
export { simulateSkill, type SimulateInput, type SimulateResult, type SimulateTurn } from "./simulate";
export {
  listConfigVersions,
  createConfigVersion,
  activateConfig,
  getActiveConfig,
  createExperiment,
  getActiveExperiment,
  listExperiments,
  stopExperiment,
  ensureAgentIndexes,
  type AgentConfig,
  type AgentExperiment,
} from "./agent";
export { analyze } from "./nlu";
export { extractEntities, type ExtractField } from "./extract";
export { enrich } from "./enrich";
export { checkOutput, type GuardrailResult } from "./guardrails";
export type { AIResponse, NluResult, Enrichment } from "./models";
