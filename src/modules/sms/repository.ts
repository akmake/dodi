import { randomUUID } from "crypto";
import type { Filter } from "mongodb";
import { getDb } from "@/core/db/mongo";
import { Repository } from "@/core/db/repository";
import type { SmsDelivery, SmsDeliveryChannel, SmsSettings } from "./models";

class SmsSettingsRepository extends Repository<SmsSettings> {
  constructor() { super("sms_settings"); }
}

const settingsRepo = new SmsSettingsRepository();
let indexesReady: Promise<void> | null = null;

export function ensureSmsIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("sms_settings").createIndex({ tenantId: 1 }, { unique: true }),
        db.collection("sms_settings").createIndex({ inboundKeyHash: 1 }, { unique: true, sparse: true }),
        db.collection("sms_deliveries").createIndex({ tenantId: 1, externalId: 1 }, { unique: true }),
        db.collection("sms_deliveries").createIndex({ tenantId: 1, receivedAt: -1 }),
        db.collection("sms_deliveries").createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }),
      ]);
    })().catch((error) => { indexesReady = null; throw error; });
  }
  return indexesReady;
}

export async function getSmsSettings(tenantId: string): Promise<SmsSettings | null> {
  await ensureSmsIndexes();
  return settingsRepo.findOne(tenantId, {});
}

export async function findSmsSettingsByKeyHash(keyHash: string): Promise<SmsSettings | null> {
  await ensureSmsIndexes();
  const db = await getDb();
  return db.collection<SmsSettings>("sms_settings").findOne({ inboundKeyHash: keyHash } as Filter<SmsSettings>);
}

/** Every tenant's relay settings — for the always-on bootstrap, which has no tenant yet. */
export async function listAllSmsSettings(): Promise<SmsSettings[]> {
  await ensureSmsIndexes();
  const db = await getDb();
  return db.collection<SmsSettings>("sms_settings").find({}).toArray();
}

export async function upsertSmsSettings(
  tenantId: string,
  patch: Omit<Partial<SmsSettings>, "id" | "tenantId" | "createdAt" | "updatedAt">
): Promise<SmsSettings> {
  await ensureSmsIndexes();
  const existing = await settingsRepo.findOne(tenantId, {});
  if (existing) return (await settingsRepo.update(tenantId, existing.id, patch))!;
  return settingsRepo.create(tenantId, {
    waPhone: "",
    emailFallback: false,
    senderEmail: "",
    appPasswordEncrypted: "",
    destinationEmail: "",
    inboundKeyHash: "",
    inboundKeyPrefix: "",
    enabled: false,
    lastTestAt: null,
    lastDeliveryAt: null,
    lastError: null,
    ...patch,
  });
}

export async function listSmsDeliveries(tenantId: string, limit = 50): Promise<SmsDelivery[]> {
  await ensureSmsIndexes();
  const db = await getDb();
  return db.collection<SmsDelivery>("sms_deliveries")
    .find({ tenantId } as Filter<SmsDelivery>)
    .sort({ receivedAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .toArray();
}

export async function claimSmsDelivery(
  tenantId: string,
  input: { externalId: string; from: string; body: string; receivedAt: Date; deviceId: string | null }
): Promise<{ delivery: SmsDelivery; shouldSend: boolean }> {
  await ensureSmsIndexes();
  const db = await getDb();
  const col = db.collection<SmsDelivery>("sms_deliveries");
  const now = new Date();
  const fresh: SmsDelivery = {
    id: randomUUID(), tenantId, createdAt: now, updatedAt: now,
    ...input, status: "pending", channel: null, attempts: 0,
    waMessageId: null, emailMessageId: null,
    lastError: null, lastAttemptAt: null,
  };
  await col.insertOne(fresh).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
  });

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const claimed = await col.findOneAndUpdate(
    {
      tenantId,
      externalId: input.externalId,
      $or: [
        { status: { $in: ["pending", "failed"] } },
        { status: "sending", lastAttemptAt: { $lt: staleBefore } },
      ],
    } as Filter<SmsDelivery>,
    { $set: { status: "sending", lastAttemptAt: now, lastError: null, updatedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  if (claimed) return { delivery: claimed, shouldSend: true };
  const existing = await col.findOne({ tenantId, externalId: input.externalId } as Filter<SmsDelivery>);
  if (!existing) throw new Error("delivery state unavailable");
  return { delivery: existing, shouldSend: false };
}

/**
 * Re-claim a known delivery for another attempt — the queued-retry counterpart
 * of {@link claimSmsDelivery}. Same atomic guard, so a retry that overlaps a
 * still-running attempt (or a message that meanwhile succeeded) is a no-op.
 */
export async function claimSmsDeliveryForRetry(
  tenantId: string,
  deliveryId: string
): Promise<SmsDelivery | null> {
  await ensureSmsIndexes();
  const db = await getDb();
  const now = new Date();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  return await db.collection<SmsDelivery>("sms_deliveries").findOneAndUpdate(
    {
      tenantId,
      id: deliveryId,
      $or: [
        { status: { $in: ["pending", "failed"] } },
        { status: "sending", lastAttemptAt: { $lt: staleBefore } },
      ],
    } as Filter<SmsDelivery>,
    { $set: { status: "sending", lastAttemptAt: now, updatedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
}

export async function finishSmsDelivery(
  tenantId: string,
  externalId: string,
  result:
    | { status: "sent"; channel: SmsDeliveryChannel; waMessageId?: string | null; emailMessageId?: string | null }
    | { status: "failed"; error: string }
): Promise<void> {
  const db = await getDb();
  const patch = result.status === "sent"
    ? {
        status: "sent" as const,
        channel: result.channel,
        waMessageId: result.waMessageId ?? null,
        emailMessageId: result.emailMessageId ?? null,
        lastError: null,
        updatedAt: new Date(),
      }
    : { status: "failed" as const, lastError: result.error, updatedAt: new Date() };
  await db.collection<SmsDelivery>("sms_deliveries").updateOne(
    { tenantId, externalId } as Filter<SmsDelivery>,
    { $set: patch }
  );
}
