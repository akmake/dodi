/**
 * Template repository — tenant-scoped catalog with name+language uniqueness.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { MessageTemplate } from "./models";

export class TemplateRepository extends Repository<MessageTemplate> {
  constructor() {
    super("message_templates");
  }

  findByNameLang(tenantId: string, name: string, language: string) {
    return this.findOne(tenantId, { name, language } as Filter<MessageTemplate>);
  }

  findApproved(tenantId: string) {
    return this.findMany(tenantId, { status: "APPROVED" } as Filter<MessageTemplate>);
  }

  /** Create or update a template by (name, language) — used by Meta sync. */
  async upsert(
    tenantId: string,
    name: string,
    language: string,
    data: Partial<MessageTemplate>
  ): Promise<MessageTemplate> {
    const existing = await this.findByNameLang(tenantId, name, language);
    if (existing) {
      return (await this.update(tenantId, existing.id, data)) ?? existing;
    }
    return this.create(tenantId, {
      metaTemplateId: data.metaTemplateId ?? null,
      name,
      language,
      category: data.category ?? "UTILITY",
      status: data.status ?? "PENDING",
      rejectionReason: data.rejectionReason ?? null,
      qualityScore: data.qualityScore ?? "UNKNOWN",
      components: data.components ?? [],
      variableCount: data.variableCount ?? 0,
    });
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureTemplateIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await db
        .collection("message_templates")
        .createIndex({ tenantId: 1, name: 1, language: 1 }, { unique: true });
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
