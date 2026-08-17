/**
 * Email → WhatsApp bridge (IMAP polling) — port of
 * `Whatsapp/server/services/emailBridgeManager.js`, verbatim behavior
 * (human-like typing simulation, restart/cooldown, mutex polling).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import imap from "imap-simple";
import { simpleParser } from "mailparser";
import { isConnected, sendMessage, sendPresence } from "@/modules/wa-engine/whatsappManager";
import { cleanEmailBody, sendEmailToTenant } from "./emailRenderer";
import { createWtmMessage } from "./repository";
import { decrypt } from "@/modules/wa-engine/legacyCrypto";
import { logger } from "@/modules/wa-engine/logger";
import type { WtmClient } from "./models";

export { sendEmailToTenant } from "./emailRenderer";

const IMAP_HOST = "imap.gmail.com";
const IMAP_PORT = 993;

const buildImapConfig = (user: string, password: string, authTimeout: number) => ({
  imap: {
    user,
    password,
    host: IMAP_HOST,
    port: IMAP_PORT,
    tls: true,
    authTimeout,
    tlsOptions: { servername: IMAP_HOST, rejectUnauthorized: true },
  },
});

type QueueSendFn = (tenantId: string, fn: () => Promise<void>) => void;
let _queueSend: QueueSendFn | null = null;
export const registerQueueSend = (fn: QueueSendFn) => {
  _queueSend = fn;
};

// ─── human-like typing simulation ─────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (min: number, max: number) => min + Math.random() * (max - min);

const humanTextSend = async (tenantId: string, jid: string, text: string) => {
  await sleep(rnd(700, 2000));

  const typingMs = Math.min(text.length * rnd(130, 200), 7000);
  await sendPresence(tenantId, jid, "composing");
  await sleep(typingMs);
  await sendPresence(tenantId, jid, "paused");

  await sleep(rnd(120, 400));

  await sendMessage(tenantId, jid, { text });
};

const humanMediaDelay = () => sleep(rnd(900, 2200));

interface Bridge {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: any;
  emailInterval: ReturnType<typeof setInterval> | null;
  healthInterval: ReturnType<typeof setInterval> | null;
  stats: {
    active: boolean;
    emailToWa: number;
    waToEmail: number;
    lastEmailAt: string | null;
    connectedAt: string;
    reconnectCount: number;
  };
  isPolling: boolean;
  errorStreak: number;
}

const bridges = new Map<string, Bridge>();
const processingEmails = new Set<string>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms)),
  ]);
}

// ─── IMAP polling ────────────────────────────────────────────────

const checkForNewEmails = async (tenantId: string, tenant: WtmClient, bridge: Bridge) => {
  if (bridge.isPolling) return;
  bridge.isPolling = true;

  try {
    const { connection } = bridge;
    if (!connection) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[];
    try {
      messages = await withTimeout(
        connection.search(["UNSEEN"], { bodies: ["HEADER", "TEXT", ""], markSeen: false, struct: true }),
        15000,
        "imap-search"
      );
    } catch (searchErr) {
      bridge.errorStreak = (bridge.errorStreak || 0) + 1;
      const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
      console.error(`[${tenantId}] שגיאת פולינג (streak=${bridge.errorStreak}):`, msg);
      logger.error("imap", `poll error streak=${bridge.errorStreak}: ${msg}`, { tenantId });
      scheduleRestart(tenantId, tenant, bridge);
      return;
    }

    bridge.errorStreak = 0;
    if (messages.length === 0) return;

    console.log(`[${tenantId}] ${messages.length} מיילים חדשים`);

    for (const item of messages) {
      const uid = item.attributes.uid;
      if (processingEmails.has(`${tenantId}:${uid}`)) continue;
      processingEmails.add(`${tenantId}:${uid}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = item.parts.find((p: any) => p.which === "");
        parsed = await simpleParser(`Imap-Id: ${uid}\r\n` + all.body);
      } catch (parseErr) {
        console.error(`[${tenantId}] שגיאת parse uid=${uid}:`, parseErr instanceof Error ? parseErr.message : parseErr);
        processingEmails.delete(`${tenantId}:${uid}`);
        continue;
      }

      const fromEmail = parsed.from?.value?.[0]?.address || "";
      const subject = parsed.subject || "";
      let shouldMarkSeen = false;

      const isFromTenant = fromEmail.toLowerCase() === tenant.destinationEmail.toLowerCase();
      const isWaMsg = subject.includes("WA_MSG:") || subject.includes("WA_GRP:");

      if (isFromTenant && isWaMsg) {
        if (!isConnected(tenantId)) {
          console.warn(`[${tenantId}] וואצאפ לא מחובר — ננסה שוב`);
          processingEmails.delete(`${tenantId}:${uid}`);
          continue;
        }

        const grpMatch = subject.match(/WA_GRP:\s*([\d\-]+)/);
        const dmMatch = subject.match(/WA_MSG:\s*([0-9\-+]+)/);
        const match = grpMatch || dmMatch;
        const jid = grpMatch
          ? `${grpMatch[1].trim()}@g.us`
          : dmMatch
            ? `${dmMatch[1].trim().replace(/\D/g, "")}@s.whatsapp.net`
            : null;

        if (match && jid) {
          const groupId = grpMatch ? grpMatch[1].trim() : null;
          const phone = dmMatch ? dmMatch[1].trim().replace(/\D/g, "") : groupId || jid;

          const doSend = async () => {
            const body = cleanEmailBody(parsed.text, tenant.emailSignature);
            if (body) {
              await humanTextSend(tenantId, jid, body);
              await createWtmMessage({
                tenantId,
                phone,
                senderName: "אני",
                direction: "out",
                text: body,
                mediaPath: null,
                mediaType: null,
                groupJid: groupId,
                groupName: null,
                msgId: null,
              });
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userAttachments = (parsed.attachments || []).filter((att: any) => att.contentDisposition === "attachment");
            for (const att of userAttachments) {
              await humanMediaDelay();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let content: any = {};
              if (att.contentType.startsWith("image/")) content = { image: att.content, caption: att.filename };
              else if (att.contentType.startsWith("video/")) content = { video: att.content, caption: att.filename };
              else if (att.contentType.startsWith("audio/")) content = { audio: att.content, mimetype: "audio/mp4", ptt: true };
              else content = { document: att.content, mimetype: att.contentType, fileName: att.filename };
              await sendMessage(tenantId, jid, content);
            }
            console.log(`[${tenantId}] ✓ uid=${uid} → ${jid}`);
            const b = bridges.get(tenantId);
            if (b) {
              b.stats.emailToWa++;
              b.stats.lastEmailAt = new Date().toISOString();
            }
          };

          if (isConnected(tenantId)) {
            try {
              await doSend();
              shouldMarkSeen = true;
            } catch (waErr) {
              console.error(`[${tenantId}] שגיאת וואצאפ:`, waErr instanceof Error ? waErr.message : waErr);
              processingEmails.delete(`${tenantId}:${uid}`);
            }
          } else if (_queueSend) {
            _queueSend(tenantId, doSend);
            shouldMarkSeen = true;
          } else {
            processingEmails.delete(`${tenantId}:${uid}`);
          }
        } else {
          shouldMarkSeen = true;
        }
      } else {
        shouldMarkSeen = true;
      }

      if (shouldMarkSeen) {
        try {
          await withTimeout(connection.addFlags(uid, ["\\Seen"]), 8000, "imap-addFlags");
        } catch (flagErr) {
          console.error(`[${tenantId}] addFlags נכשל uid=${uid}:`, flagErr instanceof Error ? flagErr.message : flagErr);
          scheduleRestart(tenantId, tenant, bridge);
        }
        processingEmails.delete(`${tenantId}:${uid}`);
      }
    }
  } finally {
    bridge.isPolling = false;
  }
};

// ─── controlled restart with cooldown ──────────────────────────

const restartTimers = new Map<string, ReturnType<typeof setTimeout>>();

const scheduleRestart = (tenantId: string, tenant: WtmClient, bridge: Bridge) => {
  if (restartTimers.has(tenantId)) return;
  if (bridge.emailInterval) clearInterval(bridge.emailInterval);
  if (bridge.healthInterval) clearInterval(bridge.healthInterval);
  bridge.emailInterval = null;
  bridge.healthInterval = null;
  const delay = Math.min(5000 * Math.pow(2, bridge.errorStreak || 0), 60000);
  console.warn(`[${tenantId}] IMAP restart בעוד ${delay / 1000}ש׳`);
  restartTimers.set(
    tenantId,
    setTimeout(() => {
      restartTimers.delete(tenantId);
      void startBridge(tenantId, tenant);
    }, delay)
  );
};

// ─── bridge lifecycle ─────────────────────────────────────────────

export const startBridge = async (tenantId: string, tenant: WtmClient): Promise<void> => {
  stopBridge(tenantId);
  const timer = restartTimers.get(tenantId);
  if (timer) clearTimeout(timer);
  restartTimers.delete(tenantId);

  if (!tenant.bridgeEmail || !tenant.bridgeEmailPassword || !tenant.destinationEmail) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connection: any;
  try {
    console.log(`[${tenantId}] מתחבר ל-IMAP...`);
    connection = await withTimeout(
      imap.connect(buildImapConfig(tenant.bridgeEmail, decrypt(tenant.bridgeEmailPassword), 30000)),
      35000,
      "imap-connect"
    );
    await withTimeout(connection.openBox("INBOX"), 10000, "imap-openBox");
    console.log(`[${tenantId}] IMAP מחובר`);
    logger.info("imap", "connected", { tenantId, reconnectCount: (bridges.get(tenantId)?.stats?.reconnectCount ?? 0) + 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${tenantId}] IMAP חיבור נכשל:`, msg, "— ניסיון חוזר בעוד 30ש׳");
    logger.error("imap", `connection failed: ${msg}`, { tenantId });
    setTimeout(() => void startBridge(tenantId, tenant), 30000);
    return;
  }

  const prevStats = bridges.get(tenantId)?.stats;
  const stats = {
    active: true,
    emailToWa: prevStats?.emailToWa ?? 0,
    waToEmail: prevStats?.waToEmail ?? 0,
    lastEmailAt: prevStats?.lastEmailAt ?? null,
    connectedAt: new Date().toISOString(),
    reconnectCount: (prevStats?.reconnectCount ?? 0) + 1,
  };

  const bridge: Bridge = { connection, emailInterval: null, healthInterval: null, stats, isPolling: false, errorStreak: 0 };
  bridges.set(tenantId, bridge);

  await checkForNewEmails(tenantId, tenant, bridge);

  if (bridges.get(tenantId) !== bridge) return;

  bridge.emailInterval = setInterval(() => {
    const b = bridges.get(tenantId);
    if (b !== bridge) {
      if (bridge.emailInterval) clearInterval(bridge.emailInterval);
      return;
    }
    void checkForNewEmails(tenantId, tenant, b);
  }, 10000);

  bridge.healthInterval = setInterval(() => {
    const b = bridges.get(tenantId);
    if (b !== bridge) {
      if (bridge.healthInterval) clearInterval(bridge.healthInterval);
      return;
    }
    try {
      if (!connection || connection.imap.state === "disconnected") {
        console.warn(`[${tenantId}] IMAP health: מת — מתחבר מחדש`);
        scheduleRestart(tenantId, tenant, b);
      }
    } catch {
      // ok
    }
  }, 5 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection.on("error", (err: any) => {
    console.error(`[${tenantId}] IMAP שגיאה:`, err?.message);
    const b = bridges.get(tenantId);
    if (b === bridge) scheduleRestart(tenantId, tenant, b);
  });
};

export const stopBridge = (tenantId: string): void => {
  const bridge = bridges.get(tenantId);
  if (!bridge) return;
  if (bridge.emailInterval) clearInterval(bridge.emailInterval);
  if (bridge.healthInterval) clearInterval(bridge.healthInterval);
  bridge.emailInterval = null;
  bridge.healthInterval = null;
  try {
    bridge.connection?.end?.();
  } catch {
    // ok
  }
  bridges.delete(tenantId);
  console.log(`[${tenantId}] גשר מייל עצר`);
};

export const getBridgeStats = (tenantId: string) => {
  const bridge = bridges.get(tenantId);
  return bridge ? { ...bridge.stats } : { active: false };
};

export const recordWaToEmail = (tenantId: string): void => {
  const bridge = bridges.get(tenantId);
  if (!bridge) return;
  bridge.stats.waToEmail++;
  bridge.stats.lastEmailAt = new Date().toISOString();
};

// ─── one-off IMAP connectivity check ─────────────────────────────

export const testImapConnection = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connection: any;
  const attempt = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    (async () => {
      try {
        connection = await imap.connect(buildImapConfig(email, password, 10000));
        await connection.openBox("INBOX");
        resolve({ ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("invalid credentials") || msg.toLowerCase().includes("authentication failed"))
          resolve({ ok: false, error: "סיסמת האפ שגויה או שגישת IMAP לא מופעלת בחשבון" });
        else if (msg.toLowerCase().includes("timeout")) resolve({ ok: false, error: "תם הזמן — בדוק שגישת IMAP מופעלת בחשבון Gmail" });
        else resolve({ ok: false, error: `שגיאת חיבור: ${msg}` });
      } finally {
        try {
          connection?.end?.();
        } catch {
          // ok
        }
      }
    })();
  });
  const timeout = new Promise<{ ok: boolean; error?: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "תם הזמן (20 שניות)" }), 20000)
  );
  return Promise.race([attempt, timeout]);
};
