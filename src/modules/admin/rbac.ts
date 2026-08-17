/**
 * RBAC scopes and the system-role → scopes mapping ([קטגוריה 25] §25.2).
 *
 * The server is the source of truth: every protected action checks a scope via
 * `roleHasScope`. The UI may also hide controls, but enforcement is here.
 */
// Type-only (erased at compile time), so the models.ts <-> rbac.ts pair is not a runtime cycle.
import type { ServiceId } from "./models";

export const SCOPES = [
  "inbox.access",
  "contacts.view",
  "contacts.manage",
  "pii.view",
  "templates.manage",
  "campaigns.send",
  "bot.edit", // flows, AI, knowledge
  "analytics.view",
  "users.manage",
  "data.export",
  "api.access",
  "settings.manage",
  // WTM (WhatsApp↔email bridge) + BTB (status marketing) — [איחוד Whatsapp↔bootWhat].
  "wtm.manage",
  "btb.manage",
  /** Restricted BTB customer login — mirrors the legacy `role:'client'` (own account only). */
  "btb.view_own",
  // WTA (WhatsApp group moderation for admins) — same QR engine, group-governance logic.
  "wta.manage",
  // WRE (WhatsApp real-estate listing capture) — same QR engine, extract+geocode logic.
  "wre.manage",
] as const;

export type Scope = (typeof SCOPES)[number];

const ALL: Scope[] = [...SCOPES];

export const SYSTEM_ROLE_SCOPES: Record<string, Scope[]> = {
  owner: ALL,
  admin: ALL,
  manager: [
    "inbox.access",
    "contacts.view",
    "contacts.manage",
    "pii.view",
    "templates.manage",
    "campaigns.send",
    "bot.edit",
    "analytics.view",
    "wtm.manage",
    "btb.manage",
    "wta.manage",
    "wre.manage",
  ],
  agent: ["inbox.access", "contacts.view", "contacts.manage"],
  analyst: ["analytics.view", "contacts.view"],
  read_only: ["inbox.access", "contacts.view", "analytics.view"],
  /** External BTB customer — sees/manages only the one BtbAccount linked to them (row-level, enforced by the route handler, not this scope). */
  btb_client: ["btb.view_own"],
  /**
   * Plain service user — has NO static scopes on purpose. Its effective scopes
   * are derived per-user from `User.allowedServices` in `getUserScopes`
   * (see SERVICE_SCOPES below). This role only exists so a service user has a
   * valid roleId that does NOT carry `users.manage` (i.e. is not an admin).
   */
  service_user: [],
};

// ─── Service → scopes ([איחוד] per-user service access) ─────────────────────
// Maps a granted product area to the RBAC scopes it implies. `getUserScopes`
// folds these for non-admin users based on their `allowedServices`.

/** WBR working scope set for a service user (no users.manage — that's admin-only). */
const WBR_SERVICE_SCOPES: Scope[] = [
  "inbox.access",
  "contacts.view",
  "contacts.manage",
  "pii.view",
  "templates.manage",
  "campaigns.send",
  "bot.edit",
  "analytics.view",
  "settings.manage",
];

/**
 * Effective scopes for a service (BTB depends on whether the user is restricted
 * to specific accounts: restricted → customer `btb.view_own`, else internal
 * `btb.manage`).
 */
export function serviceScopes(service: ServiceId, btbRestricted: boolean): Scope[] {
  switch (service) {
    case "wtm":
      return ["wtm.manage"];
    case "btb":
      return btbRestricted ? ["btb.view_own"] : ["btb.manage"];
    case "wta":
      return ["wta.manage"];
    case "wre":
      return ["wre.manage"];
    case "wbr":
      return WBR_SERVICE_SCOPES;
    default:
      return [];
  }
}

export function scopesForSystemRole(role: string): Scope[] {
  return SYSTEM_ROLE_SCOPES[role] ?? [];
}

export function roleHasScope(scopes: Scope[], required: Scope): boolean {
  return scopes.includes(required);
}
