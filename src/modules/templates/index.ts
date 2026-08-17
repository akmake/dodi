/**
 * Templates module — public surface ([קטגוריה 19]).
 */
export * from "./models";
export { TemplateRepository, ensureTemplateIndexes } from "./repository";
export {
  syncFromMeta,
  applyStatusUpdate,
  sendTemplateMessage,
  listTemplates,
  getApprovedTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  submitToMeta,
  deleteTemplate,
  countVariables,
  type TemplateInput,
  type TemplateStatusUpdate,
} from "./service";
