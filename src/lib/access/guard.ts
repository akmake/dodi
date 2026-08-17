/**
 * Server-side access guards ([איחוד] per-user service access).
 *
 * Used by area layouts (server components) to enforce that the logged-in user
 * may actually enter WTM / BTB / WBR / admin — the middleware only checks that a
 * session cookie is present; the fine-grained "sees only what's approved" check
 * lives here (and, for the API, in `authorize(req, scope)` via getUserScopes).
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/modules/auth";
import { getAccessProfile, type AccessProfile } from "@/modules/admin";
import type { ServiceId } from "@/modules/admin/models";

/** Resolve the current session's access profile, or null when unauthenticated. */
export async function getSessionUser(): Promise<AccessProfile | null> {
  const token = (await cookies()).get("bw_session")?.value ?? null;
  const ctx = await verifySession(token);
  if (!ctx) return null;
  return getAccessProfile(ctx.tenantId, ctx.userId);
}

/** Require access to a specific service area; redirect otherwise. */
export async function requireService(service: ServiceId): Promise<AccessProfile> {
  const profile = await getSessionUser();
  if (!profile) redirect("/login");
  if (!profile.allowedServices.includes(service)) redirect("/services");
  return profile;
}

/** Require platform-admin (users.manage); redirect otherwise. */
export async function requireAdmin(): Promise<AccessProfile> {
  const profile = await getSessionUser();
  if (!profile) redirect("/login");
  if (!profile.isAdmin) redirect("/services");
  return profile;
}
