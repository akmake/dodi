/**
 * Admin / Security module — public surface ([קטגוריה 25]).
 */
export * from "./models";
export { SCOPES, SYSTEM_ROLE_SCOPES, roleHasScope, scopesForSystemRole, type Scope } from "./rbac";
export {
  UserRepository,
  RoleRepository,
  TeamRepository,
  AuditRepository,
  ensureAdminIndexes,
} from "./repository";
export {
  ensureSystemRoles,
  inviteUser,
  getUserScopes,
  getAccessProfile,
  createAccessUser,
  updateUserAccess,
  getUser,
  findUserByEmail,
  deleteUser,
  can,
  writeAudit,
  listAuditLog,
  listUsers,
  listTeams,
  type AuditInput,
  type AccessProfile,
} from "./service";
export { serviceScopes } from "./rbac";
