/**
 * Admin / Security service — [קטגוריה 25].
 *
 * Covers the data model + enforcement seam: system roles, user invites, RBAC
 * checks and the audit log. Authentication itself (password/session/2FA/SSO,
 * §25.3) is deferred — `getUserScopes`/`can` are the seam an auth layer plugs
 * into once a session resolves a userId.
 */
import {
  SYSTEM_ROLE_SCOPES,
  roleHasScope,
  scopesForSystemRole,
  serviceScopes,
  type Scope,
} from "./rbac";
import type { AuditEntry, Role, ServiceId, User } from "./models";
import {
  AuditRepository,
  RoleRepository,
  TeamRepository,
  UserRepository,
  ensureAdminIndexes,
} from "./repository";

const users = new UserRepository();
const roles = new RoleRepository();
const teams = new TeamRepository();
const audit = new AuditRepository();

/**
 * Create the built-in roles for a tenant if missing. Idempotent.
 *
 * Also keeps existing system roles' `scopes` in sync with `SYSTEM_ROLE_SCOPES`
 * (code is the source of truth for `isSystem: true` roles) — otherwise adding
 * a new scope to `rbac.ts` (e.g. `wtm.manage`/`btb.manage` for the Whatsapp↔
 * bootWhat unification) would silently 403 every account whose role document
 * was already persisted before that change, since role docs are only ever
 * created once.
 */
export async function ensureSystemRoles(tenantId: string): Promise<Role[]> {
  await ensureAdminIndexes();
  const result: Role[] = [];
  for (const name of Object.keys(SYSTEM_ROLE_SCOPES)) {
    const existing = await roles.findByName(tenantId, name);
    if (existing) {
      const expected = scopesForSystemRole(name);
      const inSync = existing.isSystem && expected.length === existing.scopes.length && expected.every((s) => existing.scopes.includes(s));
      if (existing.isSystem && !inSync) {
        const updated = await roles.update(tenantId, existing.id, { scopes: expected });
        result.push(updated ?? existing);
      } else {
        result.push(existing);
      }
      continue;
    }
    try {
      result.push(
        await roles.create(tenantId, {
          name,
          scopes: scopesForSystemRole(name),
          isSystem: true,
        })
      );
    } catch {
      const again = await roles.findByName(tenantId, name);
      if (again) result.push(again);
    }
  }
  return result;
}

export async function inviteUser(
  tenantId: string,
  email: string,
  roleName: string,
  name?: string
): Promise<User> {
  await ensureSystemRoles(tenantId);
  const role = await roles.findByName(tenantId, roleName);
  if (!role) throw new Error(`role not found: ${roleName}`);

  const existing = await users.findByEmail(tenantId, email);
  if (existing) return existing;

  return users.create(tenantId, {
    email: email.toLowerCase(),
    name: name ?? null,
    roleId: role.id,
    status: "invited",
    lastLoginAt: null,
  });
}

/** Union the scopes implied by a user's `allowedServices` (source of truth for service users). */
function scopesForAllowedServices(services: ServiceId[], btbRestricted: boolean): Scope[] {
  const set = new Set<Scope>();
  for (const s of services) for (const sc of serviceScopes(s, btbRestricted)) set.add(sc);
  return [...set];
}

/**
 * Resolve the effective scopes for a user.
 *
 * Admins (any role carrying `users.manage`) get their full static role scopes.
 * Everyone else is a *service user*: their scopes are derived per-user from
 * `allowedServices` (+ BTB account restriction) — the role itself is just a
 * non-admin placeholder. This is the seam that makes per-user service access
 * enforce automatically through `authorize(req, scope)`.
 */
export async function getUserScopes(tenantId: string, userId: string): Promise<Scope[]> {
  const user = await users.findById(tenantId, userId);
  if (!user || user.status === "disabled") return [];
  const role = await roles.findById(tenantId, user.roleId);
  const roleScopes = role?.scopes ?? [];
  if (roleScopes.includes("users.manage")) return roleScopes; // admin
  return scopesForAllowedServices(user.allowedServices ?? [], !!user.btbAccountIds?.length);
}

export interface AccessProfile {
  userId: string;
  isAdmin: boolean;
  allowedServices: ServiceId[];
  btbAccountIds: string[];
  scopes: Scope[];
}

/** Everything the UI / guards need about a user's access in one shot. */
export async function getAccessProfile(tenantId: string, userId: string): Promise<AccessProfile | null> {
  const user = await users.findById(tenantId, userId);
  if (!user || user.status === "disabled") return null;
  const scopes = await getUserScopes(tenantId, userId);
  const isAdmin = scopes.includes("users.manage");
  return {
    userId,
    isAdmin,
    // Admins implicitly have every area.
    allowedServices: isAdmin ? ["wtm", "btb", "wbr", "wta", "wre"] : user.allowedServices ?? [],
    btbAccountIds: user.btbAccountIds ?? [],
    scopes,
  };
}

/**
 * Create an active user with an explicit access profile (used by invite accept).
 * Non-admin users land on the `service_user` role; admins on `admin`.
 */
export async function createAccessUser(
  tenantId: string,
  input: { email: string; name?: string | null; isAdmin: boolean; allowedServices: ServiceId[]; btbAccountIds?: string[] }
): Promise<User> {
  await ensureSystemRoles(tenantId);
  const roleName = input.isAdmin ? "admin" : "service_user";
  const role = await roles.findByName(tenantId, roleName);
  if (!role) throw new Error(`role not found: ${roleName}`);
  return users.create(tenantId, {
    email: input.email.toLowerCase(),
    name: input.name ?? null,
    roleId: role.id,
    status: "active",
    lastLoginAt: null,
    allowedServices: input.allowedServices,
    btbAccountIds: input.btbAccountIds?.length ? input.btbAccountIds : undefined,
  });
}

/** Update a user's access (services / btb accounts / status). Admin-managed. */
export async function updateUserAccess(
  tenantId: string,
  userId: string,
  patch: { allowedServices?: ServiceId[]; btbAccountIds?: string[]; status?: User["status"] }
): Promise<User | null> {
  const clean: Partial<User> = {};
  if (patch.allowedServices !== undefined) clean.allowedServices = patch.allowedServices;
  if (patch.btbAccountIds !== undefined) clean.btbAccountIds = patch.btbAccountIds.length ? patch.btbAccountIds : [];
  if (patch.status !== undefined) clean.status = patch.status;
  return users.update(tenantId, userId, clean);
}

export function getUser(tenantId: string, userId: string) {
  return users.findById(tenantId, userId);
}

export function findUserByEmail(tenantId: string, email: string) {
  return users.findByEmail(tenantId, email.toLowerCase());
}

export function deleteUser(tenantId: string, userId: string) {
  return users.delete(tenantId, userId);
}

export async function can(tenantId: string, userId: string, scope: Scope): Promise<boolean> {
  const scopes = await getUserScopes(tenantId, userId);
  return roleHasScope(scopes, scope);
}

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function writeAudit(tenantId: string, input: AuditInput): Promise<AuditEntry> {
  await ensureAdminIndexes();
  return audit.create(tenantId, {
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
    occurredAt: new Date(),
  });
}

export function listAuditLog(tenantId: string) {
  return audit.findMany(tenantId);
}

export function listUsers(tenantId: string) {
  return users.findMany(tenantId);
}

export function listTeams(tenantId: string) {
  return teams.findMany(tenantId);
}

export { ensureAdminIndexes };
