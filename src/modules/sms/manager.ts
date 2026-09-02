/**
 * SMS-relay connection manager — one ALWAYS-ON Baileys socket per tenant,
 * namespaced `sms_<tenantId>` so it never clashes with WTM (bare id), BTB
 * (`btb_<id>`), WTA (`wta_<id>`) or WRE (`wre_<id>`).
 *
 * Rides the shared `wa-engine/whatsappManager`, like WTA's and WRE's managers.
 * The relay is send-only: it never reads WhatsApp, so `onMessage` is a no-op —
 * but the socket still has to stay online, because an SMS can land at any
 * moment and a sleeping socket cannot send.
 */
import {
  startTenant,
  stopTenant,
  resetSession,
  sendMessage,
  waitForConnected,
  getStatus as waGetStatus,
  getQR as waGetQR,
  isConnected as waIsConnected,
} from "@/modules/wa-engine/whatsappManager";
import { toWaJid } from "./phone";

/** wa-engine instance id for a tenant's SMS relay socket. */
export const waId = (tenantId: string) => `sms_${tenantId}`;

/** Send-only relay: incoming WhatsApp messages are of no interest here. */
const onMessage = async () => {};

/**
 * Force-(re)start the socket. Tears down any existing one that isn't already
 * connected. For explicit user intent only — bootstrap, the "reconnect" button.
 */
export const connect = (tenantId: string) => startTenant(waId(tenantId), onMessage);

/** Sockets whose `startTenant` is mid-flight — see {@link ensureStarted}. */
const starting = new Set<string>();

/**
 * Start the socket only if it isn't already up or on its way up.
 *
 * `startTenant` is NOT idempotent: it returns early only when the instance is
 * `connected` (or reconnect-locked), and otherwise **destroys the existing
 * socket and builds a new one**. During pairing the status is `waiting_qr`, so
 * calling `connect` again mid-pairing kills the socket that issued the QR and
 * mints a fresh code — a QR that changes every couple of seconds and can never
 * be scanned. Anything polled (the QR panel) or event-driven (an inbound SMS)
 * MUST use this, never `connect`.
 *
 * The `starting` set closes the race inside `startTenant` itself: it awaits
 * `useMultiFileAuthState`/`fetchLatestBaileysVersion` *before* registering the
 * instance, so for a beat there is no instance and the status still reads
 * "disconnected".
 */
export const ensureStarted = async (tenantId: string): Promise<void> => {
  const id = waId(tenantId);
  if (starting.has(id)) return;

  const status = waGetStatus(id);
  if (status === "connected" || status === "connecting" || status === "waiting_qr") return;

  starting.add(id);
  try {
    // `stopTenant` first, to drop the instance before restarting: startTenant
    // inherits `reconnectAttempts`, and the engine counts every unscanned QR
    // window (which closes with an ordinary 408) as a failed reconnect. Without
    // this, a user who takes a while to find their phone watches pairing back
    // off to the 5-minute cap and then give up for good after 15 attempts.
    stopTenant(id);
    await startTenant(id, onMessage);
  } finally {
    starting.delete(id);
  }
};

export const disconnect = (tenantId: string) => stopTenant(waId(tenantId));

export const reset = (tenantId: string) => resetSession(waId(tenantId));

export const getStatus = (tenantId: string) => waGetStatus(waId(tenantId));
export const getQR = (tenantId: string) => waGetQR(waId(tenantId));
export const isConnected = (tenantId: string) => waIsConnected(waId(tenantId));

/**
 * How long to wait for a socket that is up but not yet `connected`. Short on
 * purpose: this runs inside the phone's HTTP request, and a socket that hasn't
 * come back in 8s isn't coming back this second — the retry queue covers it.
 */
const CONNECT_WAIT_MS = 8_000;

/**
 * Send one text message to a wa.me-form phone number.
 *
 * Nudges the socket awake first: the relay is always-on, but a process restart
 * or a dropped connection is exactly when an SMS is most likely to be missed.
 * Throws when the number is still unreachable — the caller turns that into a
 * queued retry (and, if configured, the email fallback).
 */
export async function sendToPhone(
  tenantId: string,
  phone: string,
  text: string
): Promise<{ waMessageId: string | null }> {
  if (!isConnected(tenantId)) {
    await ensureStarted(tenantId);
    const ok = await waitForConnected(waId(tenantId), CONNECT_WAIT_MS);
    if (!ok) throw new Error("וואטסאפ אינו מחובר — יש לסרוק QR בדף SMS");
  }
  const sent = (await sendMessage(waId(tenantId), toWaJid(phone), { text })) as
    | { key?: { id?: string | null } }
    | undefined;
  return { waMessageId: sent?.key?.id ?? null };
}
