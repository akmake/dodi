/**
 * WTA (WhatsApp group-admin moderation) domain types.
 *
 * WTA rides on the *same* QR-based Baileys engine as WTM/BTB (`wa-engine`), but
 * its purpose is group governance for admins: the connected number is an admin
 * in one or more groups, and the bot auto-enforces rules — delete messages by
 * keyword, strip links/invites, warn/kick offenders, and lock a group to
 * "admins only" on a schedule.
 *
 * Unlike WTM's conveyor (which sleeps sockets), WTA sockets are ALWAYS-ON
 * (BTB-style, namespaced `wta_<clientId>` in wa-engine) — a sleeping socket
 * never sees a message and so can't delete it in real time.
 *
 * Like WTM, these are native-Mongo/ObjectId documents (NOT bootWhat's
 * `BaseEntity`), stored in dedicated `wta_*` collections so WTA and WTM never
 * share client data. The `clientId` string on child docs is a `WtaClient._id`.
 */
import type { ObjectId } from "mongodb";

export type PlanType = "trial" | "monthly" | "annual" | "custom";
export type BillingStatus = "active" | "overdue" | "trial" | "suspended" | "cancelled";

/** A group this client's bot is set to moderate. `groupId` is bare (no `@g.us`, no `:device`). */
export interface WtaManagedGroup {
  groupId: string;
  groupName: string;
  enabled: boolean;
}

export interface WtaClient {
  _id: ObjectId;
  name: string;
  phone: string;
  active: boolean;

  planType: PlanType;
  planPrice: number;
  billingStatus: BillingStatus;
  nextBillingDate: Date | null;

  contractEmail: string;
  tags: string[];
  internalNotes: string;

  /** Groups the bot governs. Only messages in enabled managed groups are ever acted on. */
  managedGroups: WtaManagedGroup[];
  /** When true, group admins are exempt from keyword/link deletion rules. */
  exemptAdmins: boolean;
  /** When true, every group message is logged to `wta_messages` (for the analysis tab). */
  logMessages: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type WtaClientInput = Omit<WtaClient, "_id" | "createdAt" | "updatedAt">;

// ─── Rules ───────────────────────────────────────────────────────────────────

export type RuleType = "keyword_delete" | "link_delete" | "admin_only_schedule";
export type KeywordMode = "contains" | "exact" | "regex";
/** What happens when a message violates a moderation rule. `kick` implies delete. */
export type OnMatchAction = "delete" | "warn" | "kick";

/** Active-hours window for a rule. Wraps past midnight when `to` < `from`. `days` empty = every day (0=Sun…6=Sat). */
export interface RuleSchedule {
  days: number[];
  from: string; // "HH:mm"
  to: string; // "HH:mm"
}

interface WtaRuleBase {
  _id: ObjectId;
  clientId: string;
  type: RuleType;
  name: string;
  enabled: boolean;
  /** Bare groupIds this rule applies to; `null`/empty = all of the client's managed groups. */
  groupIds: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeywordDeleteRule extends WtaRuleBase {
  type: "keyword_delete";
  words: string[];
  mode: KeywordMode;
  caseSensitive: boolean;
  onMatch: OnMatchAction;
  /** Text sent to the group on warn (and alongside delete/kick when non-empty). */
  warnText: string;
  /** Only active within this window; `null` = always active. */
  schedule: RuleSchedule | null;
}

export interface LinkDeleteRule extends WtaRuleBase {
  type: "link_delete";
  /** Delete WhatsApp group invite links (chat.whatsapp.com/…). */
  includeInviteLinks: boolean;
  /** Delete any http(s) URL. */
  includeAllLinks: boolean;
  /** Domains that are allowed even when includeAllLinks is on (e.g. "youtube.com"). */
  allowlist: string[];
  onMatch: OnMatchAction;
  warnText: string;
  schedule: RuleSchedule | null;
}

export interface AdminOnlyScheduleRule extends WtaRuleBase {
  type: "admin_only_schedule";
  /** "HH:mm" — set the group to announcement mode (only admins can send). */
  lockAt: string;
  /** "HH:mm" — restore open mode (everyone can send). */
  unlockAt: string;
  /** Days the schedule applies (0=Sun…6=Sat); empty = every day. */
  days: number[];
}

export type WtaRule = KeywordDeleteRule | LinkDeleteRule | AdminOnlyScheduleRule;

/** Distributive Omit — preserves each union member's own fields (a plain
 *  `Omit<Union, K>` collapses to only the shared keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type WtaRuleInput = DistributiveOmit<WtaRule, "_id" | "createdAt" | "updatedAt">;

// ─── Actions (moderation audit log) ──────────────────────────────────────────

export type ActionType = "delete" | "warn" | "kick" | "lock" | "unlock";

export interface WtaAction {
  _id: ObjectId;
  clientId: string;
  type: ActionType;
  ruleId: string | null;
  groupJid: string;
  groupName: string;
  /** Offender phone/name for delete/warn/kick; empty for lock/unlock. */
  actorPhone: string;
  actorName: string;
  /** Why it fired — matched word, "invite link", "schedule", etc. */
  reason: string;
  /** Truncated offending text (empty for lock/unlock). */
  textSnippet: string;
  createdAt: Date;
}

export type WtaActionInput = Omit<WtaAction, "_id" | "createdAt"> & { createdAt?: Date };

// ─── Message log (optional, powers the analysis tab) ─────────────────────────

export interface WtaMessage {
  _id: ObjectId;
  clientId: string;
  groupJid: string | null;
  groupName: string | null;
  phone: string;
  senderName: string;
  text: string;
  msgId: string | null;
  createdAt: Date;
}

export type WtaMessageInput = Omit<WtaMessage, "_id" | "createdAt"> & { createdAt?: Date };

// ─── Support notes & payments (management-shell parity with WTM) ─────────────

export interface WtaSupportNote {
  _id: ObjectId;
  clientId: string;
  content: string;
  priority: "low" | "medium" | "high" | "critical";
  resolved: boolean;
  resolvedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentMethod = "credit" | "bank" | "cash" | "bit" | "paybox" | "other";

export interface WtaPayment {
  _id: ObjectId;
  clientId: string;
  amount: number;
  method: PaymentMethod;
  period: string;
  paidAt: Date;
  notes: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
