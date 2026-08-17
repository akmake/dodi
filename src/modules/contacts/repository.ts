/**
 * Contacts repositories — tenant-scoped, with race-safe upsert by WhatsApp id.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { Contact, ContactIdentity, CustomFieldDef } from "./models";

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export interface CreateContactDefaults {
  firstName?: string | null;
  phone?: string;
}

export class ContactRepository extends Repository<Contact> {
  constructor() {
    super("contacts");
  }

  findByWaId(tenantId: string, waId: string) {
    return this.findOne(tenantId, { waId } as Filter<Contact>);
  }

  findByPhone(tenantId: string, phone: string) {
    return this.findOne(tenantId, { phone } as Filter<Contact>);
  }

  /** Find or create a contact keyed by WhatsApp id. Race-safe via the unique index. */
  async getOrCreateByWaId(
    tenantId: string,
    waId: string,
    defaults: CreateContactDefaults = {}
  ): Promise<Contact> {
    const existing = await this.findByWaId(tenantId, waId);
    if (existing) return existing;

    try {
      return await this.create(tenantId, {
        firstName: defaults.firstName ?? null,
        lastName: null,
        phone: defaults.phone ?? `+${waId}`,
        waId,
        email: null,
        language: null,
        leadSource: null,
        firstChannel: "whatsapp",
        lastChannel: "whatsapp",
        status: "new",
        funnelStage: null,
        ownerId: null,
        teamId: null,
        tags: [],
        customFields: {},
        marketingOptIn: "unknown",
        optInSource: null,
        optInAt: null,
        lastActivityAt: null,
      });
    } catch (err) {
      if (isDuplicateKey(err)) {
        const c = await this.findByWaId(tenantId, waId);
        if (c) return c;
      }
      throw err;
    }
  }

  /**
   * Free-text + faceted search (§4.5). `query` matches name/phone/email; `tag`
   * and `status` narrow further. Newest activity first.
   */
  async search(
    tenantId: string,
    opts: { query?: string; tag?: string; status?: Contact["status"]; limit?: number } = {}
  ): Promise<Contact[]> {
    const filter: Record<string, unknown> = {};
    if (opts.tag) filter.tags = opts.tag;
    if (opts.status) filter.status = opts.status;
    if (opts.query) {
      const rx = { $regex: escapeRegex(opts.query), $options: "i" };
      filter.$or = [
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
        { waId: rx },
        { email: rx },
      ];
    }

    const col = await this.collection();
    return col
      .find(this.scoped(tenantId, filter as Filter<Contact>))
      .sort({ lastActivityAt: -1, createdAt: -1 })
      .limit(opts.limit ?? 100)
      .toArray() as Promise<Contact[]>;
  }
}

export class ContactIdentityRepository extends Repository<ContactIdentity> {
  constructor() {
    super("contact_identities");
  }

  findByValue(tenantId: string, type: ContactIdentity["type"], value: string) {
    return this.findOne(tenantId, { type, value } as Filter<ContactIdentity>);
  }
}

export class CustomFieldDefRepository extends Repository<CustomFieldDef> {
  constructor() {
    super("custom_field_defs");
  }

  findByKey(tenantId: string, key: string) {
    return this.findOne(tenantId, { key } as Filter<CustomFieldDef>);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let indexesReady: Promise<void> | null = null;

export function ensureContactIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("contacts").createIndex({ tenantId: 1, waId: 1 }, { unique: true }),
        db.collection("contacts").createIndex({ tenantId: 1, phone: 1 }),
        db.collection("contacts").createIndex({ tenantId: 1, lastActivityAt: -1 }),
        db.collection("contact_identities").createIndex(
          { tenantId: 1, type: 1, value: 1 },
          { unique: true }
        ),
        db.collection("custom_field_defs").createIndex(
          { tenantId: 1, key: 1 },
          { unique: true }
        ),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
