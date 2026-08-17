/**
 * Admin repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { AuditEntry, Role, Team, User } from "./models";

export class UserRepository extends Repository<User> {
  constructor() {
    super("users");
  }
  findByEmail(tenantId: string, email: string) {
    return this.findOne(tenantId, { email: email.toLowerCase() } as Filter<User>);
  }
}

export class RoleRepository extends Repository<Role> {
  constructor() {
    super("roles");
  }
  findByName(tenantId: string, name: string) {
    return this.findOne(tenantId, { name } as Filter<Role>);
  }
}

export class TeamRepository extends Repository<Team> {
  constructor() {
    super("teams");
  }
}

/** Append-only — exposes create + reads, never update/delete (§25.4). */
export class AuditRepository extends Repository<AuditEntry> {
  constructor() {
    super("audit_log");
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureAdminIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("users").createIndex({ tenantId: 1, email: 1 }, { unique: true }),
        db.collection("roles").createIndex({ tenantId: 1, name: 1 }, { unique: true }),
        db.collection("audit_log").createIndex({ tenantId: 1, occurredAt: -1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
