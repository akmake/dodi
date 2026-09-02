/**
 * WTM credential encryption — port of `Whatsapp/server/utils/crypto.js`, VERBATIM
 * algorithm and wire format (`enc:<iv>:<tag>:<ciphertext>`, all hex).
 *
 * Deliberately NOT merged with bootWhat's `core/crypto.ts` (format `v1:...`,
 * key = sha256(passphrase)). Existing `Tenant.bridgeEmailPassword` values in the
 * legacy `tenants` collection were encrypted with THIS scheme (raw 32-byte key
 * from a 64-hex-char `ENCRYPTION_KEY`) — decrypting them with the other scheme's
 * key derivation would silently produce garbage. Reuses the same env var name on
 * purpose so the existing production secret keeps working unchanged.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

/** Call at startup for any code path that will persist a WTM credential. */
export function assertLegacyEncryptionKey(): void {
  if (!getKey()) {
    throw new Error(
      "ENCRYPTION_KEY חסר או לא תקין — נדרשים 64 תווי hex (32 בתים)."
    );
  }
}

export function encrypt(text: string): string {
  if (!text) return text;
  const key = getKey();
  if (!key) throw new Error("[legacyCrypto] ENCRYPTION_KEY חסר — לא ניתן להצפין סיסמה");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(data: string): string {
  if (!data) return data;
  if (!data.startsWith("enc:")) return data; // backwards compat: plaintext
  const key = getKey();
  if (!key) return "";
  const [, ivHex, tagHex, encHex] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}
