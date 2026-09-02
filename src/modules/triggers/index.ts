/**
 * Triggers module — public surface ([קטגוריה 6]).
 */
export * from "./models";
export {
  createTrigger,
  matchInbound,
  findWebhookTrigger,
  listTriggers,
  getTrigger,
  updateTrigger,
  deleteTrigger,
  matchingEventTriggers,
  ensureTriggerIndexes,
  TriggerRepository,
  type InboundEvent,
  type CreateTriggerInput,
  type TriggerEvent,
} from "./service";
export {
  fireAutomationEvent,
  type AutomationEventInput,
  type AutomationEventResult,
} from "./events";
