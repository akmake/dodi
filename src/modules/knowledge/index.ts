/**
 * Knowledge Base module — public surface ([קטגוריה 12]).
 */
export * from "./models";
export {
  KnowledgeSourceRepository,
  KnowledgeChunkRepository,
  ensureKnowledgeIndexes,
} from "./repository";
export { addSource, retrieve, tokenize, listSources, type AddSourceInput } from "./service";
