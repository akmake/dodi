import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WTM/BTB engine port (Whatsapp↔bootWhat unification): these packages touch
  // native binaries or do dynamic `require()` of their own directory
  // (installer path lookups, native bindings) — webpack chokes trying to
  // bundle them (pulls in their README/.d.ts as "modules"). Keeping them
  // external means Node requires them directly at runtime instead, exactly
  // like the legacy Express server did.
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "sharp",
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "@xenova/transformers",
    "mailparser",
    "nodemailer",
    "imap-simple",
    "qrcode",
  ],
};

export default nextConfig;
