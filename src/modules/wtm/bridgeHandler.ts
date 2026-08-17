/**
 * Inbound WhatsApp → email handler — port of
 * `Whatsapp/server/services/bridgeHandler.js`, verbatim behavior (media saving,
 * per-type formatting, dedup upsert, email forward).
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { getWtmClient, upsertInboundMessage } from "./repository";
import { resolveContact, getMessageText, getMessageType, downloadMedia } from "@/modules/wa-engine/whatsappManager";
import { sendEmailToTenant, recordWaToEmail } from "./emailBridgeManager";
import { transcribeAudio } from "./transcribe";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { WTM_MEDIA_DIR } from "@/modules/wa-engine/paths";

if (!fs.existsSync(WTM_MEDIA_DIR)) fs.mkdirSync(WTM_MEDIA_DIR, { recursive: true });

const token = () => randomBytes(6).toString("hex");

const saveMedia = (tenantId: string, filename: string, buffer: Buffer): string => {
  const dir = path.join(WTM_MEDIA_DIR, tenantId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

// ─── group name cache (5 min TTL) ───────────────────────────────
const groupNameCache = new Map<string, { name: string; ts: number }>();
const GROUP_CACHE_TTL = 5 * 60 * 1000;

const getGroupName = async (sock: WASocket, groupJid: string): Promise<string> => {
  const cached = groupNameCache.get(groupJid);
  if (cached && Date.now() - cached.ts < GROUP_CACHE_TTL) return cached.name;
  try {
    const meta = await sock.groupMetadata(groupJid);
    const name = meta.subject || groupJid.replace("@g.us", "");
    groupNameCache.set(groupJid, { name, ts: Date.now() });
    return name;
  } catch {
    return groupJid.replace("@g.us", "");
  }
};

export const handleIncomingWAMessage = async (tenantId: string, msg: WAMessage, sock: WASocket): Promise<void> => {
  const client = await getWtmClient(tenantId);
  if (!client || !client.active) return;

  const remoteJid = msg.key.remoteJid || "";
  const isGroup = remoteJid.endsWith("@g.us");
  const senderJid = isGroup ? msg.key.participant || (msg as unknown as { participant?: string }).participant || "" : remoteJid;

  // Resolve the REAL phone + saved contact name via the instance's LID map —
  // the exact same mechanism BTB uses (`resolveContact`). Newer WhatsApp
  // delivers senders as `@lid`, whose bare digits are an internal id, NOT the
  // phone number; mapping it back is what turns the "ID" the user saw in the
  // email into the real number. Raw digits are only a last-resort fallback (so
  // an as-yet-unmapped LID never causes a message to be dropped).
  const contact = resolveContact(tenantId, senderJid);
  const fromPhone = contact.phone || senderJid.replace("@s.whatsapp.net", "").replace(/\D/g, "") || (isGroup ? "unknown" : "");
  if (!fromPhone) return;

  // Prefer the name saved in the address book (contact.name), like BTB; fall
  // back to how the sender calls themselves (pushName), then the number.
  const senderName = contact.name || msg.pushName || contact.pushName || fromPhone;
  const text = getMessageText(msg);
  const msgType = getMessageType(msg);

  let groupContext: { groupId: string; groupName: string } | null = null;
  if (isGroup) {
    if (!client.groupsEnabled) return;
    const groupId = remoteJid.replace("@g.us", "").replace(/:\d+$/, "");
    const allowed = client.allowedGroups?.some((g) => g.groupId.replace(/:\d+$/, "") === groupId);
    if (!allowed) return;
    const groupName = await getGroupName(sock, remoteJid);
    groupContext = { groupId, groupName };
  }

  let extraText = "";
  let mediaPath: string | null = null;
  let mediaType: "image" | "video" | "audio" | "document" | null = null;

  const m = msg.message as Record<string, { fileName?: string } | undefined> | null;

  if (msgType === "imageMessage") {
    try {
      const buffer = await downloadMedia(msg, sock);
      mediaPath = saveMedia(tenantId, `img_${Date.now()}_${token()}.jpg`, buffer);
      mediaType = "image";
      if (!text) extraText = "📷 תמונה";
    } catch (err) {
      console.error(`[${tenantId}] שגיאת הורדת תמונה:`, err instanceof Error ? err.message : err);
      extraText = "📷 תמונה";
    }
  }

  if (msgType === "videoMessage") {
    try {
      const buffer = await downloadMedia(msg, sock);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
      mediaPath = saveMedia(tenantId, `vid_${Date.now()}_${token()}.mp4`, buffer);
      mediaType = "video";
      extraText = `🎥 סרטון (${sizeMB}MB)`;
    } catch (err) {
      console.error(`[${tenantId}] שגיאת הורדת סרטון:`, err instanceof Error ? err.message : err);
      extraText = "🎥 סרטון";
    }
  }

  if (msgType === "audioMessage") {
    try {
      const buffer = await downloadMedia(msg, sock);
      mediaPath = saveMedia(tenantId, `aud_${Date.now()}_${token()}.ogg`, buffer);
      mediaType = "audio";
      const transcript = await transcribeAudio(mediaPath);
      extraText = transcript || "🎵 הקלטה קולית";
      if (transcript) console.log(`[${tenantId}] תמלול: "${transcript.slice(0, 60)}..."`);
    } catch (err) {
      console.error(`[${tenantId}] שגיאת הורדת אודיו:`, err instanceof Error ? err.message : err);
      extraText = "🎵 הקלטה קולית";
    }
  }

  if (msgType === "documentMessage") {
    try {
      const buffer = await downloadMedia(msg, sock);
      const origName = m?.documentMessage?.fileName || `doc_${Date.now()}`;
      const ext = path.extname(origName) || ".pdf";
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
      mediaPath = saveMedia(tenantId, `doc_${Date.now()}_${token()}${ext}`, buffer);
      mediaType = "document";
      extraText = `📄 ${origName} (${sizeMB}MB)`;
    } catch (err) {
      console.error(`[${tenantId}] שגיאת הורדת מסמך:`, err instanceof Error ? err.message : err);
      extraText = "📄 קובץ";
    }
  }

  if (msgType === "contactMessage") {
    const contactMsg = msg.message?.contactMessage;
    const vcard = contactMsg?.vcard || "";
    const name = contactMsg?.displayName || "";
    const phone = (vcard.match(/TEL[^:]*:([^\r\n]+)/) || [])[1]?.trim() || "";
    extraText = `📇 איש קשר: ${name}${phone ? `\n📞 ${phone}` : ""}`;
  }

  if (msgType === "contactsArrayMessage") {
    const contacts = msg.message?.contactsArrayMessage?.contacts || [];
    extraText = contacts
      .map((c) => {
        const name = c.displayName || "";
        const phone = (c.vcard?.match(/TEL[^:]*:([^\r\n]+)/) || [])[1]?.trim() || "";
        return `📇 איש קשר: ${name}${phone ? `\n📞 ${phone}` : ""}`;
      })
      .join("\n\n");
  }

  if (msgType === "locationMessage") {
    const loc = msg.message?.locationMessage;
    const lat = loc?.degreesLatitude;
    const lng = loc?.degreesLongitude;
    const name = loc?.name || loc?.address || "";
    const url = `https://maps.google.com/maps?q=${lat},${lng}`;
    extraText = `📍 מיקום${name ? `: ${name}` : ""}\n${url}`;
  }

  if (msgType === "stickerMessage") {
    try {
      const buffer = await downloadMedia(msg, sock);
      mediaPath = saveMedia(tenantId, `stk_${Date.now()}_${token()}.webp`, buffer);
      mediaType = "image";
      extraText = "🎭 סטיקר";
    } catch (err) {
      console.error(`[${tenantId}] שגיאת הורדת סטיקר:`, err instanceof Error ? err.message : err);
      extraText = "🎭 סטיקר";
    }
  }

  if (msgType === "reactionMessage") {
    const emoji = msg.message?.reactionMessage?.text;
    if (!emoji) return; // reaction removal — ignore
    extraText = `${emoji} תגובה להודעה`;
  }

  const finalText = [text, extraText].filter(Boolean).join("\n");
  if (!finalText && !mediaPath) return;

  const msgTimestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();
  const msgId = msg.key?.id || null;

  await upsertInboundMessage(tenantId, msgId, `${fromPhone}_${msgTimestamp.getTime()}`, {
    phone: fromPhone,
    senderName,
    direction: "in",
    text: finalText || "",
    mediaPath,
    mediaType,
    createdAt: msgTimestamp,
    groupJid: groupContext?.groupId ?? null,
    groupName: groupContext?.groupName ?? null,
  });

  broadcast("message");

  await sendEmailToTenant(client, tenantId, fromPhone, senderName, finalText, groupContext);
  recordWaToEmail(tenantId);
  console.log(`[${tenantId}] הודעה מ-${fromPhone}${groupContext ? ` [${groupContext.groupName}]` : ""} הועברה למייל`);
};
