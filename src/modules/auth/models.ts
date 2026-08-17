/**
 * Auth models — [קטגוריה 25] §25.3.
 *
 * Password credentials (scrypt) and bearer sessions, layered on top of the admin
 * User/Role model. Collections: `credentials`, `sessions`.
 */
import type { BaseEntity } from "@/core/types";

export interface Credential extends BaseEntity {
  userId: string;
  /** scrypt hash, stored as `${salt}:${derivedKeyHex}`. */
  passwordHash: string;
  /** base32 TOTP secret (2FA). Present once enrollment starts. */
  totpSecret?: string | null;
  /** True once the user has confirmed a code — login then requires 2FA. */
  totpEnabled?: boolean;
}

/** Per-tenant SSO (OIDC) configuration seam (§25.3 / SSO). */
export interface SsoConfig extends BaseEntity {
  provider: "oidc";
  issuer: string;
  clientId: string;
  /** Encrypted at rest via core/crypto. */
  clientSecretEncrypted: string;
  /** Allow auto-provisioning a user on first SSO login. */
  autoProvision: boolean;
  /** Role assigned to auto-provisioned users. */
  defaultRole: string;
  enabled: boolean;
}

export interface Session extends BaseEntity {
  userId: string;
  /** sha256 of the opaque bearer token (the token itself is never stored). */
  tokenHash: string;
  expiresAt: Date;
}
