/**
 * Auth service — [קטגוריה 25] §25.3.
 *
 * Password (scrypt) login that issues an opaque bearer session, and
 * `verifySession` which the route guard ([core/http]) uses to resolve
 * tenant + user. Sessions are tenant-scoped rows; the token hash is the lookup
 * key. Until org onboarding exists, everything resolves to the default tenant.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { UserRepository } from "@/modules/admin/repository";
import { inviteUser, writeAudit } from "@/modules/admin/service";
import { defaultTenantId } from "@/core/tenant/context";
import { encryptSecret } from "@/core/crypto";
import { CredentialRepository, SessionRepository, SsoConfigRepository, ensureAuthIndexes } from "./repository";
import { generateSecret, verifyTotp, otpauthUrl } from "./totp";
import type { SsoConfig } from "./models";

const users = new UserRepository();
const creds = new CredentialRepository();
const sessions = new SessionRepository();
const ssoConfigs = new SsoConfigRepository();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const expected = Buffer.from(derivedHex, "hex");
  const actual = scryptSync(pw, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function setPassword(tenantId: string, userId: string, password: string): Promise<void> {
  await ensureAuthIndexes();
  const hash = hashPassword(password);
  const existing = await creds.findByUser(tenantId, userId);
  if (existing) await creds.update(tenantId, existing.id, { passwordHash: hash });
  else await creds.create(tenantId, { userId, passwordHash: hash });
}

export interface LoginResult {
  token: string;
  userId: string;
  tenantId: string;
}

/** Returned when the password is valid but a TOTP code is still required (§2FA). */
export interface TwoFactorRequired {
  twoFactorRequired: true;
  userId: string;
}

/** Issue a session token for an already-authenticated user (shared by password + SSO). */
async function issueSession(tenantId: string, userId: string, via: string): Promise<LoginResult> {
  const token = randomBytes(32).toString("hex");
  await sessions.create(tenantId, {
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  await users.update(tenantId, userId, { lastLoginAt: new Date() });
  await writeAudit(tenantId, { actorId: userId, action: `auth.login.${via}`, targetType: "user", targetId: userId });
  return { token, userId, tenantId };
}

/**
 * Password login. When the user has 2FA enabled, a valid `totpCode` must also be
 * supplied — otherwise `{ twoFactorRequired }` is returned and no session issues.
 */
export async function login(
  email: string,
  password: string,
  totpCode?: string
): Promise<LoginResult | TwoFactorRequired | null> {
  await ensureAuthIndexes();
  const tenantId = defaultTenantId();
  const user = await users.findByEmail(tenantId, email.toLowerCase());
  if (!user || user.status === "disabled") return null;

  const cred = await creds.findByUser(tenantId, user.id);
  if (!cred || !verifyPassword(password, cred.passwordHash)) return null;

  // 2FA gate.
  if (cred.totpEnabled && cred.totpSecret) {
    if (!totpCode) return { twoFactorRequired: true, userId: user.id };
    if (!verifyTotp(cred.totpSecret, totpCode)) return null;
  }

  return issueSession(tenantId, user.id, "password");
}

// ─── Two-factor (TOTP) — §25.3 / 2FA ──────────────────────────────────────────

/** Begin 2FA enrollment: generate + store a secret (not yet enabled) and return its otpauth URL. */
export async function beginTotpEnrollment(
  tenantId: string,
  userId: string,
  account: string
): Promise<{ secret: string; otpauthUrl: string }> {
  await ensureAuthIndexes();
  const cred = await creds.findByUser(tenantId, userId);
  if (!cred) throw new Error("no credential for user");
  const secret = generateSecret();
  await creds.update(tenantId, cred.id, { totpSecret: secret, totpEnabled: false });
  return { secret, otpauthUrl: otpauthUrl(secret, account) };
}

/** Confirm a code to switch 2FA on. Returns false if the code is wrong. */
export async function confirmTotp(tenantId: string, userId: string, code: string): Promise<boolean> {
  const cred = await creds.findByUser(tenantId, userId);
  if (!cred?.totpSecret) return false;
  if (!verifyTotp(cred.totpSecret, code)) return false;
  await creds.update(tenantId, cred.id, { totpEnabled: true });
  await writeAudit(tenantId, { actorId: userId, action: "auth.2fa.enabled", targetType: "user", targetId: userId });
  return true;
}

/** Turn 2FA off and forget the secret. */
export async function disableTotp(tenantId: string, userId: string): Promise<void> {
  const cred = await creds.findByUser(tenantId, userId);
  if (!cred) return;
  await creds.update(tenantId, cred.id, { totpSecret: null, totpEnabled: false });
  await writeAudit(tenantId, { actorId: userId, action: "auth.2fa.disabled", targetType: "user", targetId: userId });
}

export async function getTwoFactorStatus(tenantId: string, userId: string): Promise<{ enabled: boolean }> {
  const cred = await creds.findByUser(tenantId, userId);
  return { enabled: !!cred?.totpEnabled };
}

// ─── SSO (OIDC) seam — §25.3 / SSO ────────────────────────────────────────────

export function getSsoConfig(tenantId: string): Promise<SsoConfig | null> {
  return ssoConfigs.findForTenant(tenantId);
}

export async function setSsoConfig(
  tenantId: string,
  input: { issuer: string; clientId: string; clientSecret: string; autoProvision?: boolean; defaultRole?: string; enabled?: boolean }
): Promise<SsoConfig> {
  await ensureAuthIndexes();
  const existing = await ssoConfigs.findForTenant(tenantId);
  const data = {
    provider: "oidc" as const,
    issuer: input.issuer,
    clientId: input.clientId,
    clientSecretEncrypted: encryptSecret(input.clientSecret),
    autoProvision: input.autoProvision ?? false,
    defaultRole: input.defaultRole ?? "agent",
    enabled: input.enabled ?? true,
  };
  if (existing) return (await ssoConfigs.update(tenantId, existing.id, data)) ?? existing;
  return ssoConfigs.create(tenantId, data);
}

/**
 * SSO sign-in seam. An OIDC callback route verifies the IdP token, then calls
 * this with the verified email. We find (or auto-provision) the user and issue a
 * session — the same session a password login would. The token-exchange itself
 * lives in the callback route (provider-specific), keeping this module testable.
 */
export async function loginViaSso(tenantId: string, verifiedEmail: string): Promise<LoginResult | null> {
  await ensureAuthIndexes();
  const cfg = await ssoConfigs.findForTenant(tenantId);
  if (!cfg?.enabled) return null;
  let user = await users.findByEmail(tenantId, verifiedEmail.toLowerCase());
  if (!user) {
    if (!cfg.autoProvision) return null;
    user = await inviteUser(tenantId, verifiedEmail.toLowerCase(), cfg.defaultRole, verifiedEmail.split("@")[0]);
    await users.update(tenantId, user.id, { status: "active" });
  }
  if (user.status === "disabled") return null;
  return issueSession(tenantId, user.id, "sso");
}

export interface SessionContext {
  tenantId: string;
  userId: string;
}

export async function verifySession(token: string | null): Promise<SessionContext | null> {
  if (!token) return null;
  const s = await sessions.findByTokenHash(sha256(token));
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return { tenantId: s.tenantId, userId: s.userId };
}

export async function logout(token: string | null): Promise<void> {
  if (!token) return;
  const s = await sessions.findByTokenHash(sha256(token));
  if (s) await sessions.delete(s.tenantId, s.id);
}

// NOTE: public self-signup / first-run "bootstrapOwner" was intentionally
// removed ([איחוד] — no self-registration). The very first owner is now seeded
// out-of-band via `scripts/create-admin.mjs`; every other account is created by
// an admin through the invite flow (src/modules/access/invites.ts).
