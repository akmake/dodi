/**
 * Channels abstraction — [קטגוריה 1].
 *
 * WhatsApp remains the only live adapter today, but routing/channel selection
 * now has a typed seam for future web chat/email/Instagram/SMS.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";
import type { Filter } from "mongodb";

export type ChannelType = "whatsapp" | "web_chat" | "email" | "instagram" | "sms";
export type ChannelStatus = "active" | "disabled" | "error";

export interface ChannelAccount extends BaseEntity {
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  externalId: string | null;
  priority: number;
  config: Record<string, unknown>;
}

export interface AvailabilityRule extends BaseEntity {
  channelType: ChannelType;
  enabled: boolean;
  timezone: string;
  days: number[];
  startMinutes: number;
  endMinutes: number;
}

export interface ChannelAdapter {
  type: ChannelType;
  canSendFreeform: boolean;
  supportsMedia: boolean;
  supportsTemplates: boolean;
}

class ChannelRepository extends Repository<ChannelAccount> {
  constructor() {
    super("channel_accounts");
  }
  listActive(tenantId: string) {
    return this.findMany(tenantId, { status: "active" } as Filter<ChannelAccount>);
  }
}

class AvailabilityRepository extends Repository<AvailabilityRule> {
  constructor() {
    super("channel_availability_rules");
  }
}

const channels = new ChannelRepository();
const rules = new AvailabilityRepository();

export const ADAPTERS: ChannelAdapter[] = [
  { type: "whatsapp", canSendFreeform: true, supportsMedia: true, supportsTemplates: true },
  { type: "web_chat", canSendFreeform: true, supportsMedia: true, supportsTemplates: false },
  { type: "email", canSendFreeform: true, supportsMedia: true, supportsTemplates: false },
  { type: "instagram", canSendFreeform: true, supportsMedia: true, supportsTemplates: false },
  { type: "sms", canSendFreeform: true, supportsMedia: false, supportsTemplates: false },
];

export function listAdapters(): ChannelAdapter[] {
  return ADAPTERS;
}

export async function registerChannel(
  tenantId: string,
  input: Omit<ChannelAccount, keyof BaseEntity>
): Promise<ChannelAccount> {
  await ensureChannelIndexes();
  return channels.create(tenantId, input);
}

export function listChannels(tenantId: string): Promise<ChannelAccount[]> {
  return channels.findMany(tenantId);
}

export async function pickOutboundChannel(tenantId: string, preferred: ChannelType[] = ["whatsapp"]) {
  const active = await channels.listActive(tenantId);
  return (
    preferred.map((type) => active.find((c) => c.type === type)).find(Boolean) ??
    active.sort((a, b) => b.priority - a.priority)[0] ??
    null
  );
}

export async function channelAvailable(tenantId: string, channelType: ChannelType, at = new Date()): Promise<boolean> {
  const all = await rules.findMany(tenantId, { channelType, enabled: true } as Filter<AvailabilityRule>);
  if (all.length === 0) return true;
  const day = at.getDay();
  const minutes = at.getHours() * 60 + at.getMinutes();
  return all.some((r) => r.days.includes(day) && minutes >= r.startMinutes && minutes <= r.endMinutes);
}

export async function ensureChannelIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("channel_accounts").createIndex({ tenantId: 1, type: 1, status: 1 }),
    db.collection("channel_availability_rules").createIndex({ tenantId: 1, channelType: 1, enabled: 1 }),
  ]);
}
