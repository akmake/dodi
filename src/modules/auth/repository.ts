/**
 * Auth repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { Credential, Session, SsoConfig } from "./models";

export class CredentialRepository extends Repository<Credential> {
  constructor() {
    super("credentials");
  }
  findByUser(tenantId: string, userId: string) {
    return this.findOne(tenantId, { userId } as Filter<Credential>);
  }
}

export class SsoConfigRepository extends Repository<SsoConfig> {
  constructor() {
    super("sso_configs");
  }
  findForTenant(tenantId: string) {
    return this.findOne(tenantId, {} as Filter<SsoConfig>);
  }
}

export class SessionRepository extends Repository<Session> {
  constructor() {
    super("sessions");
  }
  /**
   * Global lookup by token hash — the bearer token is the secret, and the tenant
   * is read off the matched document. The only place we query un-tenant-scoped,
   * and it's safe because tokenHash is a 256-bit unguessable key.
   */
  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const db = await getDb();
    return db
      .collection<Session>("sessions")
      .findOne({ tokenHash } as Filter<Session>) as Promise<Session | null>;
  }
}

let indexesReady: Promise<void> | null = null;
export function ensureAuthIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
        db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("credentials").createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
