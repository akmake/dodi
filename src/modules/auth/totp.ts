/**
 * TOTP (RFC 6238) — [קטגוריה 25] §25.3 / 2FA.
 *
 * Self-contained: base32 + HMAC-SHA1 HOTP with a ±1 step window, so no external
 * dependency is needed. The secret is stored per-credential (base32) and an
 * `otpauth://` URL is handed to the authenticator app at enrollment.
 */
import { createHmac, randomBytes } from "crypto";

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret as base32 (the standard authenticator length). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (high word is 0 for any realistic time).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Verify a 6-digit TOTP against a base32 secret, tolerating ±`window` steps of clock skew. */
export function verifyTotp(secretB32: string, token: string, window = 1): boolean {
  const code = token.replace(/\D/g, "").padStart(6, "0");
  if (code.length !== 6) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let e = -window; e <= window; e++) {
    if (hotp(secret, counter + e) === code) return true;
  }
  return false;
}

/** `otpauth://` enrollment URL for QR display in the authenticator app. */
export function otpauthUrl(secretB32: string, account: string, issuer = "bootWhat"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
