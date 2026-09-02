/**
 * WTM (WhatsApp↔Email bridge) domain types — port of `Whatsapp/server/models/
 * {Tenant,Message,SupportNote,Payment}.js`.
 *
 * Deliberately keyed by Mongo's native `_id` (ObjectId), NOT bootWhat's
 * `BaseEntity` (uuid `id` + org `tenantId`) — see the plan's note on the
 * `tenantId` naming collision. Existing documents in the `tenants`/`messages`/
 * `payments`/`supportnotes` collections reference each other via `_id`, and
 * changing that would touch every foreign key on live customer data. Field
 * names/shapes match the legacy Mongoose schemas exactly so the existing
 * collections need zero migration.
 */
import type { ObjectId } from "mongodb";

export type PlanType = "trial" | "monthly" | "annual" | "custom";
export type BillingStatus = "active" | "overdue" | "trial" | "suspended" | "cancelled";

export interface WtmClient {
  _id: ObjectId;
  name: string;
  phone: string;
  bridgeEmail: string;
  bridgeEmailPassword: string; // encrypted via wa-engine/legacyCrypto
  destinationEmail: string;
  active: boolean;

  planType: PlanType;
  planPrice: number;
  billingStatus: BillingStatus;
  nextBillingDate: Date | null;

  contractEmail: string;
  tags: string[];
  internalNotes: string;

  emailSignature: string;

  groupsEnabled: boolean;
  allowedGroups: { groupId: string; groupName: string }[];

  createdAt: Date;
  updatedAt: Date;
}

export type WtmClientInput = Omit<WtmClient, "_id" | "createdAt" | "updatedAt">;

export type MessageDirection = "in" | "out";
export type MessageMediaType = "image" | "video" | "audio" | "document" | null;

export interface WtmMessage {
  _id: ObjectId;
  /** WtmClient._id as a string — the legacy "tenantId" (which WTM customer this belongs to). */
  tenantId: string;
  phone: string;
  senderName: string;
  direction: MessageDirection;
  text: string;
  mediaPath: string | null;
  mediaType: MessageMediaType;
  groupJid: string | null;
  groupName: string | null;
  msgId: string | null;
  createdAt: Date;
}

export type WtmMessageInput = Omit<WtmMessage, "_id" | "createdAt"> & { createdAt?: Date };

export interface SupportNote {
  _id: ObjectId;
  tenantId: string;
  content: string;
  priority: "low" | "medium" | "high" | "critical";
  resolved: boolean;
  resolvedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentMethod = "credit" | "bank" | "cash" | "bit" | "paybox" | "other";

export interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  method: PaymentMethod;
  period: string;
  paidAt: Date;
  notes: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
