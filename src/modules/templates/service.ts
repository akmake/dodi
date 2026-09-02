/**
 * Templates service — [קטגוריה 19].
 *
 * Owns the template lifecycle: sync from Meta, react to status webhooks, and
 * send template messages (the out-of-window path, §2.4/§19.3).
 */
import { config } from "@/core/config";
import type { QualityRating } from "@/modules/whatsapp/models";
import { sendTemplate as sendWhatsAppTemplate } from "@/modules/whatsapp/service";
import type { WhatsAppMessage } from "@/modules/whatsapp/models";
import type {
  MessageTemplate,
  TemplateCategory,
  TemplateComponent,
  TemplateRevision,
  TemplateStatus,
} from "./models";
import { TemplateRepository, ensureTemplateIndexes } from "./repository";

const templates = new TemplateRepository();

function graphBase() {
  return `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${config.whatsapp.token}`,
    "Content-Type": "application/json",
  };
}

/** Count distinct {{n}} variables across BODY components. */
export function countVariables(components: TemplateComponent[]): number {
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const nums = [...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Pull the WABA's templates from Meta and reconcile the local catalog (§19.1).
 * Requires WHATSAPP_WABA_ID. No-op-with-error if not configured.
 */
export async function syncFromMeta(tenantId: string): Promise<{ synced: number }> {
  await ensureTemplateIndexes();
  const wabaId = config.whatsapp.wabaId;
  if (!wabaId) throw new Error("WHATSAPP_WABA_ID is not set — cannot sync templates.");

  const res = await fetch(
    `${graphBase()}/${wabaId}/message_templates?limit=200`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Meta template sync failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: MetaTemplate[] };

  let synced = 0;
  for (const t of json.data ?? []) {
    const components = (t.components ?? []) as TemplateComponent[];
    await templates.upsert(tenantId, t.name, t.language, {
      metaTemplateId: t.id ?? null,
      category: (t.category as TemplateCategory) ?? "UTILITY",
      status: (t.status as TemplateStatus) ?? "PENDING",
      qualityScore: (t.quality_score?.score?.toUpperCase() as QualityRating) ?? "UNKNOWN",
      components,
      variableCount: countVariables(components),
    });
    synced++;
  }
  return { synced };
}

/**
 * Apply a `message_template_status_update` webhook (§19.2/§19.4): flip local
 * status / quality / category.
 */
export async function applyStatusUpdate(
  tenantId: string,
  update: TemplateStatusUpdate
): Promise<void> {
  await ensureTemplateIndexes();
  const existing = update.message_template_name
    ? await templates.findByNameLang(
        tenantId,
        update.message_template_name,
        update.message_template_language ?? "he"
      )
    : null;
  if (!existing) return;

  const patch: Partial<MessageTemplate> = {};
  if (update.event) patch.status = mapEvent(update.event);
  if (update.reason) patch.rejectionReason = update.reason;
  await templates.update(tenantId, existing.id, patch);
}

function mapEvent(event: string): TemplateStatus {
  switch (event.toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "PAUSED":
      return "PAUSED";
    case "DISABLED":
      return "DISABLED";
    default:
      return "PENDING";
  }
}

/**
 * Send an approved template to a customer, mapping ordered `variables` to the
 * BODY {{n}} parameters (§19.3). Allowed outside the 24h window.
 */
export async function sendTemplateMessage(
  tenantId: string,
  to: string,
  name: string,
  language: string,
  variables: string[] = []
): Promise<WhatsAppMessage> {
  const template = await templates.findByNameLang(tenantId, name, language);
  if (!template) throw new Error(`template not found: ${name}/${language}`);
  if (template.status !== "APPROVED") {
    throw new Error(`template ${name} is ${template.status}, not APPROVED`);
  }

  const components =
    variables.length > 0
      ? [{ type: "body", parameters: variables.map((text) => ({ type: "text", text })) }]
      : undefined;

  return sendWhatsAppTemplate(tenantId, to, name, language, components);
}

// ─── Authoring: create / edit / submit / delete (§19.2) ───────────────────────

export interface TemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
}

function revision(
  t: Pick<MessageTemplate, "category" | "components" | "status"> & { history?: TemplateRevision[] },
  action: TemplateRevision["action"],
  note?: string | null
): TemplateRevision {
  return {
    revision: (t.history?.length ?? 0) + 1,
    category: t.category,
    components: t.components,
    action,
    status: t.status,
    at: new Date(),
    note: note ?? null,
  };
}

/** Create a local draft template (not yet on Meta). status=PENDING until submitted. */
export async function createTemplate(tenantId: string, input: TemplateInput): Promise<MessageTemplate> {
  await ensureTemplateIndexes();
  const name = input.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!name) throw new Error("שם התבנית חובה (snake_case)");
  const existing = await templates.findByNameLang(tenantId, name, input.language);
  if (existing) throw new Error(`כבר קיימת תבנית "${name}" בשפה ${input.language}`);
  const base = {
    metaTemplateId: null,
    name,
    language: input.language,
    category: input.category,
    status: "PENDING" as TemplateStatus,
    rejectionReason: null,
    qualityScore: "UNKNOWN" as QualityRating,
    components: input.components,
    variableCount: countVariables(input.components),
  };
  return templates.create(tenantId, { ...base, history: [revision(base, "created")] });
}

/** Edit a local draft (or rejected) template's content; records a new revision. */
export async function updateTemplate(
  tenantId: string,
  id: string,
  input: Partial<TemplateInput>
): Promise<MessageTemplate | null> {
  const t = await templates.findById(tenantId, id);
  if (!t) return null;
  const components = input.components ?? t.components;
  const category = input.category ?? t.category;
  const patch: Partial<MessageTemplate> = {
    category,
    components,
    variableCount: countVariables(components),
  };
  const next = { category, components, status: t.status, history: t.history };
  patch.history = [...(t.history ?? []), revision(next, "edited")];
  return templates.update(tenantId, id, patch);
}

/**
 * Submit a local template to Meta for approval (§19.2). POSTs to the WABA
 * message_templates endpoint, stores the returned id, and records the revision.
 * Requires WHATSAPP_WABA_ID; throws a clear error when not configured.
 */
export async function submitToMeta(tenantId: string, id: string): Promise<MessageTemplate | null> {
  const t = await templates.findById(tenantId, id);
  if (!t) return null;
  const wabaId = config.whatsapp.wabaId;
  if (!wabaId) throw new Error("WHATSAPP_WABA_ID is not set — cannot submit templates.");

  const res = await fetch(`${graphBase()}/${wabaId}/message_templates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: t.name,
      language: t.language,
      category: t.category,
      components: t.components,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Meta rejected the submission (HTTP ${res.status})`);

  const status = (data.status?.toUpperCase() as TemplateStatus) ?? "PENDING";
  const next = { category: t.category, components: t.components, status, history: t.history };
  return templates.update(tenantId, id, {
    metaTemplateId: data.id ?? t.metaTemplateId,
    status,
    rejectionReason: null,
    history: [...(t.history ?? []), revision(next, "submitted")],
  });
}

export function deleteTemplate(tenantId: string, id: string): Promise<boolean> {
  return templates.delete(tenantId, id);
}

export function getTemplate(tenantId: string, id: string): Promise<MessageTemplate | null> {
  return templates.findById(tenantId, id);
}

export function listTemplates(tenantId: string) {
  return templates.findMany(tenantId);
}

export function getApprovedTemplates(tenantId: string) {
  return templates.findApproved(tenantId);
}

export { ensureTemplateIndexes };

// --- Meta payload shapes ---

interface MetaTemplate {
  id?: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  quality_score?: { score?: string };
  components?: unknown[];
}

export interface TemplateStatusUpdate {
  message_template_id?: string;
  message_template_name?: string;
  message_template_language?: string;
  event?: string;
  reason?: string;
}
