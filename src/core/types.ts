/**
 * Shared core types.
 *
 * Every persisted domain entity extends BaseEntity, which carries `tenantId`.
 * The Repository enforces tenant scoping on every operation, so isolation is
 * structural rather than something each query must remember.
 */

export interface BaseEntity {
  /** Application-level UUID (not the Mongo _id). */
  id: string;
  /** Owning tenant. Every query is scoped by this. */
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A tenant = one business/organization using the platform. ([קטגוריה 25]) */
export interface Tenant {
  id: string;
  name: string;
  plan: "trial" | "starter" | "pro" | "enterprise";
  status: "active" | "suspended" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

/** Fields callers supply on create — the rest (id, tenantId, timestamps) are set by the Repository. */
export type CreateInput<T extends BaseEntity> = Omit<
  T,
  "id" | "tenantId" | "createdAt" | "updatedAt"
>;
