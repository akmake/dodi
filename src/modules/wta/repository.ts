/**
 * WTA data access — native Mongo driver over dedicated `wta_*` collections.
 * Mirrors WTM's repository shape (see `wtm/repository.ts`) but scoped to WTA's
 * own collections so the two services never share client data.
 */
import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/core/db/mongo";
import type {
  WtaClient,
  WtaClientInput,
  WtaRule,
  WtaRuleInput,
  WtaAction,
  WtaActionInput,
  WtaMessage,
  WtaMessageInput,
  WtaSupportNote,
  WtaPayment,
  PaymentMethod,
} from "./models";

let indexesReady: Promise<void> | null = null;

export function ensureWtaIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("wta_clients").createIndex({ phone: 1 }, { unique: true }),
        db.collection("wta_rules").createIndex({ clientId: 1, enabled: 1 }),
        db.collection("wta_actions").createIndex({ clientId: 1, createdAt: -1 }),
        db.collection("wta_actions").createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }),
        db.collection("wta_messages").createIndex({ clientId: 1, groupJid: 1, createdAt: 1 }),
        db.collection("wta_messages").createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

const clientsCol = async () => (await getDb()).collection<WtaClient>("wta_clients");
const rulesCol = async () => (await getDb()).collection<WtaRule>("wta_rules");
const actionsCol = async () => (await getDb()).collection<WtaAction>("wta_actions");
const messagesCol = async () => (await getDb()).collection<WtaMessage>("wta_messages");
const notesCol = async () => (await getDb()).collection<WtaSupportNote>("wta_supportnotes");
const paymentsCol = async () => (await getDb()).collection<WtaPayment>("wta_payments");

const CLIENT_DEFAULTS: Omit<WtaClientInput, "name" | "phone"> = {
  active: true,
  planType: "trial",
  planPrice: 0,
  billingStatus: "trial",
  nextBillingDate: null,
  contractEmail: "",
  tags: [],
  internalNotes: "",
  managedGroups: [],
  exemptAdmins: true,
  logMessages: false,
};

// ─── Clients ─────────────────────────────────────────────────────────────────

export async function listWtaClients(): Promise<WtaClient[]> {
  const col = await clientsCol();
  return col.find({}).toArray();
}

export async function getWtaClient(id: string): Promise<WtaClient | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await clientsCol();
  return col.findOne({ _id: new ObjectId(id) } as Filter<WtaClient>);
}

export async function createWtaClient(name: string, phone: string): Promise<WtaClient> {
  await ensureWtaIndexes();
  const now = new Date();
  const doc = { ...CLIENT_DEFAULTS, name, phone, createdAt: now, updatedAt: now } as WtaClient;
  const col = await clientsCol();
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateWtaClient(id: string, patch: Partial<WtaClientInput>): Promise<WtaClient | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await clientsCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) } as Filter<WtaClient>,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ?? null;
}

export async function deleteWtaClient(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await clientsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) } as Filter<WtaClient>);
  if (result.deletedCount === 1) {
    // best-effort cascade of the client's child docs
    const [rules, actions, messages, notes, payments] = await Promise.all([
      rulesCol(),
      actionsCol(),
      messagesCol(),
      notesCol(),
      paymentsCol(),
    ]);
    await Promise.all([
      rules.deleteMany({ clientId: id } as Filter<WtaRule>),
      actions.deleteMany({ clientId: id } as Filter<WtaAction>),
      messages.deleteMany({ clientId: id } as Filter<WtaMessage>),
      notes.deleteMany({ clientId: id } as Filter<WtaSupportNote>),
      payments.deleteMany({ clientId: id } as Filter<WtaPayment>),
    ]).catch(() => {});
    return true;
  }
  return false;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export async function listRules(clientId: string): Promise<WtaRule[]> {
  const col = await rulesCol();
  return col.find({ clientId } as Filter<WtaRule>).sort({ createdAt: 1 }).toArray();
}

export async function listEnabledRules(clientId: string): Promise<WtaRule[]> {
  const col = await rulesCol();
  return col.find({ clientId, enabled: true } as Filter<WtaRule>).toArray();
}

export async function createRule(input: WtaRuleInput): Promise<WtaRule> {
  await ensureWtaIndexes();
  const now = new Date();
  const col = await rulesCol();
  const doc = { ...input, createdAt: now, updatedAt: now } as WtaRule;
  const result = await col.insertOne(doc as WtaRule);
  return { ...doc, _id: result.insertedId } as WtaRule;
}

export async function updateRule(clientId: string, id: string, patch: Record<string, unknown>): Promise<WtaRule | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await rulesCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), clientId } as Filter<WtaRule>,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ?? null;
}

export async function deleteRule(clientId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await rulesCol();
  const result = await col.deleteOne({ _id: new ObjectId(id), clientId } as Filter<WtaRule>);
  return result.deletedCount === 1;
}

// ─── Actions (moderation log) ────────────────────────────────────────────────

export async function recordAction(input: WtaActionInput): Promise<void> {
  await ensureWtaIndexes();
  const col = await actionsCol();
  await col.insertOne({ ...input, createdAt: input.createdAt ?? new Date() } as WtaAction);
}

export async function listActions(clientId: string, limit = 200): Promise<WtaAction[]> {
  const col = await actionsCol();
  return col.find({ clientId } as Filter<WtaAction>).sort({ createdAt: -1 }).limit(limit).toArray();
}

/** Recent actions across all clients — powers the global /wta/logs view. */
export async function listAllActions(limit = 300): Promise<WtaAction[]> {
  const col = await actionsCol();
  return col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function countActionsByType(clientId: string, since: Date): Promise<Record<string, number>> {
  const col = await actionsCol();
  const rows = await col
    .aggregate<{ _id: string; count: number }>([
      { $match: { clientId, createdAt: { $gte: since } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

// ─── Message log ─────────────────────────────────────────────────────────────

export async function logMessage(input: WtaMessageInput): Promise<void> {
  const col = await messagesCol();
  await col.insertOne({ ...input, createdAt: input.createdAt ?? new Date() } as WtaMessage);
}

// ─── Support notes ───────────────────────────────────────────────────────────

export async function listSupportNotes(clientId: string): Promise<WtaSupportNote[]> {
  const col = await notesCol();
  return col.find({ clientId } as Filter<WtaSupportNote>).sort({ createdAt: -1 }).toArray();
}

export async function createSupportNote(
  clientId: string,
  content: string,
  priority: WtaSupportNote["priority"],
  createdBy: string
): Promise<WtaSupportNote> {
  const col = await notesCol();
  const now = new Date();
  const doc = { clientId, content, priority, resolved: false, resolvedAt: null, createdBy, createdAt: now, updatedAt: now } as WtaSupportNote;
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateSupportNote(
  clientId: string,
  id: string,
  patch: { content?: string; priority?: WtaSupportNote["priority"]; resolved?: boolean }
): Promise<WtaSupportNote | null> {
  if (!ObjectId.isValid(id)) return null;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.content !== undefined) set.content = patch.content.trim();
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.resolved !== undefined) {
    set.resolved = patch.resolved;
    set.resolvedAt = patch.resolved ? new Date() : null;
  }
  const col = await notesCol();
  const result = await col.findOneAndUpdate({ _id: new ObjectId(id), clientId } as Filter<WtaSupportNote>, { $set: set }, { returnDocument: "after" });
  return result ?? null;
}

export async function deleteSupportNote(clientId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await notesCol();
  const result = await col.deleteOne({ _id: new ObjectId(id), clientId } as Filter<WtaSupportNote>);
  return result.deletedCount === 1;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function listPayments(clientId: string): Promise<WtaPayment[]> {
  const col = await paymentsCol();
  return col.find({ clientId } as Filter<WtaPayment>).sort({ paidAt: -1 }).toArray();
}

export async function createPayment(
  clientId: string,
  amount: number,
  method: PaymentMethod,
  period: string,
  paidAt: Date,
  notes: string,
  createdBy: string
): Promise<WtaPayment> {
  const col = await paymentsCol();
  const now = new Date();
  const doc = { clientId, amount, method, period, paidAt, notes, createdBy, createdAt: now, updatedAt: now } as WtaPayment;
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function deletePayment(clientId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await paymentsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id), clientId } as Filter<WtaPayment>);
  return result.deletedCount === 1;
}
