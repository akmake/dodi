/**
 * Baileys socket lifecycle — port of `Whatsapp/server/services/whatsappManager.js`.
 *
 * Shared by both WTM (`wtm/tenantPool.ts`, one socket per active client, put to
 * sleep on a conveyor) and BTB (`btb/statusManager.ts`, one always-on socket per
 * account, namespaced `btb_<accountId>`) — exactly like the legacy code, which
 * is why this lives in the shared `wa-engine` module instead of under `wtm/`.
 *
 * Behavior preserved verbatim: heartbeat/silence detection, exponential
 * reconnect backoff with jitter, LID↔phone contact resolution persisted to
 * disk, and the BTB status@broadcast hooks. Session files live under
 * `wa-engine/paths.ts`'s `SESSIONS_DIR` — see that file's migration note.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import NodeCache from "node-cache";
import fs from "fs";
import path from "path";
import { downloadMedia } from "./waMessageUtils";
export { getMessageText, getMessageType, downloadMedia } from "./waMessageUtils";
import { broadcast } from "./sseManager";
import { logger } from "./logger";
import { SESSIONS_DIR } from "./paths";

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 3000;

export type StatusPostHook = (tenantId: string, m: WAMessage) => Promise<void>;
export type StatusReceiptHook = (
  tenantId: string,
  view: { msgId: string; viewerJid: string; viewedAt: Date; receiptType: "read" | "played" }
) => Promise<void>;

interface Instance {
  sock: WASocket | null;
  qr: string | null;
  status: "connecting" | "waiting_qr" | "connected" | "disconnected";
  msgCache: NodeCache;
  onMessage: (tenantId: string, msg: WAMessage, sock: WASocket) => Promise<void>;
  onStatusPost: StatusPostHook | null;
  onStatusReceipt: StatusReceiptHook | null;
  onStatusMedia: unknown;
  emitOwnEvents: boolean;
  reconnectLock: boolean;
  reconnectAttempts: number;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  lastEventTimestamp: number;
  lidToPhone: Record<string, string>;
  contactName: Record<string, string>;
  contactNotify: Record<string, string>;
  stats: {
    msgsReceived: number;
    msgsSent: number;
    reconnectCount: number;
    connectedAt: string | null;
    lastMsgAt: string | null;
    lastMsgDirection: string | null;
  };
}

interface StartOpts {
  onStatusPost?: StatusPostHook | null;
  onStatusReceipt?: StatusReceiptHook | null;
  onStatusMedia?: unknown;
  emitOwnEvents?: boolean;
}

// tenantId => Instance
const instances = new Map<string, Instance>();

// tenantIds put to sleep on purpose — suppresses auto-reconnect until the flag expires.
const noReconnect = new Set<string>();

const getSessionDir = (tenantId: string) => path.join(SESSIONS_DIR, tenantId);

// ─── helpers ────────────────────────────────────────────────

const touch = (inst: Instance) => {
  inst.lastEventTimestamp = Date.now();
};

interface BaileysContact {
  id?: string;
  lid?: string;
  name?: string;
  verifiedName?: string;
  notify?: string;
}

// Stores a contact's saved name + LID mapping from a Baileys contact object.
// Keeps the address-book name (c.name) separate from pushName (c.notify) so
// pushName never overwrites a saved name. Only updates when a value is present.
const storeContact = (inst: Instance, c: BaileysContact | undefined) => {
  if (!c) return;
  const saved = c.name || c.verifiedName || "";
  const push = c.notify || "";
  for (const key of [c.id, c.lid].filter(Boolean) as string[]) {
    if (saved) inst.contactName[key] = saved;
    if (push) inst.contactNotify[key] = push;
  }
  if (c.lid && c.id) inst.lidToPhone[c.lid] = c.id;
};

const getReconnectDelay = (attempts: number) => {
  const exp = BASE_RECONNECT_DELAY * Math.pow(2, attempts);
  const max = 5 * 60 * 1000;
  const delay = Math.min(exp, max);
  return delay + delay * Math.random() * 0.5;
};

// ─── exports ─────────────────────────────────────────────────

export const getStatus = (tenantId: string) => instances.get(tenantId)?.status ?? "disconnected";
export const getQR = (tenantId: string) => instances.get(tenantId)?.qr ?? null;
export const isConnected = (tenantId: string) => {
  const inst = instances.get(tenantId);
  return inst?.status === "connected" && inst?.sock?.user != null;
};

export const sendMessage = async (tenantId: string, jid: string, content: unknown, options?: unknown) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  inst.stats.msgsSent++;
  inst.stats.lastMsgAt = new Date().toISOString();
  inst.stats.lastMsgDirection = "wa_out";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (inst.sock.sendMessage as any)(jid, content, options);
};

export const downloadMessageMedia = async (tenantId: string, msg: WAMessage) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  return await downloadMedia(msg, inst.sock);
};

// This account's own jid (without the device suffix) — used to send quality-test statuses to self.
export const getOwnJid = (tenantId: string) => {
  const id = instances.get(tenantId)?.sock?.user?.id || "";
  return id ? id.replace(/:\d+@/, "@") : "";
};

export const deleteMessage = async (tenantId: string, jid: string, key: unknown) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  return await inst.sock.sendMessage(jid, { delete: key as never });
};

// ─── group admin operations (WTA moderation) ─────────────────────
// Thin wrappers over Baileys' group-admin APIs. They only succeed when the
// connected number is an admin in the target group — the caller checks that
// via `getGroupMetadata` first and surfaces a clear message otherwise.

/** Toggle "only admins can send" for a group. announce=true → announcement mode. */
export const setGroupAnnounce = async (tenantId: string, jid: string, announce: boolean) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  return await inst.sock.groupSettingUpdate(jid, announce ? "announcement" : "not_announcement");
};

/** Full group metadata (subject, participants with admin flags, etc.). */
export const getGroupMetadata = async (tenantId: string, jid: string) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  return await inst.sock.groupMetadata(jid);
};

/** Remove participants from a group (kick). Requires the bot to be an admin. */
export const groupRemoveParticipants = async (tenantId: string, jid: string, participants: string[]) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  return await inst.sock.groupParticipantsUpdate(jid, participants, "remove");
};

/** The connected socket's own jid (with device suffix), for admin/self comparisons. */
export const getRawOwnJid = (tenantId: string) => instances.get(tenantId)?.sock?.user?.id || "";

// All contact jids (phone numbers) — for the status recipient list (statusJidList).
export const getContactJids = (tenantId: string): string[] => {
  const inst = instances.get(tenantId);
  if (!inst) return [];
  const set = new Set<string>();
  for (const k of Object.keys(inst.contactName || {})) if (k.endsWith("@s.whatsapp.net")) set.add(k);
  for (const v of Object.values(inst.lidToPhone || {})) if (typeof v === "string" && v.endsWith("@s.whatsapp.net")) set.add(v);
  return [...set];
};

export const fetchGroups = async (tenantId: string) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) throw new Error("לא מחובר");
  const groups = await inst.sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({
    groupId: g.id.replace("@g.us", ""),
    groupName: g.subject,
    size: g.participants?.length ?? 0,
  }));
};

export const sendPresence = async (tenantId: string, jid: string, type: Parameters<WASocket["sendPresenceUpdate"]>[0]) => {
  const inst = instances.get(tenantId);
  if (!inst?.sock) return;
  try {
    await inst.sock.sendPresenceUpdate(type, jid);
  } catch {
    // best-effort
  }
};

export const getAllStatuses = (): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [id, inst] of instances) result[id] = inst.status;
  return result;
};

export const getAllStats = () => {
  const result: Record<string, unknown> = {};
  for (const [id, inst] of instances) result[id] = { status: inst.status, ...inst.stats };
  return result;
};

export const extractPhone = (msg: WAMessage, tenantId: string) => resolvePhone(tenantId, msg.key.remoteJid || "");

// Converts any jid (including @lid) to a phone number, using the instance's LID map.
// Returns '' for an @lid not yet mapped (identity unknown).
export const resolvePhone = (tenantId: string, rawJid = ""): string => {
  const jid = rawJid.replace(/:\d+@/, "@");
  if (jid.endsWith("@lid")) {
    const inst = instances.get(tenantId);
    const phoneJid = inst?.lidToPhone?.[jid] || "";
    return phoneJid ? phoneJid.replace("@s.whatsapp.net", "").replace(/\D/g, "") : "";
  }
  return jid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
};

// Returns { phone, name, pushName } for any jid — resolved live from the instance's maps.
export const resolveContact = (tenantId: string, rawJid = "") => {
  const jid = rawJid.replace(/:\d+@/, "@");
  const inst = instances.get(tenantId);
  const phone = resolvePhone(tenantId, jid);
  const phoneJid = phone ? `${phone}@s.whatsapp.net` : "";
  const pick = (map: "contactName" | "contactNotify") => inst?.[map]?.[jid] || (phoneJid && inst?.[map]?.[phoneJid]) || "";
  return { phone, name: pick("contactName"), pushName: pick("contactNotify") };
};

// ─── heartbeat ───────────────────────────────────────────────

const stopHeartbeat = (inst: Instance) => {
  if (inst.heartbeatInterval) {
    clearInterval(inst.heartbeatInterval);
    inst.heartbeatInterval = null;
  }
};

const startHeartbeat = (tenantId: string, inst: Instance) => {
  if (instances.get(tenantId) !== inst) return;
  stopHeartbeat(inst);
  inst.heartbeatInterval = setInterval(async () => {
    if (instances.get(tenantId) !== inst) {
      stopHeartbeat(inst);
      return;
    }
    const silentMin = (Date.now() - inst.lastEventTimestamp) / 60000;
    if (silentMin > 10) {
      console.warn(`[${tenantId}] 💀 heartbeat: שתיקה ${Math.round(silentMin)} דקות`);
      logger.warn("wa", `heartbeat silence ${Math.round(silentMin)}m`, { tenantId, silentMin });
      try {
        if (inst.sock?.user) {
          await inst.sock.sendPresenceUpdate("available");
          touch(inst);
          console.log(`[${tenantId}] ✅ heartbeat ping OK`);
        } else {
          await forceReconnect(tenantId, "no_user_in_heartbeat");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${tenantId}] 💀 heartbeat ping נכשל:`, message);
        logger.error("wa", `heartbeat ping failed: ${message}`, { tenantId });
        await forceReconnect(tenantId, "heartbeat_error");
      }
    }
  }, 2 * 60 * 1000);
};

// ─── reconnect ───────────────────────────────────────────────

const scheduleReconnect = (tenantId: string, reason: string) => {
  if (noReconnect.has(tenantId)) return;
  const inst = instances.get(tenantId);
  if (!inst || inst.reconnectLock) return;

  if (inst.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[${tenantId}] 🚫 הגיע למקסימום reconnects — עוצר`);
    inst.status = "disconnected";
    return;
  }

  const delay = getReconnectDelay(inst.reconnectAttempts);
  console.log(`[${tenantId}] 🔄 reconnect #${inst.reconnectAttempts + 1} בעוד ${Math.round(delay / 1000)}ש׳ (${reason})`);
  inst.stats.reconnectCount++;
  setTimeout(() => {
    if (!noReconnect.has(tenantId)) {
      void startTenant(tenantId, inst.onMessage, {
        onStatusPost: inst.onStatusPost,
        onStatusReceipt: inst.onStatusReceipt,
        onStatusMedia: inst.onStatusMedia,
        emitOwnEvents: inst.emitOwnEvents,
      });
    }
  }, delay);
};

const forceReconnect = async (tenantId: string, reason: string) => {
  const inst = instances.get(tenantId);
  if (!inst || inst.reconnectLock) return;
  inst.reconnectLock = true;

  stopHeartbeat(inst);
  inst.status = "disconnected";

  if (inst.sock) {
    try {
      inst.sock.end(undefined);
    } catch {
      // ok
    }
    inst.sock = null;
    inst.reconnectLock = false;
    // close handler will handle reconnect
  } else {
    inst.sock = null;
    inst.reconnectLock = false;
    inst.reconnectAttempts++;
    scheduleReconnect(tenantId, reason);
  }
};

// ─── main ────────────────────────────────────────────────────

// opts (optional, for BTB): { onStatusPost(tenantId, m), onStatusReceipt(tenantId, view) }
// When opts is not supplied — behavior is identical to WTM.
export const startTenant = async (
  tenantId: string,
  onMessage: (tenantId: string, msg: WAMessage, sock: WASocket) => Promise<void>,
  opts: StartOpts = {}
): Promise<void> => {
  const existing = instances.get(tenantId);
  if (existing) {
    if (existing.reconnectLock) return;
    if (existing.status === "connected") return;
    // A socket that is mid-handshake or already showing a QR must not be torn
    // down: that invalidates the QR on the user's screen, and its own close
    // event schedules another reconnect — a self-feeding loop that regenerates
    // the QR every few seconds and makes it impossible to scan. Baileys rotates
    // the QR on the live socket by itself, so leaving it alone is correct.
    if (existing.status === "connecting" || existing.status === "waiting_qr") return;
    stopHeartbeat(existing);
    try {
      existing.sock?.end?.(undefined);
    } catch {
      // ok
    }
    instances.delete(tenantId);
  }

  const sessionDir = getSessionDir(tenantId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Build LID → phone mapping from session files (lid-mapping-{phone}.json contain the LID)
  const lidToPhone: Record<string, string> = existing?.lidToPhone ?? {};
  try {
    const files = fs.readdirSync(sessionDir).filter((f) => f.startsWith("lid-mapping-") && !f.includes("_reverse"));
    for (const file of files) {
      const phone = file.replace("lid-mapping-", "").replace(".json", "");
      const lid = JSON.parse(fs.readFileSync(path.join(sessionDir, file), "utf8"));
      if (lid) lidToPhone[`${lid}@lid`] = `${phone}@s.whatsapp.net`;
    }
  } catch {
    // ok if no files yet
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const msgCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

  const inst: Instance = {
    sock: null,
    qr: null,
    status: "connecting",
    msgCache,
    onMessage,
    onStatusPost: opts.onStatusPost ?? existing?.onStatusPost ?? null,
    onStatusReceipt: opts.onStatusReceipt ?? existing?.onStatusReceipt ?? null,
    onStatusMedia: opts.onStatusMedia ?? existing?.onStatusMedia ?? null,
    emitOwnEvents: opts.emitOwnEvents ?? existing?.emitOwnEvents ?? false,
    reconnectLock: false,
    reconnectAttempts: existing?.reconnectAttempts ?? 0,
    heartbeatInterval: null,
    lastEventTimestamp: Date.now(),
    lidToPhone,
    contactName: existing?.contactName ?? {},
    contactNotify: existing?.contactNotify ?? {},
    stats: {
      msgsReceived: 0,
      msgsSent: 0,
      reconnectCount: 0,
      connectedAt: null,
      lastMsgAt: null,
      lastMsgDirection: null,
    },
  };
  instances.set(tenantId, inst);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    version,
    logger: pino({ level: "silent" }) as never,
    browser: ["Bridge Server", "Chrome", "1.0.0"],
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 2_000,
    connectTimeoutMs: 60_000,
    emitOwnEvents: inst.emitOwnEvents, // BTB=true (needs its own status receipts), WTM=false
    markOnlineOnConnect: true,
    syncFullHistory: false, // only messages from connection-time onward — no history sync
    getMessage: async () => ({ conversation: "" }),
  });

  inst.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    touch(inst);

    if (qr) {
      inst.qr = await QRCode.toDataURL(qr);
      inst.status = "waiting_qr";
      console.log(`[${tenantId}] QR מוכן לסריקה`);
    }

    if (connection === "open") {
      inst.status = "connected";
      inst.qr = null;
      inst.reconnectAttempts = 0;
      inst.reconnectLock = false;
      inst.stats.connectedAt = new Date().toISOString();
      console.log(`[${tenantId}] ✅ מחובר`);
      logger.info("wa", "connected", { tenantId });
      startHeartbeat(tenantId, inst);
      broadcast("wa_status");
    }

    if (connection === "close") {
      stopHeartbeat(inst);
      inst.status = "disconnected";
      broadcast("wa_status");

      const error = lastDisconnect?.error;
      const code = error instanceof Boom ? error.output?.statusCode : (error as { output?: { statusCode?: number } })?.output?.statusCode;

      const isLoggedOut = code === DisconnectReason.loggedOut;
      const isRestartRequired = code === DisconnectReason.restartRequired;

      console.log(`[${tenantId}] 🔌 מנותק | code=${code} loggedOut=${isLoggedOut}`);
      logger.warn("wa", `disconnected code=${code}`, { tenantId, code, isLoggedOut });

      if (isLoggedOut) {
        console.warn(`[${tenantId}] ⛔ Logged Out — מוחק session`);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {
          // ok
        }
        inst.reconnectAttempts = 0;
        inst.reconnectLock = false;
        scheduleReconnect(tenantId, "logged_out");
      } else if (isRestartRequired) {
        inst.reconnectAttempts = 0;
        inst.reconnectLock = false;
        scheduleReconnect(tenantId, "restart_required");
      } else {
        inst.reconnectAttempts++;
        inst.reconnectLock = false;
        scheduleReconnect(tenantId, `close_${code}`);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    touch(inst);
    for (const m of messages) {
      // BTB: a status that went up (from the phone or from us) — handled regardless of `type`
      if (m.key.remoteJid === "status@broadcast") {
        if (inst.onStatusPost) {
          const mtype = m.message ? Object.keys(m.message).filter((k) => k !== "messageContextInfo")[0] : null;
          logger.warn("btb", "[DIAG] upsert status@broadcast", {
            tenantId,
            type,
            fromMe: !!m.key.fromMe,
            hasMsg: !!m.message,
            mtype,
            participant: m.key.participant || null,
          });
          if (m.key.fromMe && m.message) {
            try {
              await inst.onStatusPost(tenantId, m);
            } catch (err) {
              console.error(`[${tenantId}] status post hook:`, err instanceof Error ? err.message : err);
            }
          }
        }
        continue;
      }
      if (type !== "notify") continue;
      if (!m.message || m.key.fromMe) continue;
      if (inst.msgCache.get(m.key.id as string)) continue;
      inst.msgCache.set(m.key.id as string, true);
      try {
        inst.stats.msgsReceived++;
        inst.stats.lastMsgAt = new Date().toISOString();
        inst.stats.lastMsgDirection = "wa_in";
        await onMessage(tenantId, m, sock);
      } catch (err) {
        console.error(`[${tenantId}] שגיאה בטיפול בהודעה:`, err instanceof Error ? err.message : err);
      }
    }
  });

  const handleContacts = (contacts: BaileysContact[] | undefined) => {
    touch(inst);
    for (const c of contacts || []) {
      storeContact(inst, c);
      if (c.lid && c.id) {
        const phone = c.id.replace("@s.whatsapp.net", "");
        const lid = c.lid.replace("@lid", "");
        try {
          fs.writeFileSync(path.join(getSessionDir(tenantId), `lid-mapping-${phone}.json`), JSON.stringify(lid));
        } catch {
          // ok
        }
      }
    }
  };
  sock.ev.on("contacts.upsert", handleContacts as never);
  sock.ev.on("contacts.update", handleContacts as never);

  // Initial sync (even with syncFullHistory=false) brings the contact list => names.
  sock.ev.on("messaging-history.set", (({ contacts }: { contacts?: BaileysContact[] }) => {
    touch(inst);
    for (const c of contacts || []) storeContact(inst, c);
  }) as never);

  sock.ev.on("messages.update", () => touch(inst));

  // BTB: status view receipts => viewer records. WTM (no hook) just touches.
  sock.ev.on("message-receipt.update", (async (updates: Array<{ key: { remoteJid?: string; fromMe?: boolean; id?: string }; receipt?: { userJid?: string; readTimestamp?: number; playedTimestamp?: number } }>) => {
    touch(inst);
    if (!inst.onStatusReceipt) return;
    for (const u of updates) {
      if (u?.key?.remoteJid !== "status@broadcast") continue;
      const r = u.receipt || {};
      logger.warn("btb", "[DIAG] receipt status@broadcast", {
        tenantId,
        fromMe: !!u.key.fromMe,
        msgId: u.key.id,
        userJid: r.userJid || null,
        read: !!r.readTimestamp,
        played: !!r.playedTimestamp,
      });
      if (!u.key.fromMe) continue;
      const viewerJid = r.userJid;
      if (!viewerJid) continue;
      const tsRaw = r.playedTimestamp || r.readTimestamp;
      if (!tsRaw) continue;
      try {
        await inst.onStatusReceipt(tenantId, {
          msgId: u.key.id as string,
          viewerJid,
          viewedAt: new Date(Number(tsRaw) * 1000),
          receiptType: r.playedTimestamp ? "played" : "read",
        });
      } catch (err) {
        console.error(`[${tenantId}] status receipt hook:`, err instanceof Error ? err.message : err);
      }
    }
  }) as never);

  sock.ev.on("presence.update", () => touch(inst));
  sock.ev.on("chats.update", () => touch(inst));
};

export const waitForConnected = (tenantId: string, timeoutMs = 30_000): Promise<boolean> =>
  new Promise((resolve) => {
    if (isConnected(tenantId)) return resolve(true);
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      if (isConnected(tenantId)) {
        clearInterval(poll);
        resolve(true);
      } else if (!instances.has(tenantId) || Date.now() >= deadline) {
        clearInterval(poll);
        resolve(false);
      }
    }, 500);
  });

export const stopTenant = (tenantId: string) => {
  const inst = instances.get(tenantId);
  if (!inst) return;
  stopHeartbeat(inst);
  try {
    inst.sock?.end(undefined);
  } catch {
    // ok
  }
  instances.delete(tenantId);
  console.log(`[${tenantId}] עצור`);
};

// Deletes the session — forces a fresh QR + full history sync on the next connection.
export const resetSession = (tenantId: string) => {
  stopTenant(tenantId);
  const sessionDir = getSessionDir(tenantId);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {
    // ok
  }
  console.log(`[${tenantId}] session נמחק`);
};

// Graceful disconnect without deleting the session — used by the conveyor.
export const sleepTenant = (tenantId: string) => {
  const inst = instances.get(tenantId);
  noReconnect.add(tenantId);
  setTimeout(() => noReconnect.delete(tenantId), 30_000);

  if (!inst) return;
  stopHeartbeat(inst);
  try {
    inst.sock?.end(undefined);
  } catch {
    // ok
  }
  instances.delete(tenantId);
  console.log(`[${tenantId}] נרדם`);
};
