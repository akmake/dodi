/**
 * Webhook signature verification — `X-Hub-Signature-256` (§2.2).
 *
 * Meta signs the raw request body with HMAC-SHA256 using the App Secret. We must
 * verify against the EXACT bytes Meta sent — so the route hands us `req.text()`,
 * never a re-serialized object (key order / spacing would differ and break it).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "@/core/config";

export interface SignatureResult {
  valid: boolean;
  /** Why an invalid result was returned (for logging). */
  reason?: "no_secret" | "missing_header" | "mismatch";
}

/**
 * Verify the signature over `rawBody`.
 *
 * Fail-closed in production: if no App Secret is configured we reject. In dev we
 * allow (with a warning) so the webhook is testable without the secret.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): SignatureResult {
  const secret = config.whatsapp.appSecret;

  if (!secret) {
    if (config.env === "production") return { valid: false, reason: "no_secret" };
    console.warn(
      "[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check (dev only)."
    );
    return { valid: true };
  }

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { valid: false, reason: "missing_header" };
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}
