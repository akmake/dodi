/**
 * WA→email HTML rendering + sending — port of
 * `Whatsapp/server/services/emailRenderer.js`, verbatim markup/thread-id scheme.
 */
import fs from "fs";
import path from "path";
import nodemailer, { type Transporter } from "nodemailer";
import { decrypt } from "@/modules/wa-engine/legacyCrypto";
import { listMessagesForEmailThread } from "./repository";
import type { WtmClient, WtmMessage } from "./models";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:5002";

// ─── SMTP transporter cache ─────────────────────────────────────

const transporterCache = new Map<string, Transporter>();

export const invalidateTransporter = (tenantId: string) => {
  const t = transporterCache.get(tenantId);
  if (t) {
    try {
      t.close();
    } catch {
      // ok
    }
  }
  transporterCache.delete(tenantId);
};

const getTransporter = (client: WtmClient): Transporter => {
  const id = client._id.toString();
  if (!transporterCache.has(id)) {
    transporterCache.set(
      id,
      nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: client.bridgeEmail, pass: decrypt(client.bridgeEmailPassword) },
        pool: true,
        maxConnections: 3,
      })
    );
  }
  return transporterCache.get(id)!;
};

// ─── email body cleanup ─────────────────────────────────────────

export const cleanEmailBody = (text: string | null | undefined, signature = ""): string => {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  let bodyLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if ((t.includes("On ") && t.includes(" wrote")) || /^On .* wrote:$/i.test(t)) break;
    if (t.includes("בתאריך") && t.includes("מאת")) break;
    if (/^From:\s/i.test(t) || /^_{3,}/.test(t) || /^-{3,}/.test(t) || t.startsWith(">")) break;
    bodyLines.push(line);
  }
  const sepIdx = bodyLines.findIndex((l) => /^--\s*$/.test(l.trim()));
  if (sepIdx !== -1) bodyLines = bodyLines.slice(0, sepIdx);

  if (signature?.trim()) {
    const firstSigLine = signature.trim().split(/\r?\n/)[0].trim();
    const sigIdx = bodyLines.findIndex((l) => l.trim() === firstSigLine);
    if (sigIdx !== -1) bodyLines = bodyLines.slice(0, sigIdx);
  }

  return bodyLines.join("\n").trim();
};

// ─── media bubble ────────────────────────────────────────────────

const escapeHtml = (s: string | null | undefined) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

const mediaBlock = (mediaType: string, url: string, label: string): string => {
  if (mediaType === "image") {
    return `<a href="${url}" target="_blank" style="display:block;"><img src="${url}" style="max-width:260px;width:100%;border-radius:6px;display:block;cursor:pointer;"></a>`;
  }

  const icons: Record<string, string> = { video: "🎥", audio: "🎵", document: "📄" };
  const icon = icons[mediaType] || "📎";
  const btn = "#1a73e8";

  return `
        <a href="${url}" target="_blank" style="
            display:inline-flex;align-items:center;gap:8px;
            background:${btn};color:#fff;text-decoration:none;
            padding:9px 16px;border-radius:8px;font-size:13px;font-weight:bold;
            direction:rtl;margin:2px 0;max-width:240px;word-break:break-word;
        ">
            <span style="font-size:16px;line-height:1;">${icon}</span>
            <span>${escapeHtml(label)}</span>
        </a>`;
};

const renderBubble = (msg: WtmMessage, isNew: boolean, tenantId: string, isGroupThread = false): string => {
  const isIn = msg.direction === "in";
  const time = new Date(msg.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const bubbleBg = isIn ? "#ffffff" : "#dcf8c6";
  const borderRad = isIn ? "8px 0px 8px 8px" : "0px 8px 8px 8px";
  const align = isIn ? "right" : "left";
  const tdL = isIn ? '<td width="15%"></td>' : "";
  const tdR = !isIn ? '<td width="15%"></td>' : "";
  const checks = isIn ? "" : '<span style="font-size:12px;color:#53bdeb;margin-right:3px;">✓✓</span>';
  const senderLabel =
    isGroupThread && isIn && msg.senderName
      ? `<div style="font-size:11px;font-weight:bold;color:#075e54;margin-bottom:2px;direction:rtl;">${escapeHtml(msg.senderName)}</div>`
      : "";

  let contentHtml: string;
  if (msg.mediaPath && msg.mediaType) {
    const filename = path.basename(msg.mediaPath);
    const url = `${PUBLIC_URL}/api/wtm/media/${tenantId}/${filename}`;
    const GENERIC = ["📷 תמונה", "🎥 סרטון", "🎵 הקלטה קולית"];
    const isAudio = msg.mediaType === "audio";
    const label = isAudio ? "🎵 הקלטה קולית" : msg.text && !GENERIC.includes(msg.text) ? msg.text : filename;
    const block = mediaBlock(msg.mediaType, url, label);

    const hasTranscript = isAudio && msg.text && !GENERIC.includes(msg.text);
    const caption = hasTranscript
      ? `<div style="font-size:13px;color:#333;margin-top:6px;direction:rtl;font-style:italic;padding:6px 10px;background:#f0f9f4;border-right:3px solid #25d366;border-radius:4px;line-height:1.5;">"${escapeHtml(msg.text)}"</div>`
      : msg.text && !isAudio && msg.mediaType !== "image"
        ? `<div style="font-size:12px;color:#666;margin-top:4px;direction:rtl;">${escapeHtml(msg.text)}</div>`
        : "";
    contentHtml = block + caption;
  } else {
    const locationMatch = msg.text?.match(/^(📍[^\n]*)\n(https:\/\/maps\.google\.com[^\s]+)$/);
    if (locationMatch) {
      contentHtml = `
                <div style="font-size:13px;color:#111;direction:rtl;margin-bottom:6px;">${escapeHtml(locationMatch[1])}</div>
                <a href="${locationMatch[2]}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:#1a73e8;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:bold;">
                    🗺 פתח במפות
                </a>`;
    } else {
      contentHtml = `<div style="font-size:13px;color:#111;line-height:1.5;direction:rtl;">${escapeHtml(msg.text)}</div>`;
    }
  }

  return `
    <tr><td style="padding:3px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${tdL}
        <td width="85%" align="${align}">
          ${isNew ? '<div style="text-align:center;margin-bottom:6px;"><span style="background:#e1f3fb;color:#075e54;font-size:11px;padding:3px 10px;border-radius:8px;font-weight:bold;">▼ הודעה חדשה</span></div>' : ""}
          <div style="display:inline-block;background:${bubbleBg};border-radius:${borderRad};padding:8px 12px;max-width:100%;text-align:right;direction:rtl;box-shadow:0 1px 2px rgba(0,0,0,0.12);">
            ${senderLabel}${contentHtml}
            <div style="text-align:left;margin-top:4px;">${checks}<span style="font-size:10px;color:#999;">${time}</span></div>
          </div>
        </td>
        ${tdR}
      </tr></table>
    </td></tr>`;
};

// ─── send ─────────────────────────────────────────────────────────

export const sendEmailToTenant = async (
  client: WtmClient,
  tenantId: string,
  fromPhone: string,
  senderName: string,
  textContent: string,
  groupContext: { groupId: string; groupName: string } | null = null
): Promise<void> => {
  const transporter = getTransporter(client);

  const subject = groupContext ? `WA_GRP: ${groupContext.groupId} [${groupContext.groupName}]` : `WA_MSG: ${fromPhone}`;
  const threadId = groupContext
    ? `<wa-thread-${client._id}-grp-${groupContext.groupId}@bridge>`
    : `<wa-thread-${client._id}-${fromPhone}@bridge>`;
  const messageId = `<wa-${client._id}-${Date.now()}@bridge>`;

  const now = new Date();
  const dateStr = now.toLocaleDateString("he-IL");

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const history = groupContext
    ? await listMessagesForEmailThread(tenantId, { groupJid: groupContext.groupId }, startOfDay)
    : await listMessagesForEmailThread(tenantId, { phone: fromPhone }, startOfDay);

  const bubblesHtml = history
    .map((m, i) => renderBubble(m, i === history.length - 1 && m.direction === "in", tenantId, !!groupContext))
    .join("");

  const attachments: { filename: string; content: Buffer }[] = [];
  const newestMsg = history.length ? history[history.length - 1] : null;
  if (newestMsg?.mediaPath && newestMsg.direction === "in") {
    try {
      const buf = fs.readFileSync(newestMsg.mediaPath);
      attachments.push({ filename: path.basename(newestMsg.mediaPath), content: buf });
    } catch {
      // file deleted — send without attachment
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:16px 0;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
      <tr><td style="background:#25d366;border-radius:12px 12px 0 0;padding:10px 18px;text-align:center;">
        <div style="color:#fff;font-size:14px;font-weight:bold;">↩ לחץ Reply וכתוב את תשובתך</div>
      </td></tr>
      <tr><td style="background:#075e54;padding:12px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:44px;vertical-align:middle;">
            <div style="width:40px;height:40px;border-radius:50%;background:#25d366;text-align:center;line-height:40px;font-size:18px;color:#fff;font-weight:bold;">
              ${groupContext ? "👥" : (senderName || fromPhone).charAt(0).toUpperCase()}
            </div>
          </td>
          <td style="padding-right:10px;vertical-align:middle;">
            ${
              groupContext
                ? `<div style="color:#fff;font-size:15px;font-weight:bold;direction:rtl;">${escapeHtml(groupContext.groupName)}</div>
                   <div style="color:#b2dfdb;font-size:12px;direction:rtl;">${escapeHtml(senderName)} · +${fromPhone}</div>`
                : `<div style="color:#fff;font-size:15px;font-weight:bold;direction:rtl;">${escapeHtml(senderName)}</div>
                   <div style="color:#b2dfdb;font-size:12px;">+${fromPhone}</div>`
            }
          </td>
          <td align="left" style="vertical-align:middle;">
            <div style="color:#b2dfdb;font-size:11px;">${dateStr}</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#e5ddd5;padding:12px 10px;">
        <table width="100%" cellpadding="0" cellspacing="0">${bubblesHtml}</table>
      </td></tr>
      <tr><td style="background:#f7f7f7;border-top:1px solid #e0e0e0;border-radius:0 0 12px 12px;padding:8px 18px;">
        <div style="border-top:2px dashed #ddd;margin:4px 0;"></div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  await transporter.sendMail({
    from: `${senderName} via WhatsApp <${client.bridgeEmail}>`,
    to: client.destinationEmail,
    subject,
    html,
    messageId,
    inReplyTo: threadId,
    references: threadId,
    attachments,
  });
};
