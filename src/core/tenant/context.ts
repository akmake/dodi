/**
 * Tenant resolution — the single seam for multi-tenancy.
 *
 * Today there is one WABA, so every request resolves to the default tenant.
 * When onboarding exists, `resolveTenantByPhoneNumberId` becomes a lookup over
 * the WhatsAppAccount collection ([קטגוריה 2] §2.1) — and nothing else changes,
 * because the whole data layer is already tenant-scoped.
 */
import { config } from "../config";

export function defaultTenantId(): string {
  return config.defaultTenantId;
}

/**
 * Map an inbound WhatsApp phone_number_id to its owning tenant.
 * Stubbed to the default tenant until WhatsAppAccount persistence lands.
 */
export async function resolveTenantByPhoneNumberId(
  _phoneNumberId: string
): Promise<string> {
  return config.defaultTenantId;
}
