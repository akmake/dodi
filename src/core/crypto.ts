/**
 * Secret encryption at rest (AES-256-GCM).
 *
 * Used for values that must be persisted but never stored in clear — first and
 * foremost the WhatsApp access tokens ([קטגוריה 2] §2.1), closing the leaked-token
 * debt from IMPLEMENTATION.md §5.
 *
 * Stored format: `v1:<iv hex>:<authTag hex>:<ciphertext hex>`.
 *
 * If `ENCRYPTION_KEY` is unset (typical in local dev) we degrade gracefully:
 * `encryptSecret` returns the plaintext unchanged and `decryptSecret` passes it
 * through. The `v1:` prefix lets `decryptSecret` tell ciphertext from plaintext,
 * so toggling the key on later never corrupts already-stored values.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { config } from "./config";

const PREFIX = "v1";

let warnedNoKey = false;

/** Derive a stable 32-byte key from the configured passphrase, or null if unset. */
function deriveKey(): Buffer | null {
  if (!config.encryptionKey) {
    if (!warnedNoKey && config.env === "production") {
      console.warn(
        "[crypto] ENCRYPTION_KEY is not set — secrets are stored in PLAINTEXT. Set it in production."
      );
      warnedNoKey = true;
    }
    return null;
  }
  return createHash("sha256").update(config.encryptionKey, "utf8").digest();
}

export function encryptSecret(plain: string): string {
  const key = deriveKey();
  if (!key) return plain;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(`${PREFIX}:`)) return stored; // plaintext (stored without a key)

  const key = deriveKey();
  if (!key) {
    throw new Error(
      "[crypto] Found encrypted value but ENCRYPTION_KEY is not set — cannot decrypt."
    );
  }

  const [, ivHex, tagHex, dataHex] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
