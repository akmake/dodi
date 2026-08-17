/**
 * WTM data access — native Mongo driver over the legacy `tenants`/`messages`/
 * `supportnotes`/`payments` collections. See models.ts for why this doesn't use
 * bootWhat's generic `Repository<T>`.
 */
import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/core/db/mongo";
import type { WtmClient, WtmClientInput, WtmMessage, WtmMessageInput, SupportNote, Payment, PaymentMethod } from "./models";

let indexesReady: Promise<void> | null = null;

export function ensureWtmIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("tenants").createIndex({ phone: 1 }, { unique: true }),
        db.collection("messages").createIndex({ tenantId: 1, phone: 1, createdAt: 1 }),
        db.collection("messages").createIndex({ tenantId: 1, groupJid: 1, createdAt: 1 }),
        db.collection("messages").createIndex({ tenantId: 1, msgId: 1 }, { unique: true, sparse: true }),
        db.collection("messages").createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

const clientsCol = async () => (await getDb()).collection<WtmClient>("tenants");
const messagesCol = async () => (await getDb()).collection<WtmMessage>("messages");
const notesCol = async () => (await getDb()).collection<SupportNote>("supportnotes");
const paymentsCol = async () => (await getDb()).collection<Payment>("payments");

const CLIENT_DEFAULTS: Omit<WtmClientInput, "name" | "phone"> = {
  bridgeEmail: "",
  bridgeEmailPassword: "",
  destinationEmail: "",
  active: true,
  planType: "trial",
  planPrice: 0,
  billingStatus: "trial",
  nextBillingDate: null,
  contractEmail: "",
  tags: [],
  internalNotes: "",
  emailSignature: "",
  groupsEnabled: false,
  allowedGroups: [],
};

export async function listWtmClients(): Promise<WtmClient[]> {
  const col = await clientsCol();
  return col.find({}).toArray();
}

export async function getWtmClient(id: string): Promise<WtmClient | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await clientsCol();
  return col.findOne({ _id: new ObjectId(id) } as Filter<WtmClient>);
}

export async function createWtmClient(name: string, phone: string): Promise<WtmClient> {
  await ensureWtmIndexes();
  const now = new Date();
  const doc = { ...CLIENT_DEFAULTS, name, phone, createdAt: now, updatedAt: now } as WtmClient;
  const col = await clientsCol();
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateWtmClient(id: string, patch: Partial<WtmClientInput>): Promise<WtmClient | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await clientsCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) } as Filter<WtmClient>,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ?? null;
}

export async function deleteWtmClient(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await clientsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) } as Filter<WtmClient>);
  return result.deletedCount === 1;
}

export async function createWtmMessage(input: WtmMessageInput): Promise<WtmMessage> {
  await ensureWtmIndexes();
  const col = await messagesCol();
  const doc = { ...input, createdAt: input.createdAt ?? new Date() } as WtmMessage;
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/** Upsert by (tenantId, msgId) for inbound dedup — mirrors the legacy `findOneAndUpdate` upsert. */
export async function upsertInboundMessage(
  tenantId: string,
  msgId: string | null,
  fallbackKey: string,
  data: Omit<WtmMessageInput, "tenantId" | "msgId">
): Promise<void> {
  await ensureWtmIndexes();
  const col = await messagesCol();
  await col.updateOne(
    { tenantId, msgId: msgId || fallbackKey } as Filter<WtmMessage>,
    { $setOnInsert: { tenantId, ...data, msgId: msgId || null } },
    { upsert: true }
  );
}

export async function listMessagesByGroup(tenantId: string, groupJid: string, limit = 100): Promise<WtmMessage[]> {
  const col = await messagesCol();
  const docs = await col.find({ tenantId, groupJid } as Filter<WtmMessage>).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.reverse();
}

export async function listMessagesForEmailThread(
  tenantId: string,
  matcher: { phone: string } | { groupJid: string },
  since: Date
): Promise<WtmMessage[]> {
  const col = await messagesCol();
  const filter = { tenantId, createdAt: { $gte: since }, ...matcher } as Filter<WtmMessage>;
  return col.find(filter).sort({ createdAt: 1 }).toArray();
}

// --- Support notes ---

export async function listSupportNotes(tenantId: string): Promise<SupportNote[]> {
  const col = await notesCol();
  return col.find({ tenantId } as Filter<SupportNote>).sort({ createdAt: -1 }).toArray();
}

export async function createSupportNote(
  tenantId: string,
  content: string,
  priority: SupportNote["priority"],
  createdBy: string
): Promise<SupportNote> {
  const col = await notesCol();
  const now = new Date();
  const doc = {
    tenantId,
    content,
    priority,
    resolved: false,
    resolvedAt: null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  } as SupportNote;
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateSupportNote(
  tenantId: string,
  id: string,
  patch: { content?: string; priority?: SupportNote["priority"]; resolved?: boolean }
): Promise<SupportNote | null> {
  if (!ObjectId.isValid(id)) return null;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.content !== undefined) set.content = patch.content.trim();
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.resolved !== undefined) {
    set.resolved = patch.resolved;
    set.resolvedAt = patch.resolved ? new Date() : null;
  }
  const col = await notesCol();
  const result = await col.findOneAndUpdate({ _id: new ObjectId(id), tenantId } as Filter<SupportNote>, { $set: set }, { returnDocument: "after" });
  return result ?? null;
}

export async function deleteSupportNote(tenantId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await notesCol();
  const result = await col.deleteOne({ _id: new ObjectId(id), tenantId } as Filter<SupportNote>);
  return result.deletedCount === 1;
}

// --- Payments ---

export async function listPayments(tenantId: string): Promise<Payment[]> {
  const col = await paymentsCol();
  return col.find({ tenantId } as Filter<Payment>).sort({ paidAt: -1 }).toArray();
}

export async function createPayment(
  tenantId: string,
  amount: number,
  method: PaymentMethod,
  period: string,
  paidAt: Date,
  notes: string,
  createdBy: string
): Promise<Payment> {
  const col = await paymentsCol();
  const now = new Date();
  const doc = { tenantId, amount, method, period, paidAt, notes, createdBy, createdAt: now, updatedAt: now } as Payment;
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function deletePayment(tenantId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await paymentsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id), tenantId } as Filter<Payment>);
  return result.deletedCount === 1;
}

/** Messages for a conversation export ([TabAnalysis] / aiAnalysis.exportConversation). */
export async function exportConversationMessages(
  tenantId: string,
  type: string,
  groupId: string | undefined,
  phone: string | undefined,
  from: Date,
  to: Date
): Promise<WtmMessage[]> {
  const col = await messagesCol();
  const normalizedGroupId = groupId ? groupId.replace(/:\d+$/, "") : groupId;
  const filter =
    type === "group"
      ? ({ tenantId, createdAt: { $gte: from, $lte: to }, groupJid: normalizedGroupId } as Filter<WtmMessage>)
      : ({ tenantId, createdAt: { $gte: from, $lte: to }, phone, groupJid: null } as Filter<WtmMessage>);
  return col.find(filter).sort({ createdAt: 1 }).toArray();
}
