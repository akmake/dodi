/**
 * Native WhatsApp Flows — [קטגוריה 9].
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";
import type { Filter } from "mongodb";
import { sendWhatsAppFlow } from "@/modules/whatsapp";

export type WhatsAppFlowStatus = "draft" | "published" | "archived";

export interface WhatsAppFlow extends BaseEntity {
  name: string;
  metaFlowId: string;
  status: WhatsAppFlowStatus;
  language: string;
  endpointKey: string;
  flowJson: Record<string, unknown>;
  dataExchangeResponse: Record<string, unknown> | null;
}

export interface WhatsAppFlowSubmission extends BaseEntity {
  flowId: string | null;
  metaFlowId: string | null;
  waId: string | null;
  flowToken: string | null;
  screen: string | null;
  data: Record<string, unknown>;
  raw: unknown;
}

class FlowCatalogRepository extends Repository<WhatsAppFlow> {
  constructor() {
    super("wa_native_flows");
  }
  findByEndpointKey(tenantId: string, endpointKey: string) {
    return this.findOne(tenantId, { endpointKey } as Filter<WhatsAppFlow>);
  }
  findByMetaFlowId(tenantId: string, metaFlowId: string) {
    return this.findOne(tenantId, { metaFlowId } as Filter<WhatsAppFlow>);
  }
}

class FlowSubmissionRepository extends Repository<WhatsAppFlowSubmission> {
  constructor() {
    super("wa_flow_submissions");
  }
}

const flows = new FlowCatalogRepository();
const submissions = new FlowSubmissionRepository();

export interface SaveWhatsAppFlowInput {
  name: string;
  metaFlowId: string;
  language?: string;
  endpointKey: string;
  flowJson?: Record<string, unknown>;
  dataExchangeResponse?: Record<string, unknown> | null;
  status?: WhatsAppFlowStatus;
}

export async function saveWhatsAppFlow(tenantId: string, input: SaveWhatsAppFlowInput): Promise<WhatsAppFlow> {
  await ensureWhatsAppFlowIndexes();
  const existing = await flows.findByMetaFlowId(tenantId, input.metaFlowId);
  const data = {
    name: input.name,
    metaFlowId: input.metaFlowId,
    status: input.status ?? "draft",
    language: input.language ?? "he",
    endpointKey: input.endpointKey,
    flowJson: input.flowJson ?? {},
    dataExchangeResponse: input.dataExchangeResponse ?? null,
  };
  return existing ? (await flows.update(tenantId, existing.id, data)) ?? existing : flows.create(tenantId, data);
}

export function listWhatsAppFlows(tenantId: string) {
  return flows.findMany(tenantId);
}

export async function sendNativeFlow(
  tenantId: string,
  flowId: string,
  to: string,
  input: { body: string; cta: string; screen?: string; data?: Record<string, unknown> }
) {
  const flow = await flows.findById(tenantId, flowId);
  if (!flow) throw new Error("flow not found");
  if (flow.status !== "published") throw new Error("flow is not published");
  return sendWhatsAppFlow(tenantId, to, {
    flowId: flow.metaFlowId,
    flowToken: `${flow.id}:${Date.now()}`,
    cta: input.cta,
    body: input.body,
    screen: input.screen,
    data: input.data,
  }, { sender: "agent" });
}

export async function handleDataExchange(
  tenantId: string,
  endpointKey: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Production Meta Flows send an encrypted envelope (encrypted_flow_data +
  // encrypted_aes_key + initial_vector) that must be decrypted with the tenant's
  // RSA private key and the reply re-encrypted (AES-GCM). That needs the business
  // private key and isn't implemented yet — reject encrypted payloads explicitly
  // rather than silently returning an unusable plaintext reply. Plaintext/test
  // payloads (Flow Builder preview) still work below. [LIMITATION — see §9]
  if (payload.encrypted_flow_data || payload.encrypted_aes_key) {
    return { error: "encrypted_data_exchange_not_supported" };
  }

  const flow = await flows.findByEndpointKey(tenantId, endpointKey);
  if (!flow) return { error: "flow_not_found" };
  await submissions.create(tenantId, {
    flowId: flow.id,
    metaFlowId: flow.metaFlowId,
    waId: stringOrNull(payload.wa_id ?? payload.waId),
    flowToken: stringOrNull(payload.flow_token ?? payload.flowToken),
    screen: stringOrNull(payload.screen),
    data: isRecord(payload.data) ? payload.data : {},
    raw: payload,
  });
  return flow.dataExchangeResponse ?? { version: "3.0", data: {} };
}

export async function ensureWhatsAppFlowIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("wa_native_flows").createIndex({ tenantId: 1, metaFlowId: 1 }, { unique: true }),
    db.collection("wa_native_flows").createIndex({ tenantId: 1, endpointKey: 1 }, { unique: true }),
    db.collection("wa_flow_submissions").createIndex({ tenantId: 1, flowId: 1, createdAt: -1 }),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
