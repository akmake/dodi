/**
 * WRE inbound handler — the `onMessage` every WRE socket runs for each incoming
 * message from a watched group.
 *
 * **Every message from a watched group is stored**, whatever the extractor makes
 * of it. Nothing is silently dropped: the broker's whole reason for looking at
 * this screen is to see what the AI understood and catch what it got wrong, and
 * a message that vanishes is an apartment nobody knows was missed. The `status`
 * field carries the verdict (`not_listing`, `low_confidence`, `skipped`, …)
 * rather than the row's existence.
 *
 * Only two things still stop a message before it becomes a row: it isn't from a
 * watched group at all, or it's a replay of a message already captured.
 *
 * A DM (not a group message) is a separate path entirely: it never becomes a
 * listing row, and is only ever acted on for numbers in the client's
 * `allowedQueryPhones` — see `queryFlow.ts`. Everyone else's DMs are ignored.
 */
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { resolveContact, getMessageText } from "@/modules/wa-engine/whatsappManager";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { logger } from "@/modules/wa-engine/logger";
import { getWreClient, createListing, listingExistsForMessage, findDuplicate, bumpRepost } from "./repository";
import { extractListing } from "./extractor";
import { geocodeAddress } from "./geo";
import { dedupKey } from "./geo/normalize";
import { isAllowedQueryPhone, handleLocationQuery } from "./queryFlow";
import type { WreClient, WreWatchedGroup, ListingStatus } from "./models";

const clientIdFromWaId = (id: string) => id.replace(/^wre_/, "");
const digitsOf = (jid: string) => (jid || "").replace(/[:@].*$/, "").replace(/\D/g, "");

/**
 * Global concurrency gate for the extract+geocode pipeline.
 *
 * A single active group can deliver a burst of messages, and every client's
 * socket feeds this same path — without a cap, one busy morning would open
 * dozens of simultaneous Claude calls and hit the provider's rate limit, losing
 * listings. Work is admitted a few at a time; the rest wait their turn.
 */
const MAX_CONCURRENT = 3;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
}

function release(): void {
  active--;
  waiting.shift()?.();
}

/** Bare group id, with any `:device` suffix stripped. */
const bareGroupId = (remoteJid: string) => remoteJid.replace("@g.us", "").replace(/:\d+$/, "");

function findWatchedGroup(client: WreClient, groupId: string): WreWatchedGroup | undefined {
  return client.watchedGroups.find((g) => g.groupId.replace(/:\d+$/, "") === groupId);
}

export const handleWreMessage = async (waTenantId: string, msg: WAMessage, _sock: WASocket): Promise<void> => {
  // ── scope gates: is this a message we're meant to be watching at all? ──
  if (msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid || "";

  const clientId = clientIdFromWaId(waTenantId);
  const client = await getWreClient(clientId);
  if (!client || !client.active) return;

  if (!remoteJid.endsWith("@g.us")) {
    // DM, not a group post — the only thing this path ever does is the
    // location→radius query, and only for pre-approved numbers.
    const senderPhone = resolveContact(waTenantId, remoteJid).phone;
    if (isAllowedQueryPhone(client, senderPhone)) {
      await handleLocationQuery(waTenantId, client, remoteJid, senderPhone, msg);
    }
    return;
  }

  const groupId = bareGroupId(remoteJid);
  const watched = findWatchedGroup(client, groupId);
  if (!watched || !watched.enabled) return;

  // A message with no text at all (a bare image/sticker) carries nothing to
  // extract or show, so it is the one case with genuinely nothing to record.
  const text = getMessageText(msg);
  if (!text || !text.trim()) return;

  const msgId = msg.key.id || null;
  // Baileys replays history on reconnect; without this the same post becomes a
  // second listing every time the socket comes back.
  if (msgId && (await listingExistsForMessage(clientId, msgId).catch(() => false))) return;

  await acquire();
  try {
    await processMessage(client, watched, msg, groupId, text, msgId, waTenantId);
  } catch (err) {
    logger.warn("wre", `pipeline failed: ${err instanceof Error ? err.message : String(err)}`, {
      clientId,
      groupId,
    });
  } finally {
    release();
  }
};

async function processMessage(
  client: WreClient,
  watched: WreWatchedGroup,
  msg: WAMessage,
  groupId: string,
  text: string,
  msgId: string | null,
  waTenantId: string
): Promise<void> {
  const clientId = client._id.toString();

  const senderJid = (msg.key.participant || (msg as unknown as { participant?: string }).participant || "").replace(
    /:\d+@/,
    "@"
  );
  const contact = resolveContact(waTenantId, senderJid);
  const senderPhone = contact.phone || digitsOf(senderJid) || "unknown";
  const senderName = contact.name || msg.pushName || contact.pushName || senderPhone;
  const messageAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

  /** Provenance is identical on every path — only the verdict differs. */
  const base = {
    clientId,
    groupJid: groupId,
    groupName: watched.groupName,
    msgId,
    senderPhone,
    senderName,
    rawText: text.slice(0, 4000),
    messageAt,
    lastSeenAt: messageAt,
  };

  /** A row for a message that produced no usable apartment. Still recorded. */
  const emptyRow = (status: ListingStatus, confidence = 0) => ({
    ...base,
    status,
    dealType: "unknown" as const,
    city: "",
    street: "",
    houseNumber: "",
    neighborhood: "",
    rooms: null,
    floor: null,
    price: null,
    sizeSqm: null,
    contactPhone: "",
    confidence,
    features: [],
    lat: null,
    lng: null,
    geocodeScore: null,
    geocodeMatch: null,
    geocodeProvider: null,
    geocodedAt: null,
    manualPin: false,
    reviewReason: null,
    houseNumberApprox: false,
    dedupKey: "",
    duplicateOf: null,
    repostCount: 0,
  });

  const done = async (doc: Parameters<typeof createListing>[0]) => {
    await createListing(doc);
    broadcast("wre");
  };

  // ── 1. below the length bar: recorded, but never sent to the extractor ──
  if (text.trim().length < client.minTextLength) {
    await done(emptyRow("skipped"));
    return;
  }

  // ── 2. extract ──
  const ex = await extractListing(text, { hint: watched.hint, defaultCity: watched.defaultCity });

  if (!ex.isListing) {
    await done(emptyRow("not_listing", ex.confidence));
    return;
  }

  // The group's default city is a *fallback*, never an override: a city named in
  // the message always wins. This is what makes city-scoped groups (where nobody
  // writes the city) geocodable at all.
  const city = ex.city.trim() || watched.defaultCity.trim();

  /** Everything the extractor found, shared by the accepted paths. */
  const extractedFields = {
    dealType: ex.dealType,
    city,
    street: ex.street,
    houseNumber: ex.houseNumber,
    neighborhood: ex.neighborhood,
    rooms: ex.rooms,
    floor: ex.floor,
    price: ex.price,
    sizeSqm: ex.sizeSqm,
    contactPhone: ex.contactPhone,
    confidence: ex.confidence,
    features: ex.features,
  };

  const noGeo = {
    lat: null,
    lng: null,
    geocodeScore: null,
    geocodeMatch: null,
    geocodeProvider: null,
    geocodedAt: null,
    manualPin: false,
    houseNumberApprox: false,
  };

  // ── 3. below the confidence bar: kept visible, not dropped ──
  // This is exactly where a real apartment the model hedged on would otherwise
  // disappear without trace, so it gets a row the broker can see and override.
  if (ex.confidence < client.minConfidence) {
    await done({
      ...base,
      ...extractedFields,
      ...noGeo,
      status: "low_confidence",
      reviewReason: null,
      dedupKey: "",
      duplicateOf: null,
      repostCount: 0,
    });
    return;
  }

  // ── 4. dedup ──
  const key = dedupKey(city, ex.street, ex.houseNumber, ex.rooms);
  if (client.dedupEnabled && key) {
    const since = new Date(Date.now() - client.dedupWindowHours * 60 * 60 * 1000);
    const dup = await findDuplicate(clientId, key, since).catch(() => null);
    if (dup) {
      // Same apartment posted again (often cross-posted to another group). The
      // canonical row carries the count so the map stays clean, but the repost
      // still gets its own row — the broker asked to see every message, and the
      // re-post is evidence in its own right (an eager seller, a hot listing).
      await bumpRepost(dup._id, messageAt).catch(() => {});
      await done({
        ...base,
        ...extractedFields,
        ...noGeo,
        status: "duplicate",
        reviewReason: null,
        dedupKey: key,
        duplicateOf: dup._id.toString(),
        repostCount: 0,
      });
      return;
    }
  }

  // ── 5. geocode ──
  const geo = await geocodeAddress(city, ex.street, ex.houseNumber);

  await done({
    ...base,
    ...extractedFields,
    // A placeholder house number ("1") is written to the record itself — not
    // left blank — so the address reads as a full one; `houseNumberApprox`
    // is what tells every surface that displays it that the number isn't real.
    houseNumber: geo.houseNumberApprox ? "1" : ex.houseNumber,
    status: geo.reviewReason ? "needs_review" : "mapped",
    lat: geo.lat,
    lng: geo.lng,
    geocodeScore: geo.score,
    geocodeMatch: geo.matchedText,
    geocodeProvider: geo.provider,
    geocodedAt: geo.provider ? new Date() : null,
    manualPin: false,
    reviewReason: geo.reviewReason,
    houseNumberApprox: geo.houseNumberApprox,
    dedupKey: key,
    duplicateOf: null,
    repostCount: 0,
  });
}
