/**
 * Public API keys — [קטגוריה 22] §22.3.
 *
 * Each tenant mints API keys with a scope set ([קטגוריה 25]). The raw token is
 * shown ONCE on creation; only its sha256 hash is persisted. `authenticate()`
 * resolves a presented token to its tenant + scopes — the one lookup that must
 * cross tenants, so it queries the collection directly (the Repository is
 * tenant-scoped and can't help here).
 */
import { createHash, randomBytes } from "crypto";
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { Scope } from "@/modules/admin/rbac";
import type { ApiKey } from "./models";

class ApiKeyRepository extends Repository<ApiKey> {
  constructor() {
    super("api_keys");
  }
}

const apiKeys = new ApiKeyRepository();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateApiKeyInput {
  name: string;
  scopes: Scope[];
  createdBy?: string | null;
}

export async function createApiKey(
  tenantId: string,
  input: CreateApiKeyInput
): Promise<{ apiKey: ApiKey; token: string }> {
  const token = `bw_${randomBytes(24).toString("hex")}`;
  const apiKey = await apiKeys.create(tenantId, {
    name: input.name,
    prefix: token.slice(0, 11),
    keyHash: hashToken(token),
    scopes: input.scopes,
    active: true,
    lastUsedAt: null,
    createdBy: input.createdBy ?? null,
  });
  return { apiKey, token };
}

export function listApiKeys(tenantId: string) {
  return apiKeys.findMany(tenantId);
}

export function revokeApiKey(tenantId: string, id: string) {
  return apiKeys.update(tenantId, id, { active: false });
}

export interface ApiKeyContext {
  tenantId: string;
  keyId: string;
  scopes: Scope[];
}

/**
 * Resolve a presented token to its tenant + scopes, or null if unknown/revoked.
 * Cross-tenant by necessity — we don't know the tenant until we find the key.
 */
export async function authenticate(token: string | null): Promise<ApiKeyContext | null> {
  if (!token) return null;
  const db = await getDb();
  const doc = await db
    .collection<ApiKey>("api_keys")
    .findOne({ keyHash: hashToken(token), active: true } as Filter<ApiKey>);
  if (!doc) return null;
  // Best-effort usage stamp (don't block the request on it).
  void db
    .collection<ApiKey>("api_keys")
    .updateOne({ id: doc.id } as Filter<ApiKey>, { $set: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { tenantId: doc.tenantId, keyId: doc.id, scopes: doc.scopes };
}
