/**
 * WRE location→radius query — the one thing this bot ever says unprompted to
 * an individual (never to a stranger, never in a group; see
 * `WreClient.allowedQueryPhones`).
 *
 * Flow: an allowed number shares a WhatsApp location → the bot asks for a
 * radius → the number answers with a number (km, or meters if they say so) →
 * the bot replies with every `mapped` listing inside that radius, nearest
 * first. Anything else from an allowed number (chatter, a question) is left
 * alone — only an unambiguous location share starts this.
 */
import type { WAMessage } from "@whiskeysockets/baileys";
import { sendMessage } from "@/modules/wa-engine/whatsappManager";
import { logger } from "@/modules/wa-engine/logger";
import { toWaMe } from "./phone";
import { haversineKm } from "./geo/distance";
import { getQuerySession, setQuerySession, clearQuerySession, listMappedWithCoords } from "./repository";
import type { WreClient } from "./models";

const MAX_RADIUS_KM = 300;
const MAX_RESULTS = 20;

/** Broker enters local IL numbers ("0501234567"); senderPhone is JID digits ("972501234567"). */
export function isAllowedQueryPhone(client: WreClient, senderPhone: string): boolean {
  if (!senderPhone) return false;
  // `allowedQueryPhones` postdates existing WreClient docs, so it may be absent
  // on old records. Digits are stripped before `toWaMe` because it requires an
  // exact "0XXXXXXXXX" shape — a dash-formatted number ("052-987-6543") fails
  // that regex and falls through unconverted, silently never matching.
  return (client.allowedQueryPhones ?? []).some((p) => toWaMe(p.replace(/\D/g, "")) === senderPhone);
}

/** First number in the text; meters if explicitly marked, km otherwise. */
function parseRadiusKm(text: string): number | null {
  const t = (text || "").trim();
  const meters = t.match(/(\d+(?:\.\d+)?)\s*(מטר|מ['׳]|m\b)/i);
  if (meters) {
    const n = Number(meters[1]);
    return Number.isFinite(n) && n > 0 ? n / 1000 : null;
  }
  const km = t.match(/(\d+(?:\.\d+)?)/);
  if (!km) return null;
  const n = Number(km[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_RADIUS_KM) : null;
}

const DEAL_LABEL: Record<string, string> = { sale: "למכירה", rent: "להשכרה", roommate: "שותפים", unknown: "" };

function formatReply(
  matches: Array<{ city: string; street: string; houseNumber: string; rooms: number | null; price: number | null; dealType: string; lat: number; lng: number; distanceKm: number }>,
  radiusKm: number
): string {
  if (matches.length === 0) {
    return `לא נמצאו דירות בטווח ${radiusKm} ק״מ מהמיקום ששלחת. אפשר לשלוח מיקום שוב עם טווח גדול יותר.`;
  }

  const lines = matches.map((l, i) => {
    const addr = [l.street, l.houseNumber].filter(Boolean).join(" ") + (l.city ? `, ${l.city}` : "");
    const deal = DEAL_LABEL[l.dealType] || "";
    const rooms = l.rooms ? `${l.rooms} חד׳` : "";
    const price = l.price ? `₪${l.price.toLocaleString("he-IL")}` : "";
    const details = [deal, rooms, price].filter(Boolean).join(" · ");
    const mapLink = `https://maps.google.com/maps?q=${l.lat},${l.lng}`;
    return `${i + 1}. ${addr}${details ? ` — ${details}` : ""}\n📍 ${l.distanceKm.toFixed(1)} ק״מ ממך · ${mapLink}`;
  });

  const header = `נמצאו ${matches.length} דירות בטווח ${radiusKm} ק״מ ממך:`;
  return [header, ...lines].join("\n\n");
}

/**
 * Handle one DM from an allowed number. Only two message shapes matter here:
 * a location share (starts/replaces the pending query) and a text reply while
 * a query is pending (the radius). Everything else is ignored.
 */
export async function handleLocationQuery(
  waTenantId: string,
  client: WreClient,
  senderJid: string,
  senderPhone: string,
  msg: WAMessage
): Promise<void> {
  const clientId = client._id.toString();
  const loc = msg.message?.locationMessage;

  try {
    if (loc && typeof loc.degreesLatitude === "number" && typeof loc.degreesLongitude === "number") {
      await setQuerySession(clientId, senderPhone, loc.degreesLatitude, loc.degreesLongitude);
      await sendMessage(waTenantId, senderJid, {
        text: 'קיבלתי את המיקום 📍 באיזה טווח לחפש? (למשל: "10" או "10 ק״מ")',
      });
      return;
    }

    const pending = await getQuerySession(clientId, senderPhone);
    if (!pending) return; // no location on file — nothing to do with plain text

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    const radiusKm = parseRadiusKm(text);
    if (radiusKm === null) {
      await sendMessage(waTenantId, senderJid, { text: 'לא הבנתי את הטווח — כתוב מספר בק״מ (למשל: "10").' });
      return; // keep the pending location, let them retry
    }

    const all = await listMappedWithCoords(clientId);
    const matches = all
      .filter((l): l is typeof l & { lat: number; lng: number } => l.lat != null && l.lng != null)
      .map((l) => ({ ...l, distanceKm: haversineKm({ lat: pending.lat, lng: pending.lng }, { lat: l.lat, lng: l.lng }) }))
      .filter((l) => l.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_RESULTS);

    await sendMessage(waTenantId, senderJid, { text: formatReply(matches, radiusKm) });
    await clearQuerySession(clientId, senderPhone);
  } catch (err) {
    logger.warn("wre", `location query failed: ${err instanceof Error ? err.message : String(err)}`, { clientId });
  }
}
