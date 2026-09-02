/**
 * Campaigns / Broadcasts — [קטגוריה 18].
 *
 * Send an approved template ([19]) to a segment ([5]), with per-recipient
 * consent enforcement: marketing goes only to `opted_in` and never to blocked
 * contacts (§18.1 / §2.4). Sends are template-only (audience is usually outside
 * the 24h window). Collections: `campaigns`, `campaign_recipients`.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { BaseEntity } from "@/core/types";
import { getSegment, resolveMembers } from "@/modules/segments";
import { sendTemplateMessage } from "@/modules/templates/service";
import { ContactRepository } from "@/modules/contacts/repository";
import { enqueue } from "@/core/jobs";
import type { Contact } from "@/modules/contacts/models";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "completed"
  | "stopped";

export interface CampaignStats {
  sent: number;
  skipped: number;
  failed: number;
}

export interface CampaignVariant {
  id: string;
  templateName: string;
  templateLanguage?: string;
  variableMapping?: string[];
}

export interface Campaign extends BaseEntity {
  name: string;
  segmentId: string;
  templateName: string;
  templateLanguage: string;
  /** Ordered contact field keys mapped to template {{1}}, {{2}}, … */
  variableMapping: string[];
  variants: CampaignVariant[];
  throttlePerMinute: number | null;
  skipPreviouslySent: boolean;
  rrule: string | null;
  status: CampaignStatus;
  stats: CampaignStats;
  /** Frozen recipient list captured at send-start so dynamic-segment churn mid-send can't shift batch offsets. */
  recipientIds: string[] | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
}

export interface CampaignRecipient extends BaseEntity {
  campaignId: string;
  contactId: string;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
  messageId: string | null;
  variantId: string | null;
}

class CampaignRepository extends Repository<Campaign> {
  constructor() {
    super("campaigns");
  }
}
class RecipientRepository extends Repository<CampaignRecipient> {
  constructor() {
    super("campaign_recipients");
  }
}

const campaigns = new CampaignRepository();
const recipients = new RecipientRepository();
const contactsRepo = new ContactRepository();

export interface CreateCampaignInput {
  name: string;
  segmentId: string;
  templateName: string;
  templateLanguage?: string;
  variableMapping?: string[];
  variants?: CampaignVariant[];
  throttlePerMinute?: number | null;
  skipPreviouslySent?: boolean;
  rrule?: string | null;
  scheduledAt?: string | Date | null;
}

export async function createCampaign(tenantId: string, input: CreateCampaignInput): Promise<Campaign> {
  return campaigns.create(tenantId, {
    name: input.name,
    segmentId: input.segmentId,
    templateName: input.templateName,
    templateLanguage: input.templateLanguage ?? "he",
    variableMapping: input.variableMapping ?? [],
    variants: input.variants ?? [],
    throttlePerMinute: input.throttlePerMinute ?? null,
    skipPreviouslySent: input.skipPreviouslySent ?? false,
    rrule: input.rrule ?? null,
    status: "draft",
    stats: { sent: 0, skipped: 0, failed: 0 },
    recipientIds: null,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    sentAt: null,
  });
}

export function listCampaigns(tenantId: string) {
  return campaigns.findMany(tenantId);
}

/**
 * Schedule a campaign to send at `runAt` (§18.2). Marks it `scheduled` and
 * enqueues a `campaign.send` job the scheduler runs at the due time.
 */
export async function scheduleCampaign(
  tenantId: string,
  campaignId: string,
  runAt: Date,
  rrule?: string | null
): Promise<void> {
  const campaign = await campaigns.findById(tenantId, campaignId);
  if (!campaign) throw new Error("campaign not found");
  await campaigns.update(tenantId, campaignId, { status: "scheduled", scheduledAt: runAt, rrule: rrule ?? campaign.rrule });
  await enqueue(tenantId, "campaign.send", { campaignId }, runAt);
}

/**
 * Execute a campaign now: resolve the segment, enforce consent, send the
 * template to each eligible contact, record per-recipient results + stats.
 */
export async function send(tenantId: string, campaignId: string): Promise<CampaignStats> {
  return sendBatch(tenantId, campaignId, 0);
}

export async function sendBatch(
  tenantId: string,
  campaignId: string,
  offset = 0
): Promise<CampaignStats> {
  const campaign = await campaigns.findById(tenantId, campaignId);
  if (!campaign) throw new Error("campaign not found");

  // Freeze the recipient list at send-start; later batches read the snapshot so
  // dynamic-segment churn mid-send can't shift batch offsets (drift).
  let recipientIds = campaign.recipientIds;
  if (offset === 0 || !recipientIds) {
    const segment = await getSegment(tenantId, campaign.segmentId);
    if (!segment) throw new Error("segment not found");
    const members = await resolveMembers(tenantId, segment);
    recipientIds = members.map((m) => m.id);
    await campaigns.update(tenantId, campaignId, {
      status: "sending",
      stats: { sent: 0, skipped: 0, failed: 0 },
      recipientIds,
    });
  } else {
    await campaigns.update(tenantId, campaignId, { status: "sending" });
  }

  const total = recipientIds.length;
  const limit =
    campaign.throttlePerMinute && campaign.throttlePerMinute > 0
      ? campaign.throttlePerMinute
      : total;
  const batchIds = recipientIds.slice(offset, offset + limit);
  const batch = await contactsRepo.findMany(tenantId, { id: { $in: batchIds } } as Filter<Contact>);
  const stats: CampaignStats = offset === 0 ? { sent: 0, skipped: 0, failed: 0 } : { ...campaign.stats };

  for (const contact of batch) {
    // Consent + block enforcement (§18.1 / §2.4 / §4.4).
    const skipReason = consentSkipReason(contact);
    if (skipReason) {
      stats.skipped++;
      await recordRecipient(tenantId, campaignId, contact.id, "skipped", skipReason, null, null);
      continue;
    }
    if (campaign.skipPreviouslySent && (await wasAlreadySent(tenantId, campaignId, contact.id))) {
      stats.skipped++;
      await recordRecipient(tenantId, campaignId, contact.id, "skipped", "already_sent", null, null);
      continue;
    }

    const variant = chooseVariant(campaign, contact);
    const mapping = variant?.variableMapping ?? campaign.variableMapping;
    const variables = mapping.map((key) =>
      String((contact as unknown as Record<string, unknown>)[key] ?? "")
    );

    try {
      const msg = await sendTemplateMessage(
        tenantId,
        contact.waId,
        variant?.templateName ?? campaign.templateName,
        variant?.templateLanguage ?? campaign.templateLanguage,
        variables
      );
      stats.sent++;
      await recordRecipient(tenantId, campaignId, contact.id, "sent", null, msg.id, variant?.id ?? null);
    } catch (err) {
      stats.failed++;
      await recordRecipient(tenantId, campaignId, contact.id, "failed", String(err), null, variant?.id ?? null);
    }
  }

  const nextOffset = offset + batchIds.length;
  if (nextOffset < total) {
    await campaigns.update(tenantId, campaignId, { status: "sending", stats });
    await enqueue(tenantId, "campaign.send_batch", { campaignId, offset: nextOffset }, new Date(Date.now() + 60_000));
    return stats;
  }

  const nextRun = nextFromRRule(campaign.rrule, new Date());
  await campaigns.update(tenantId, campaignId, {
    status: nextRun ? "scheduled" : "completed",
    stats,
    scheduledAt: nextRun,
    sentAt: new Date(),
  });
  if (nextRun) await enqueue(tenantId, "campaign.send", { campaignId }, nextRun);
  return stats;
}

function consentSkipReason(contact: Contact): string | null {
  if (contact.status === "blocked") return "blocked";
  if (contact.marketingOptIn !== "opted_in") return "not_opted_in";
  return null;
}

function recordRecipient(
  tenantId: string,
  campaignId: string,
  contactId: string,
  status: CampaignRecipient["status"],
  reason: string | null,
  messageId: string | null,
  variantId: string | null
) {
  return recipients.create(tenantId, { campaignId, contactId, status, reason, messageId, variantId });
}

async function wasAlreadySent(tenantId: string, campaignId: string, contactId: string): Promise<boolean> {
  return !!(await recipients.findOne(tenantId, { campaignId, contactId, status: "sent" } as Filter<CampaignRecipient>));
}

function chooseVariant(campaign: Campaign, contact: Contact): CampaignVariant | null {
  if (!campaign.variants.length) return null;
  const idx = Math.abs(hash(contact.id)) % campaign.variants.length;
  return campaign.variants[idx];
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

function nextFromRRule(rrule: string | null, from: Date): Date | null {
  if (!rrule) return null;
  const normalized = rrule.trim().toUpperCase();
  const interval = Number(/INTERVAL=(\d+)/.exec(normalized)?.[1] ?? 1);
  const next = new Date(from);
  if (normalized === "DAILY" || normalized.includes("FREQ=DAILY")) {
    next.setDate(next.getDate() + Math.max(1, interval));
    return next;
  }
  if (normalized === "WEEKLY" || normalized.includes("FREQ=WEEKLY")) {
    next.setDate(next.getDate() + 7 * Math.max(1, interval));
    return next;
  }
  if (normalized === "MONTHLY" || normalized.includes("FREQ=MONTHLY")) {
    next.setMonth(next.getMonth() + Math.max(1, interval));
    return next;
  }
  const everyMinutes = /^EVERY:(\d+):MINUTES?$/.exec(normalized)?.[1];
  if (everyMinutes) {
    next.setMinutes(next.getMinutes() + Math.max(1, Number(everyMinutes)));
    return next;
  }
  return null;
}

export function listRecipients(tenantId: string, campaignId: string) {
  return recipients.findMany(tenantId, { campaignId } as Filter<CampaignRecipient>);
}

export async function ensureCampaignIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("campaigns").createIndex({ tenantId: 1, status: 1 }),
    db.collection("campaign_recipients").createIndex({ tenantId: 1, campaignId: 1 }),
    db.collection("campaign_recipients").createIndex({ tenantId: 1, campaignId: 1, contactId: 1 }),
  ]);
}
