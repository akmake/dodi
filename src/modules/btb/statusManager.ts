/**
 * BTB account management + status-view tracking — port of
 * `Whatsapp/server/services/statusManager.js`. Rides on the same Baileys engine
 * as WTM (`wa-engine/whatsappManager`), but stays outside the WTM conveyor pool
 * — the socket stays online to catch view receipts.
 */
import { randomUUID } from "crypto";
import {
  startTenant,
  stopTenant,
  resetSession,
  resolvePhone,
  resolveContact,
  sendMessage as waSend,
  downloadMessageMedia,
  getOwnJid,
  deleteMessage,
  getContactJids,
  getStatus as waGetStatus,
  getQR as waGetQR,
  isConnected as waIsConnected,
  getMessageText,
  getMessageType,
} from "@/modules/wa-engine/whatsappManager";
import type { StatusPostHook, StatusReceiptHook, StatusRevokeHook } from "@/modules/wa-engine/whatsappManager";
import { deleteStatusPostByMsgId, isStatusDeleted } from "./repository";
import { processImage, processVideo } from "./statusMedia";
import { probeMedia, type ImageProbe, type VideoProbe } from "./statusProbe";
import { getDb } from "@/core/db/mongo";
import { ObjectId } from "mongodb";
import type { StatusPost, StatusView } from "./models";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { logger } from "@/modules/wa-engine/logger";
import type { WAMessage } from "@whiskeysockets/baileys";

const postsCol = async () => (await getDb()).collection<StatusPost>("statusposts");
const viewsCol = async () => (await getDb()).collection<StatusView>("statusviews");

// namespace for the BTB session/instance, so it doesn't clash with WTM
const waId = (accountId: string) => `btb_${accountId}`;

// msgIds of quality-test statuses — flagged so the hooks don't record them in the DB.
const testMsgIds = new Set<string>();

// Wraps a promise with a timeout so a stuck step (upload/download from
// WhatsApp) fails with a clear error instead of holding the request open until
// a proxy/tunnel resets it (ERR_CONNECTION_RESET).
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} עבר את ה-timeout (${ms / 1000}ש')`)), ms)),
  ]);
}

const mediaTypeOf = (m: WAMessage): "image" | "video" | "text" => {
  const t = getMessageType(m);
  if (t === "imageMessage") return "image";
  if (t === "videoMessage") return "video";
  return "text";
};

// jpegThumbnail embedded in image/video messages => data URL for the card (no download).
const thumbnailOf = (m: WAMessage | undefined): string => {
  const msg = m?.message || {};
  const thumb = msg.imageMessage?.jpegThumbnail || msg.videoMessage?.jpegThumbnail;
  if (!thumb) return "";
  try {
    return `data:image/jpeg;base64,${Buffer.from(thumb).toString("base64")}`;
  } catch {
    return "";
  }
};

// ARGB (int) of a text status => background hex color for the card.
const bgColorOf = (m: WAMessage): string => {
  const argb = m.message?.extendedTextMessage?.backgroundArgb;
  if (!argb && argb !== 0) return "";
  return "#" + (argb >>> 0).toString(16).padStart(8, "0").slice(2); // ignore alpha
};

// ─── hooks ────────────────────────────────────────────────────────

// A status detected as posted (mostly from the phone; our own uploads are recorded in recordUpload/postStatus).
const onStatusPost: StatusPostHook = async (waTenantId, m) => {
  const accountId = waTenantId.replace("btb_", "");
  const msgId = m.key.id as string;
  if (testMsgIds.has(msgId)) return; // quality-test status — not recorded
  // Deleted by the user (here or on the phone) — the upsert below would bring it back.
  if (await isStatusDeleted(accountId, msgId)) return;
  try {
    const posts = await postsCol();
    const post = await posts.findOneAndUpdate(
      { accountId: new ObjectId(accountId), msgId },
      {
        $set: {
          postedAt: m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date(),
          mediaType: mediaTypeOf(m),
          caption: getMessageText(m),
          thumbnail: thumbnailOf(m),
          bgColor: bgColorOf(m),
        },
        // source is only set on insert — never overwrite an 'upload' we made ourselves.
        $setOnInsert: { accountId: new ObjectId(accountId), msgId, source: "phone", viewsCount: 0, segmentIndex: 0, segmentCount: 1, batchId: null, createdAt: new Date(), updatedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );
    if (!post) return;

    const views = await viewsCol();
    await views.updateMany({ accountId: new ObjectId(accountId), msgId, statusId: null }, { $set: { statusId: post._id } });
    const viewsCount = await views.countDocuments({ accountId: new ObjectId(accountId), msgId });
    if (viewsCount !== post.viewsCount) {
      await posts.updateOne({ _id: post._id }, { $set: { viewsCount } });
    }

    logger.warn("btb", `[DIAG] onStatusPost ok post=${post._id} mtype=${post.mediaType}`, { accountId, msgId });
    broadcast("btb_status");
  } catch (err) {
    logger.error("btb", `onStatusPost failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, stack: err instanceof Error ? err.stack : undefined });
  }
};

// A view receipt => viewer record (unique per status × viewer).
const onStatusReceipt: StatusReceiptHook = async (waTenantId, view) => {
  const accountId = waTenantId.replace("btb_", "");
  const { msgId, viewerJid, viewedAt, receiptType } = view;
  if (testMsgIds.has(msgId)) return;
  // The upsert below re-creates a post row from a view receipt alone. Without
  // this check a status the user deleted comes back every time somebody views
  // it on WhatsApp — deleted here, resurrected seconds later.
  if (await isStatusDeleted(accountId, msgId)) return;
  try {
    const posts = await postsCol();
    const post = await posts.findOneAndUpdate(
      { accountId: new ObjectId(accountId), msgId },
      {
        $setOnInsert: {
          accountId: new ObjectId(accountId),
          msgId,
          mediaType: "unknown",
          source: "phone",
          postedAt: viewedAt ?? new Date(),
          caption: "",
          thumbnail: "",
          bgColor: "",
          batchId: null,
          segmentIndex: 0,
          segmentCount: 1,
          viewsCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    if (!post) return;
    const viewerPhone = resolvePhone(waTenantId, viewerJid);
    const views = await viewsCol();
    const res = await views.updateOne(
      { accountId: new ObjectId(accountId), msgId, viewerJid },
      {
        $setOnInsert: {
          accountId: new ObjectId(accountId),
          msgId,
          statusId: post._id,
          viewerJid,
          viewerPhone,
          viewerName: "",
          viewedAt: viewedAt ?? new Date(),
          receiptType: receiptType ?? "read",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      await posts.updateOne({ _id: post._id }, { $inc: { viewsCount: 1 } });
    }
    logger.warn("btb", `[DIAG] onStatusReceipt ok post=${post._id} mtype=${post.mediaType} newView=${res.upsertedCount > 0}`, { accountId, msgId });
    broadcast("btb_status");
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 11000) logger.error("btb", `onStatusReceipt failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, stack: err instanceof Error ? err.stack : undefined });
  }
};

// ─── lifecycle ────────────────────────────────────────────────────

// Live resolution of a viewer => { phone, name } from the instance's maps.
export const resolveViewer = (accountId: string, jid: string) => resolveContact(waId(accountId), jid);

// Number of recipients (contacts) who will see the status.
export const getAudienceSize = (accountId: string) => getContactJids(waId(accountId)).length;

type PostStatusPayload = {
  type: "image" | "video" | "text";
  buffer?: Buffer;
  caption?: string;
  bgColor?: string;
  font?: number;
  videoQuality?: "max" | "optimized";
};

// Upload a status from the dashboard: process media -> send to status@broadcast -> record.
// A long video is auto-cut into 30s segments sent in sequence.
export async function postStatus(accountId: string, { type, buffer, caption = "", bgColor = "", font, videoQuality = "max" }: PostStatusPayload) {
  const tenantId = waId(accountId);
  if (!waIsConnected(tenantId)) throw new Error("החשבון לא מחובר");

  const recipients = getContactJids(tenantId); // statusJidList — without this, nobody sees it

  const isVideo = type === "video";
  const originalProbe: ImageProbe | VideoProbe | null =
    (type === "image" || type === "video") && buffer ? await probeMedia(buffer, isVideo).catch(() => null) : null;

  interface Piece {
    content: Record<string, unknown>;
    media?: Buffer;
    isVideo?: boolean;
    options?: Record<string, unknown>;
  }
  let pieces: Piece[];
  if (type === "image") {
    if (!buffer) throw new Error("חסר קובץ");
    const media = await processImage(buffer);
    pieces = [{ content: { image: media, caption }, media, isVideo: false }];
  } else if (type === "video") {
    if (!buffer) throw new Error("חסר קובץ");
    const segs = await processVideo(buffer, { quality: videoQuality });
    pieces = segs.map((b, i) => ({ content: { video: b, caption: i === 0 ? caption : "" }, media: b, isVideo: true }));
  } else if (type === "text") {
    const options: Record<string, unknown> = {};
    if (bgColor) options.backgroundColor = bgColor;
    if (font !== undefined && font !== null && !Number.isNaN(font)) options.font = font;
    pieces = [{ content: { text: caption }, options }];
  } else {
    throw new Error("סוג סטטוס לא נתמך");
  }

  const batchId = randomUUID();
  let count = 0;
  const posts = await postsCol();
  for (let i = 0; i < pieces.length; i++) {
    const opts = { statusJidList: recipients, ...(pieces[i].options || {}) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sent = (await waSend(tenantId, "status@broadcast", pieces[i].content, opts)) as any;
    const msgId = sent?.key?.id;
    if (!msgId) continue;

    let mediaProbe: Record<string, unknown> | undefined;
    if (pieces[i].media) {
      const sentProbe = await probeMedia(pieces[i].media as Buffer, !!pieces[i].isVideo).catch(() => null);
      mediaProbe = {
        original: i === 0 ? originalProbe : null,
        originalBytes: i === 0 ? (buffer?.length ?? null) : null,
        sent: sentProbe,
        sentBytes: (pieces[i].media as Buffer).length,
      };
    }

    await posts.findOneAndUpdate(
      { accountId: new ObjectId(accountId), msgId },
      {
        $set: {
          postedAt: new Date(),
          mediaType: type,
          caption: i === 0 ? caption : "",
          thumbnail: thumbnailOf(sent),
          bgColor: bgColor || "",
          source: "upload",
          batchId,
          segmentIndex: i,
          segmentCount: pieces.length,
          ...(mediaProbe ? { mediaProbe } : {}),
        },
        $setOnInsert: { accountId: new ObjectId(accountId), msgId, viewsCount: 0, createdAt: new Date(), updatedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );
    count++;

    // Quality-check loop: downloads the status we just uploaded back and checks
    // what changed — runs asynchronously so it doesn't delay the upload
    // response; the result streams in over SSE.
    if (pieces[i].media) void captureRoundtrip(tenantId, accountId, msgId, sent, !!pieces[i].isVideo);
  }

  broadcast("btb_status");
  logger.info("btb", `posted status: ${count} piece(s) to ${recipients.length} recipients`, { accountId });
  return { count, recipients: recipients.length };
}

// Downloads the status we uploaded back from WhatsApp and probes it — the "roundtrip" step.
// Comparing sent↔roundtrip reveals whether WhatsApp changed anything (shouldn't, for E2E media).
async function captureRoundtrip(tenantId: string, accountId: string, msgId: string, sentMsg: WAMessage, isVideo: boolean) {
  try {
    const buf = await downloadMessageMedia(tenantId, sentMsg);
    const roundtrip = await probeMedia(buf, isVideo);
    const posts = await postsCol();
    await posts.updateOne(
      { accountId: new ObjectId(accountId), msgId },
      { $set: { "mediaProbe.roundtrip": roundtrip, "mediaProbe.roundtripBytes": buf.length } }
    );
    logger.info("btb", `roundtrip probe ok msg=${msgId} bytes=${buf.length}`, { accountId });
    broadcast("btb_status");
  } catch (err) {
    logger.warn("btb", `roundtrip probe failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, msgId });
  }
}

type QualityTestPayload = { type: "image" | "video"; buffer: Buffer; videoQuality?: "max" | "optimized" };

// Quality test only: uploads as a status (to self only — never distributed to
// followers, never recorded in the DB), downloads it back, probes each stage,
// then deletes the test status. Returns the quality report (source → sent →
// WhatsApp) with no persistence.
export async function testStatusQuality(accountId: string, { type, buffer, videoQuality = "max" }: QualityTestPayload) {
  const tenantId = waId(accountId);
  if (!waIsConnected(tenantId)) throw new Error("החשבון לא מחובר");
  if (type !== "image" && type !== "video") throw new Error("בדיקה נתמכת לתמונה/ווידאו בלבד");
  logger.warn("btb", `[TEST] start type=${type} src=${(buffer.length / 1024 / 1024).toFixed(1)}MB`, { accountId });

  const isVideo = type === "video";
  const originalProbe = await probeMedia(buffer, isVideo).catch(() => null);

  let media: Buffer;
  let content: Record<string, unknown>;
  let segmentCount = 1;
  if (type === "image") {
    media = await processImage(buffer);
    content = { image: media };
  } else {
    const segs = await processVideo(buffer, { firstSegmentOnly: true, quality: videoQuality });
    media = segs[0];
    content = { video: media };
    const dur = (originalProbe as VideoProbe | null)?.durationSec;
    if (dur) segmentCount = Math.max(1, Math.ceil(dur / 30));
  }
  const sentProbe = await probeMedia(media, isVideo).catch(() => null);
  const mb = (media.length / 1024 / 1024).toFixed(1);
  logger.warn("btb", `[TEST] encoded ${type} ${mb}MB — uploading to WA`, { accountId });

  const self = getOwnJid(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent = (await withTimeout(
    waSend(tenantId, "status@broadcast", content, { statusJidList: self ? [self] : [] }),
    90_000,
    "העלאת הסטטוס לוואטסאפ"
  )) as any;
  const msgId = sent?.key?.id;
  if (!msgId) throw new Error("השליחה נכשלה");
  testMsgIds.add(msgId);
  setTimeout(() => testMsgIds.delete(msgId), 120_000);
  logger.warn("btb", `[TEST] uploaded ok msg=${msgId} — downloading back`, { accountId });

  let roundtrip: ImageProbe | VideoProbe | null = null;
  let roundtripBytes: number | null = null;
  let roundtripError: string | null = null;
  try {
    const buf = await withTimeout(downloadMessageMedia(tenantId, sent), 90_000, "הורדת הסטטוס בחזרה");
    roundtrip = await probeMedia(buf, isVideo);
    roundtripBytes = buf.length;
    logger.warn("btb", `[TEST] downloaded back ${(buf.length / 1024 / 1024).toFixed(1)}MB`, { accountId });
  } catch (err) {
    roundtripError = err instanceof Error ? err.message : String(err);
    logger.warn("btb", `[TEST] roundtrip failed: ${roundtripError}`, { accountId, msgId });
  }

  let deleted = false;
  try {
    await deleteMessage(tenantId, "status@broadcast", sent.key);
    deleted = true;
  } catch (err) {
    logger.warn("btb", `test delete failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, msgId });
  }
  const posts = await postsCol();
  await posts.deleteOne({ accountId: new ObjectId(accountId), msgId }).catch(() => {});

  logger.warn("btb", `[TEST] done msg=${msgId} deleted=${deleted}`, { accountId });
  return {
    type,
    segmentCount,
    deleted,
    roundtripError,
    probe: { original: originalProbe, originalBytes: buffer.length, sent: sentProbe, sentBytes: media.length, roundtrip, roundtripBytes },
  };
}

// ─── quality test as a background job (doesn't hold the request open => no reset) ──
const testJobs = new Map<string, { status: "running" | "done" | "error"; result?: unknown; error?: string }>();

export function startQualityTest(accountId: string, payload: QualityTestPayload): string {
  const testId = randomUUID();
  testJobs.set(testId, { status: "running" });
  testStatusQuality(accountId, payload)
    .then((result) => testJobs.set(testId, { status: "done", result }))
    .catch((err) => {
      logger.error("btb", `[TEST] job failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, stack: err instanceof Error ? err.stack : undefined });
      testJobs.set(testId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    });
  setTimeout(() => testJobs.delete(testId), 10 * 60_000);
  return testId;
}

export const getQualityTest = (testId: string) => testJobs.get(testId) || { status: "notfound" };

// ─── status upload as a background job ─────────────────────────
const uploadJobs = new Map<string, { status: "running" | "done" | "error"; result?: unknown; error?: string }>();

export function startStatusUpload(accountId: string, payload: PostStatusPayload): string {
  const jobId = randomUUID();
  uploadJobs.set(jobId, { status: "running" });
  postStatus(accountId, payload)
    .then((result) => uploadJobs.set(jobId, { status: "done", result }))
    .catch((err) => {
      logger.error("btb", `status upload job failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, stack: err instanceof Error ? err.stack : undefined });
      uploadJobs.set(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    });
  setTimeout(() => uploadJobs.delete(jobId), 30 * 60_000);
  return jobId;
}

export const getStatusUpload = (jobId: string) => uploadJobs.get(jobId) || { status: "notfound" };

/**
 * Delete one of our own statuses on WhatsApp (delete-for-everyone). Only works
 * while the status is still live (WhatsApp drops statuses after 24h); on an
 * expired/unknown status the send fails and we return false — the caller still
 * removes the DB record either way. Reconstructs the message key from the stored
 * `msgId`, mirroring the quality-test cleanup which deletes via `sent.key`.
 */
export async function deleteStatusOnWhatsApp(accountId: string, msgId: string): Promise<boolean> {
  const tenantId = waId(accountId);
  if (!waIsConnected(tenantId)) return false;
  try {
    const key = { remoteJid: "status@broadcast", fromMe: true, id: msgId };
    await deleteMessage(tenantId, "status@broadcast", key);
    return true;
  } catch (err) {
    logger.warn("btb", `delete status failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, msgId });
    return false;
  }
}

// A status deleted on WhatsApp (from the phone, or by our own delete-for-everyone)
// must disappear here too — otherwise the list keeps showing statuses that no
// longer exist.
const onStatusRevoke: StatusRevokeHook = async (waTenantId, msgId) => {
  const accountId = waTenantId.replace("btb_", "");
  try {
    const removed = await deleteStatusPostByMsgId(accountId, msgId);
    logger.info("btb", removed ? "status revoked on WhatsApp — removed locally" : "status revoked on WhatsApp — already gone", { accountId, msgId });
    if (removed) broadcast("btb_status");
  } catch (err) {
    logger.warn("btb", `status revoke failed: ${err instanceof Error ? err.message : String(err)}`, { accountId, msgId });
  }
};

export const connect = (accountId: string) => startTenant(waId(accountId), async () => {}, { onStatusPost, onStatusReceipt, onStatusRevoke, emitOwnEvents: true });

export const disconnect = (accountId: string) => stopTenant(waId(accountId));
export const reset = (accountId: string) => resetSession(waId(accountId));

export const getStatus = (accountId: string) => waGetStatus(waId(accountId));
export const getQR = (accountId: string) => waGetQR(waId(accountId));
export const isConnected = (accountId: string) => waIsConnected(waId(accountId));

export { waId };
