/**
 * Invite flow ([איחוד] admin-created users).
 *
 * An admin creates an invite (a label + which services + optional BTB account
 * restriction + whether the invitee is themselves an admin). The invite carries
 * a random token; its link is `/invite/<token>`. The invitee opens it and picks
 * their OWN email + password — the real `User` is created only at accept time
 * (so we never store a placeholder email). One-time use, expiring.
 *
 * Self-signup is deliberately gone; this is the only way an account is created.
 */
import { randomBytes } from "crypto";
import type { Filter } from "mongodb";
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { BaseEntity } from "@/core/types";
import type { ServiceId, User } from "@/modules/admin/models";
import { createAccessUser, findUserByEmail } from "@/modules/admin/service";
import { setPassword } from "@/modules/auth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Invite extends BaseEntity {
  token: string;
  name: string | null;
  isAdmin: boolean;
  allowedServices: ServiceId[];
  btbAccountIds: string[];
  createdByUserId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

class InviteRepository extends Repository<Invite> {
  constructor() {
    super("invites");
  }
  /** Un-tenant-scoped lookup by token — the accept page has no session yet; the token IS the secret. */
  async findByTokenGlobal(token: string): Promise<Invite | null> {
    const db = await getDb();
    return db.collection<Invite>("invites").findOne({ token } as Filter<Invite>) as Promise<Invite | null>;
  }
}

const invites = new InviteRepository();

let indexesReady: Promise<void> | null = null;
export function ensureInviteIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("invites").createIndex({ token: 1 }, { unique: true }),
        db.collection("invites").createIndex({ tenantId: 1, usedAt: 1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

export async function createInvite(
  tenantId: string,
  createdByUserId: string,
  input: { name?: string | null; isAdmin?: boolean; allowedServices: ServiceId[]; btbAccountIds?: string[] }
): Promise<Invite> {
  await ensureInviteIndexes();
  return invites.create(tenantId, {
    token: randomBytes(24).toString("hex"),
    name: input.name ?? null,
    isAdmin: !!input.isAdmin,
    allowedServices: input.allowedServices,
    btbAccountIds: input.btbAccountIds ?? [],
    createdByUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    usedAt: null,
  });
}

export type InviteState = "ok" | "not_found" | "used" | "expired";

export async function inspectInvite(token: string): Promise<{ state: InviteState; invite?: Invite }> {
  const invite = await invites.findByTokenGlobal(token);
  if (!invite) return { state: "not_found" };
  if (invite.usedAt) return { state: "used", invite };
  if (invite.expiresAt.getTime() < Date.now()) return { state: "expired", invite };
  return { state: "ok", invite };
}

export interface AcceptResult {
  ok: boolean;
  error?: string;
  tenantId?: string;
  email?: string;
  user?: User;
}

/**
 * Accept an invite: validate it, ensure the chosen email is free, create the
 * active user with the invite's access profile + password, and burn the invite.
 * The caller then logs the new credentials in to mint a session.
 */
export async function acceptInvite(token: string, email: string, password: string): Promise<AcceptResult> {
  const { state, invite } = await inspectInvite(token);
  if (state !== "ok" || !invite) return { ok: false, error: state };
  if (!email.trim() || password.length < 8) return { ok: false, error: "invalid_input" };

  const existing = await findUserByEmail(invite.tenantId, email);
  if (existing) return { ok: false, error: "email_taken" };

  const user = await createAccessUser(invite.tenantId, {
    email,
    name: invite.name,
    isAdmin: invite.isAdmin,
    allowedServices: invite.allowedServices,
    btbAccountIds: invite.btbAccountIds,
  });
  await setPassword(invite.tenantId, user.id, password);
  await invites.update(invite.tenantId, invite.id, { usedAt: new Date() });

  return { ok: true, tenantId: invite.tenantId, email: email.toLowerCase(), user };
}

export function listPendingInvites(tenantId: string): Promise<Invite[]> {
  return invites.findMany(tenantId, { usedAt: null } as Filter<Invite>);
}

export async function revokeInvite(tenantId: string, token: string): Promise<boolean> {
  const invite = await invites.findOne(tenantId, { token } as Filter<Invite>);
  if (!invite) return false;
  return invites.delete(tenantId, invite.id);
}
