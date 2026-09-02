/**
 * SMS relay — Android → bootWhat → WhatsApp (email only as a fallback).
 *
 * The phone POSTs each incoming SMS to `/api/sms/inbound`; we forward it to the
 * user's own WhatsApp number over the shared wa-engine socket (`manager.ts`).
 * WhatsApp is the primary channel: it reaches a phone in seconds and needs no
 * Gmail app password. The Gmail path survives only as a fallback for when the
 * socket is down, so a message is never silently lost.
 *
 * Nothing here fails the phone's request: a send that doesn't go through is
 * queued as an `sms.deliver` job and retried with the queue's backoff, so the
 * Android app can fire-and-forget.
 */
import { createHash, randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { decryptSecret, encryptSecret } from "@/core/crypto";
import { enqueue } from "@/core/jobs";
import { logger } from "@/modules/wa-engine/logger";
import {
  claimSmsDelivery, claimSmsDeliveryForRetry, findSmsSettingsByKeyHash, finishSmsDelivery,
  getSmsSettings, listAllSmsSettings, listSmsDeliveries, upsertSmsSettings,
} from "./repository";
import { connect, ensureStarted, getStatus as waStatus, isConnected as waConnected, sendToPhone } from "./manager";
import { formatWaPhone, isValidWaPhone, normalizeWaPhone } from "./phone";
import type { SmsDelivery, SmsDeliveryChannel, SmsSettings } from "./models";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** First retry gap. A socket that dropped is usually back well inside a minute;
 *  everything after this rides the job queue's own exponential backoff. */
const FIRST_RETRY_MS = 30_000;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const newKey = () => `sms_${randomBytes(32).toString("hex")}`;
const safeError = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : "שגיאת שליחה לא ידועה";
const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const localTime = (date: Date) => date.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

/** The fallback can only run when Gmail is fully configured — check before trying. */
const emailReady = (settings: SmsSettings) =>
  Boolean(settings.emailFallback && settings.appPasswordEncrypted && settings.senderEmail && settings.destinationEmail);

// ─── dashboard ───────────────────────────────────────────────

export async function getSmsDashboard(tenantId: string) {
  const [settings, deliveries] = await Promise.all([
    getSmsSettings(tenantId),
    listSmsDeliveries(tenantId, 50),
  ]);
  return {
    settings: settings ? publicSettings(settings) : null,
    wa: { status: waStatus(tenantId), connected: waConnected(tenantId) },
    deliveries: deliveries.map((item) => ({
      id: item.id, externalId: item.externalId, from: item.from, body: item.body,
      receivedAt: item.receivedAt, status: item.status, channel: item.channel,
      attempts: item.attempts, lastError: item.lastError,
    })),
  };
}

function publicSettings(settings: SmsSettings) {
  // `?? ""` / `Boolean(...)`: rows written before the WhatsApp switch have
  // neither field, and the settings page must not render "undefined".
  return {
    waPhone: settings.waPhone ?? "",
    waPhoneDisplay: formatWaPhone(settings.waPhone ?? ""),
    emailFallback: Boolean(settings.emailFallback),
    senderEmail: settings.senderEmail,
    destinationEmail: settings.destinationEmail,
    enabled: settings.enabled,
    passwordConfigured: Boolean(settings.appPasswordEncrypted),
    keyConfigured: Boolean(settings.inboundKeyHash),
    keyPrefix: settings.inboundKeyPrefix,
    lastTestAt: settings.lastTestAt,
    lastDeliveryAt: settings.lastDeliveryAt,
    lastError: settings.lastError,
  };
}

// ─── settings ────────────────────────────────────────────────

export async function saveSmsSettings(
  tenantId: string,
  input: {
    waPhone?: string; emailFallback?: boolean;
    senderEmail?: string; appPassword?: string; destinationEmail?: string; enabled?: boolean;
  }
) {
  const existing = await getSmsSettings(tenantId);

  const waPhone = normalizeWaPhone(input.waPhone ?? existing?.waPhone ?? "");
  if (!isValidWaPhone(waPhone)) throw new Error("מספר הוואטסאפ אינו תקין (למשל 050-1234567)");

  const emailFallback = input.emailFallback ?? existing?.emailFallback ?? false;
  const senderEmail = (input.senderEmail ?? existing?.senderEmail ?? "").trim().toLowerCase();
  const destinationEmail = (input.destinationEmail ?? existing?.destinationEmail ?? "").trim().toLowerCase();
  const password = input.appPassword?.replace(/\s/g, "") ?? "";

  // Gmail is only validated when it's actually going to be used — the relay is
  // fully usable with WhatsApp alone.
  if (emailFallback) {
    if (!EMAIL_RE.test(senderEmail)) throw new Error("כתובת המייל השולח אינה תקינה");
    if (!EMAIL_RE.test(destinationEmail)) throw new Error("כתובת מייל היעד אינה תקינה");
    if (!existing?.appPasswordEncrypted && !password) throw new Error("נדרשת סיסמת אפליקציה של Gmail לגיבוי");
  }

  let pairingKey: string | null = null;
  const keyPatch: { inboundKeyHash?: string; inboundKeyPrefix?: string } = {};
  if (!existing?.inboundKeyHash) {
    pairingKey = newKey();
    keyPatch.inboundKeyHash = hashKey(pairingKey);
    keyPatch.inboundKeyPrefix = pairingKey.slice(0, 12);
  }

  const enabled = input.enabled ?? existing?.enabled ?? true;
  const settings = await upsertSmsSettings(tenantId, {
    waPhone,
    emailFallback,
    senderEmail,
    destinationEmail,
    enabled,
    ...(password ? { appPasswordEncrypted: encryptSecret(password) } : {}),
    ...keyPatch,
  });

  // Bring the socket up right after the first save, so the QR panel has
  // something to show without the user having to press anything else.
  // `ensureStarted`, not `connect`: saving the destination number while the QR
  // panel is open is entirely normal, and a force-restart there would kill the
  // very socket that issued the code on screen.
  if (enabled) void ensureStarted(tenantId);

  return { settings: publicSettings(settings), pairingKey };
}

export async function rotateSmsPairingKey(tenantId: string) {
  const settings = await getSmsSettings(tenantId);
  if (!settings) throw new Error("יש לשמור קודם את ההגדרות");
  const pairingKey = newKey();
  const updated = await upsertSmsSettings(tenantId, {
    inboundKeyHash: hashKey(pairingKey),
    inboundKeyPrefix: pairingKey.slice(0, 12),
  });
  return { settings: publicSettings(updated), pairingKey };
}

// ─── delivery ────────────────────────────────────────────────

/** The WhatsApp message body. `*bold*` is WhatsApp's own markup. */
function whatsappBody(from: string, body: string, receivedAt: Date): string {
  return `📩 *SMS חדש*\n\n*מאת:* ${from}\n*התקבל:* ${localTime(receivedAt)}\n\n${body}`;
}

function emailHtml(from: string, body: string, date: string): string {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17201d"><div style="background:#132a24;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0"><div style="color:#d8ff72;font-size:12px;font-weight:bold">BOOTWHAT · SMS</div><h2 style="margin:8px 0 0">הודעה חדשה</h2></div><div style="border:1px solid #e6e9e7;border-top:0;padding:24px;border-radius:0 0 16px 16px"><div style="color:#66736e;font-size:13px">מאת</div><div style="font-size:18px;font-weight:bold;direction:ltr;text-align:right">${escapeHtml(from)}</div><div style="color:#66736e;font-size:13px;margin-top:6px">${escapeHtml(date)}</div><div style="background:#f4f6f4;padding:16px;border-radius:12px;margin-top:18px;white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</div></div></div>`;
}

function transporter(settings: SmsSettings) {
  // Use Gmail on port 587 (STARTTLS) rather than the well-known "gmail" service,
  // which defaults to port 465. Many hosts (ours included) block outbound 465/25
  // while leaving 587 open, so 465 connections time out.
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: settings.senderEmail, pass: decryptSecret(settings.appPasswordEncrypted) },
  });
}

/**
 * Try WhatsApp, fall back to email, and record the outcome on both the delivery
 * and the settings row. Throws when every configured channel failed — the
 * caller turns that into a queued retry.
 */
async function attemptDelivery(settings: SmsSettings, delivery: SmsDelivery): Promise<SmsDeliveryChannel> {
  const { tenantId } = settings;
  const { externalId } = delivery;

  let waError = "";
  try {
    const { waMessageId } = await sendToPhone(
      tenantId, settings.waPhone, whatsappBody(delivery.from, delivery.body, delivery.receivedAt)
    );
    await finishSmsDelivery(tenantId, externalId, { status: "sent", channel: "whatsapp", waMessageId });
    await upsertSmsSettings(tenantId, { lastDeliveryAt: new Date(), lastError: null });
    return "whatsapp";
  } catch (error) {
    waError = safeError(error);
    logger.warn("sms", `שליחת וואטסאפ נכשלה: ${waError}`, { tenantId });
  }

  if (emailReady(settings)) {
    try {
      const result = await transporter(settings).sendMail({
        from: `bootWhat SMS <${settings.senderEmail}>`,
        to: settings.destinationEmail,
        subject: `SMS חדש מאת ${delivery.from}`,
        text: `התקבלה הודעת SMS חדשה\n\nמאת: ${delivery.from}\nתאריך: ${localTime(delivery.receivedAt)}\n\n${delivery.body}`,
        html: emailHtml(delivery.from, delivery.body, localTime(delivery.receivedAt)),
      });
      await finishSmsDelivery(tenantId, externalId, {
        status: "sent", channel: "email", emailMessageId: result.messageId ?? null,
      });
      // Keep the WhatsApp failure visible even though the message got through —
      // a relay quietly running on its fallback is a problem worth surfacing.
      await upsertSmsSettings(tenantId, {
        lastDeliveryAt: new Date(), lastError: `נשלח במייל (גיבוי). וואטסאפ נכשל: ${waError}`,
      });
      return "email";
    } catch (error) {
      const message = `וואטסאפ: ${waError} · מייל: ${safeError(error)}`.slice(0, 500);
      await failDelivery(tenantId, externalId, message);
      throw new Error(message);
    }
  }

  await failDelivery(tenantId, externalId, waError);
  throw new Error(waError);
}

async function failDelivery(tenantId: string, externalId: string, message: string): Promise<void> {
  await finishSmsDelivery(tenantId, externalId, { status: "failed", error: message });
  await upsertSmsSettings(tenantId, { lastError: message });
}

/** Queue another attempt. Never throws — a queue hiccup must not fail the phone's request. */
async function queueRetry(tenantId: string, deliveryId: string): Promise<void> {
  try {
    await enqueue(tenantId, "sms.deliver", { deliveryId }, new Date(Date.now() + FIRST_RETRY_MS));
  } catch (error) {
    logger.warn("sms", `תזמון ניסיון חוזר נכשל: ${safeError(error)}`, { tenantId, deliveryId });
  }
}

// ─── inbound ─────────────────────────────────────────────────

export interface InboundSmsPayload {
  id?: unknown;
  from?: unknown;
  body?: unknown;
  receivedAt?: unknown;
  deviceId?: unknown;
}

export async function receiveSms(rawKey: string, payload: InboundSmsPayload) {
  if (!rawKey || rawKey.length > 200) throw new SmsInboundError("unauthorized", 401);
  const settings = await findSmsSettingsByKeyHash(hashKey(rawKey));
  if (!settings) throw new SmsInboundError("unauthorized", 401);
  if (!settings.enabled) throw new SmsInboundError("SMS relay is disabled", 403);
  if (!settings.waPhone) throw new SmsInboundError("destination number is not configured", 503);

  const externalId = typeof payload.id === "string" ? payload.id.trim() : String(payload.id ?? "").trim();
  const from = typeof payload.from === "string" ? payload.from.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim().slice(0, 120) : null;
  if (!externalId || externalId.length > 200) throw new SmsInboundError("invalid message id", 400);
  if (!from || from.length > 200) throw new SmsInboundError("invalid sender", 400);
  if (!body || body.length > 20_000) throw new SmsInboundError("invalid message body", 400);
  const timestamp = typeof payload.receivedAt === "number" ? payload.receivedAt : Date.parse(String(payload.receivedAt ?? ""));
  const receivedAt = Number.isFinite(timestamp) ? new Date(timestamp) : new Date();

  const claimed = await claimSmsDelivery(settings.tenantId, { externalId, from, body, receivedAt, deviceId });
  if (!claimed.shouldSend) {
    if (claimed.delivery.status === "sent") {
      return { accepted: true, duplicate: true, status: "sent" as const, channel: claimed.delivery.channel };
    }
    throw new SmsInboundError("delivery already in progress", 503);
  }

  try {
    const channel = await attemptDelivery(settings, claimed.delivery);
    return { accepted: true, duplicate: false, status: "sent" as const, channel };
  } catch (error) {
    // Accepted-but-queued, not an error: the phone has done its part, and the
    // retry queue owns the message from here. Answering 5xx would only make the
    // Android app re-POST a message we already hold.
    await queueRetry(settings.tenantId, claimed.delivery.id);
    return { accepted: true, duplicate: false, status: "queued" as const, error: safeError(error) };
  }
}

/**
 * Job handler for `sms.deliver` (see `/api/jobs/drain`). Throwing here is how a
 * still-failing delivery gets rescheduled with the queue's backoff.
 */
export async function retrySmsDelivery(tenantId: string, deliveryId: string): Promise<void> {
  const settings = await getSmsSettings(tenantId);
  // Relay switched off or torn down since the SMS arrived — drop it rather than
  // retry forever against a configuration that no longer exists.
  if (!settings?.enabled || !settings.waPhone) return;

  const delivery = await claimSmsDeliveryForRetry(tenantId, deliveryId);
  if (!delivery) return; // already delivered, or another attempt is in flight

  await attemptDelivery(settings, delivery);
}

// ─── tests ───────────────────────────────────────────────────

export async function testSmsWhatsapp(tenantId: string) {
  const settings = await getSmsSettings(tenantId);
  if (!settings?.waPhone) throw new Error("לא הוגדר מספר וואטסאפ");
  try {
    await sendToPhone(
      tenantId, settings.waPhone,
      "✅ *bootWhat SMS* — החיבור פעיל.\nמעכשיו כל הודעת SMS שתגיע לטלפון תגיע לכאן."
    );
    await upsertSmsSettings(tenantId, { lastTestAt: new Date(), lastError: null });
    return { ok: true };
  } catch (error) {
    const message = safeError(error);
    await upsertSmsSettings(tenantId, { lastError: message });
    throw new Error(message);
  }
}

export async function testSmsEmail(tenantId: string) {
  const settings = await getSmsSettings(tenantId);
  if (!settings?.appPasswordEncrypted) throw new Error("גיבוי המייל עדיין לא הוגדר");
  try {
    await transporter(settings).sendMail({
      from: `bootWhat SMS <${settings.senderEmail}>`,
      to: settings.destinationEmail,
      subject: "בדיקת גיבוי מייל — bootWhat SMS",
      text: "החיבור הצליח. המייל ישמש כגיבוי אם שליחת הוואטסאפ תיכשל.",
      html: "<div dir=\"rtl\" style=\"font-family:Arial,sans-serif\"><h2>גיבוי המייל פעיל</h2><p>הבדיקה הצליחה. המייל ישמש כגיבוי אם שליחת הוואטסאפ תיכשל.</p></div>",
    });
    await upsertSmsSettings(tenantId, { lastTestAt: new Date(), lastError: null });
    return { ok: true };
  } catch (error) {
    const message = safeError(error);
    await upsertSmsSettings(tenantId, { lastError: message });
    throw new Error(message);
  }
}

// ─── bootstrap ───────────────────────────────────────────────

let started = false;

/** Bring every configured relay socket up on boot — called from `/api/wa-engine/bootstrap`. */
export async function startSms(): Promise<void> {
  if (started) return;
  started = true;

  const active = (await listAllSmsSettings()).filter((s) => s.enabled && s.waPhone);
  logger.info("server", `loading ${active.length} SMS relays (always-on)`);
  console.log(`[sms] טוען ${active.length} ממסרים (always-on)...`);
  for (const settings of active) {
    void connect(settings.tenantId);
  }
}

export class SmsInboundError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
