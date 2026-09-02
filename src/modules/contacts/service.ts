/**
 * Contacts service — [קטגוריה 4].
 *
 * The CRM layer over the raw WhatsApp data. Its key job in the pipeline is
 * `syncFromInbound`: every inbound message creates/updates the Contact and links
 * it to the Conversation, so the Inbox always has a customer card to show.
 */
import type { InboundSummary } from "@/modules/whatsapp/service";
import { ConversationRepository } from "@/modules/whatsapp/repository";
import type { Contact, ContactStatus } from "./models";
import { fireAutomationEvent } from "@/modules/triggers/events";
import { emitEvent } from "@/modules/integrations";
import {
  ContactRepository,
  ContactIdentityRepository,
  CustomFieldDefRepository,
  ensureContactIndexes,
} from "./repository";

const contacts = new ContactRepository();
const identities = new ContactIdentityRepository();
const customFields = new CustomFieldDefRepository();
const conversations = new ConversationRepository();

/**
 * Reconcile a contact from an inbound WhatsApp message and link it to the
 * conversation. Idempotent — safe to call for every inbound event.
 */
export async function syncFromInbound(summary: InboundSummary): Promise<Contact> {
  await ensureContactIndexes();

  const contact = await contacts.getOrCreateByWaId(summary.tenantId, summary.waId, {
    firstName: summary.profileName,
  });

  const patch: Partial<Contact> = {
    lastActivityAt: summary.sentAt,
    lastChannel: "whatsapp",
  };
  // Fill the name from the WhatsApp profile if we don't have one yet (§4.1 edge case).
  if (summary.profileName && !contact.firstName) patch.firstName = summary.profileName;
  // A "new" contact who is now messaging us is "active".
  if (contact.status === "new") patch.status = "active";
  // CRM-level consent is the source of truth; mirror the keyword change here (§2.4/§4.1).
  if (summary.optChange) {
    patch.marketingOptIn = summary.optChange;
    patch.optInSource = "keyword";
    patch.optInAt = summary.sentAt;
  }
  // Detect "new" and "meaningfully changed" BEFORE the update, so we don't fire a
  // contact_updated automation on every inbound message (only on real changes).
  const isNew = !contact.lastActivityAt;
  const changed = !!(patch.status || patch.marketingOptIn || patch.firstName);

  await contacts.update(summary.tenantId, contact.id, patch);

  // Link the conversation to this contact (the seam from [קטגוריה 2]). Idempotent.
  await conversations.update(summary.tenantId, summary.conversationId, {
    contactId: contact.id,
  });

  // Fire automation only when it's a new contact or a tracked field actually changed.
  if (isNew || changed) {
    await fireAutomationEvent(summary.tenantId, {
      type: isNew ? "contact_created" : "contact_updated",
      contactId: contact.id,
      conversationId: summary.conversationId,
      waId: summary.waId,
      payload: { source: "whatsapp_inbound", optChange: summary.optChange },
    });
    // External webhook fan-out (§22.2) — fire-and-forget, mirrors the internal event.
    void emitEvent(summary.tenantId, isNew ? "contact_created" : "contact_updated", {
      contact: { id: contact.id, wa_id: summary.waId, name: summary.profileName },
      conversation_id: summary.conversationId,
      source: "whatsapp_inbound",
    });
  }

  return { ...contact, ...patch };
}

export function getContact(tenantId: string, id: string) {
  return contacts.findById(tenantId, id);
}

export function getContactByWaId(tenantId: string, waId: string) {
  return contacts.findByWaId(tenantId, waId);
}

export function searchContacts(
  tenantId: string,
  opts: { query?: string; tag?: string; status?: ContactStatus; limit?: number } = {}
) {
  return contacts.search(tenantId, opts);
}

export async function updateContact(tenantId: string, id: string, patch: Partial<Contact>) {
  const updated = await contacts.update(tenantId, id, patch);
  if (updated) {
    await fireAutomationEvent(tenantId, {
      type: "contact_updated",
      contactId: updated.id,
      waId: updated.waId,
      payload: { patch },
    });
  }
  return updated;
}

export async function addTag(tenantId: string, id: string, tag: string): Promise<Contact | null> {
  const contact = await contacts.findById(tenantId, id);
  if (!contact) return null;
  if (contact.tags.includes(tag)) return contact;
  return contacts.update(tenantId, id, { tags: [...contact.tags, tag] });
}

export async function removeTag(tenantId: string, id: string, tag: string): Promise<Contact | null> {
  const contact = await contacts.findById(tenantId, id);
  if (!contact) return null;
  return contacts.update(tenantId, id, { tags: contact.tags.filter((t) => t !== tag) });
}

/** Block a contact (§4.4) — the send layer must refuse outbound to blocked contacts. */
export function blockContact(tenantId: string, id: string) {
  return contacts.update(tenantId, id, { status: "blocked" });
}

export async function setCustomField(
  tenantId: string,
  id: string,
  key: string,
  value: unknown
): Promise<Contact | null> {
  const contact = await contacts.findById(tenantId, id);
  if (!contact) return null;
  return contacts.update(tenantId, id, {
    customFields: { ...contact.customFields, [key]: value },
  });
}

// --- Custom field definitions (§4.2) ---

export function listCustomFieldDefs(tenantId: string) {
  return customFields.findMany(tenantId);
}

export { ensureContactIndexes };

// --- Operations: import/export/merge/GDPR ([קטגוריה 4]) --------------------

export async function exportContactsCsv(tenantId: string): Promise<string> {
  const rows = await contacts.findMany(tenantId);
  const header = ["id", "firstName", "lastName", "phone", "waId", "email", "status", "marketingOptIn", "tags"];
  return [
    header.join(","),
    ...rows.map((c) =>
      [
        c.id,
        c.firstName ?? "",
        c.lastName ?? "",
        c.phone,
        c.waId,
        c.email ?? "",
        c.status,
        c.marketingOptIn,
        c.tags.join("|"),
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\n");
}

export async function importContactsCsv(
  tenantId: string,
  csv: string
): Promise<{ created: number; updated: number; skipped: number }> {
  await ensureContactIndexes();
  const [head, ...lines] = csv.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseCsvLine(head ?? "");
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const line of lines) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    const waId = row.waId || row.phone?.replace(/\D/g, "");
    if (!waId) {
      skipped++;
      continue;
    }
    const existing = await contacts.findByWaId(tenantId, waId);
    const patch: Partial<Contact> = {
      firstName: row.firstName || null,
      lastName: row.lastName || null,
      phone: row.phone || `+${waId}`,
      email: row.email || null,
      tags: row.tags ? row.tags.split("|").filter(Boolean) : [],
    };
    if (existing) {
      await contacts.update(tenantId, existing.id, patch);
      updated++;
    } else {
      await contacts.getOrCreateByWaId(tenantId, waId, { firstName: patch.firstName, phone: patch.phone });
      const createdContact = await contacts.findByWaId(tenantId, waId);
      if (createdContact) await contacts.update(tenantId, createdContact.id, patch);
      created++;
    }
  }
  return { created, updated, skipped };
}

export async function mergeContacts(
  tenantId: string,
  primaryId: string,
  duplicateId: string
): Promise<Contact | null> {
  const [primary, duplicate] = await Promise.all([
    contacts.findById(tenantId, primaryId),
    contacts.findById(tenantId, duplicateId),
  ]);
  if (!primary || !duplicate) return null;
  const merged = await contacts.update(tenantId, primaryId, {
    firstName: primary.firstName ?? duplicate.firstName,
    lastName: primary.lastName ?? duplicate.lastName,
    email: primary.email ?? duplicate.email,
    tags: [...new Set([...primary.tags, ...duplicate.tags])],
    customFields: { ...duplicate.customFields, ...primary.customFields },
    marketingOptIn: primary.marketingOptIn !== "unknown" ? primary.marketingOptIn : duplicate.marketingOptIn,
  });
  const convs = await conversations.findMany(tenantId, { contactId: duplicateId } as never);
  for (const conv of convs) await conversations.update(tenantId, conv.id, { contactId: primaryId });
  await contacts.delete(tenantId, duplicateId);
  return merged;
}

export async function anonymizeContact(tenantId: string, id: string): Promise<Contact | null> {
  const contact = await contacts.findById(tenantId, id);
  if (!contact) return null;
  return contacts.update(tenantId, id, {
    firstName: "Deleted",
    lastName: "Contact",
    phone: `deleted-${id}`,
    waId: `deleted-${id}`,
    email: null,
    tags: [],
    customFields: {},
    marketingOptIn: "opted_out",
    optInSource: "gdpr",
    optInAt: new Date(),
    status: "blocked",
  });
}

export async function deleteContactGdpr(tenantId: string, id: string): Promise<boolean> {
  const ids = await identities.findMany(tenantId, { contactId: id } as never);
  for (const identity of ids) await identities.delete(tenantId, identity.id);
  const convs = await conversations.findMany(tenantId, { contactId: id } as never);
  for (const conv of convs) await conversations.update(tenantId, conv.id, { contactId: null, contactName: null });
  return contacts.delete(tenantId, id);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
