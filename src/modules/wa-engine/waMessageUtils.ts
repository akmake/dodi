/**
 * Baileys message helpers — verbatim port of
 * `Whatsapp/server/services/waMessageUtils.js`.
 */
import { downloadMediaMessage, type WASocket, type WAMessage } from "@whiskeysockets/baileys";
import pino from "pino";

export function getMessageText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  );
}

export function getMessageType(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "unknown";
  return (
    Object.keys(m).find((k) => !["messageContextInfo", "senderKeyDistributionMessage"].includes(k)) ??
    "unknown"
  );
}

export async function downloadMedia(msg: WAMessage, sock: WASocket): Promise<Buffer> {
  // NOTE: passes `sock` itself as `reuploadRequest`, matching the legacy JS
  // exactly (not `sock.updateMediaMessage`) — preserving behavior verbatim,
  // including whatever the original's reupload-on-expiry path actually does.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = { logger: pino({ level: "silent" }), reuploadRequest: sock };
  return (await downloadMediaMessage(msg, "buffer", {}, options)) as Buffer;
}
