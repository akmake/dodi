/**
 * Phone parsing for the SMS relay's WhatsApp destination.
 *
 * Deliberately **dependency-free** (same rule as `wre/phone.ts`) so the settings
 * page can import it for live validation without dragging the wa-engine — and
 * with it Baileys and the Mongo driver — into the browser bundle.
 */

/** Strip everything but digits, then unwrap the international prefixes people type. */
export function normalizeWaPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // "00972…" — the dialled international prefix. Checked before the local-form
  // rule below, which would otherwise turn it into "97200972…".
  if (digits.startsWith("00")) return digits.slice(2);
  // Israeli local form ("0501234567") — the default shape here. Any other
  // country's number is expected in full international form already.
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

/** E.164 without the "+": country code + subscriber number. */
export const isValidWaPhone = (phone: string): boolean => /^\d{9,15}$/.test(phone);

/** wa.me form → the jid Baileys addresses. */
export const toWaJid = (phone: string): string => `${phone}@s.whatsapp.net`;

/** "972501234567" → "+972 50-123-4567" for display. Falls back to a plain "+". */
export function formatWaPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const m = /^972(5\d)(\d{3})(\d{4})$/.exec(digits);
  return m ? `+972 ${m[1]}-${m[2]}-${m[3]}` : digits ? `+${digits}` : "";
}
