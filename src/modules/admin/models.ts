/**
 * Admin / Security models — [קטגוריה 25].
 *
 * Users, roles (RBAC), teams and an append-only audit log. Tenancy itself is
 * already structural (every entity carries tenantId via BaseEntity + Repository).
 * Collections: `users`, `roles`, `teams`, `audit_log`.
 */
import type { BaseEntity } from "@/core/types";
import type { Scope } from "./rbac";

export type SystemRole = "owner" | "admin" | "manager" | "agent" | "analyst" | "read_only";

export interface Role extends BaseEntity {
  name: string;
  scopes: Scope[];
  isSystem: boolean;
}

export type UserStatus = "invited" | "active" | "disabled";

/** The unified products a user can be granted access to. */
export type ServiceId = "wtm" | "btb" | "wbr" | "wta" | "wre";

export interface User extends BaseEntity {
  email: string;
  name: string | null;
  roleId: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  /**
   * Which product areas this user may enter. Admins (a role carrying
   * `users.manage`) implicitly get everything and ignore this field; for a
   * plain service user this is the source of truth, and `getUserScopes` derives
   * their effective RBAC scopes from it.
   */
  allowedServices?: ServiceId[];
  /**
   * BTB resource scoping. When present and non-empty, the user is a BTB
   * *customer* limited to exactly these `btbaccounts` _ids (the "10 numbers"
   * case) and gets `btb.view_own` rather than `btb.manage`. Empty/absent with
   * btb allowed = full internal BTB access.
   */
  btbAccountIds?: string[];
}

export interface Team extends BaseEntity {
  name: string;
  memberIds: string[];
}

/** Immutable record of a sensitive action (§25.4). */
export interface AuditEntry extends BaseEntity {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  occurredAt: Date;
}
