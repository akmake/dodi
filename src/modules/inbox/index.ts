/**
 * Inbox module — public surface ([קטגוריה 3]).
 */
export * from "./models";
export { CannedReplyRepository, ensureInboxIndexes } from "./repository";
export {
  listConversations,
  getConversationView,
  markRead,
  assign,
  setStatus,
  snooze,
  setPriority,
  addTag,
  removeTag,
  setAiEnabled,
  reply,
  addInternalNote,
  createCannedReply,
  listCannedReplies,
  renderCannedReply,
  listMentions,
  markMentionRead,
  listInboxViews,
  createInboxView,
  deleteInboxView,
} from "./service";
