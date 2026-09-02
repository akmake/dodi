/**
 * WhatsApp module — public surface ([קטגוריה 2]).
 *
 * Route handlers and other modules import from here, not from internal files.
 */
export * from "./models";
export * from "./client";
export {
  verifyHandshake,
  processWebhook,
  sendText,
  sendButtons,
  sendTemplate,
  sendMedia,
  sendWhatsAppFlow,
  uploadMedia,
  downloadMedia,
  downloadMessageMedia,
  type WebhookOutcome,
  type InboundSummary,
  type SendOptions,
  type WhatsAppFlowMessageInput,
} from "./service";
export {
  getConnectionStatus,
  upsertAccount,
  disconnectAccount,
  type WhatsAppConnectionStatus,
  type UpsertAccountInput,
} from "./account";
export {
  WhatsAppAccountRepository,
  ConversationRepository,
  MessageRepository,
  ensureWhatsAppIndexes,
} from "./repository";
export { verifyWebhookSignature } from "./signature";
