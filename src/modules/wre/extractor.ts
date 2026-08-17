/**
 * WRE listing extractor — free-text WhatsApp message → structured apartment.
 *
 * Real-estate groups are pure human free text ("דירת 4 חד' משופצת ברוטשילד 12
 * ת״א, קומה 3 עם מעלית, 2.4 מיליון, לפרטים 050-1234567"), so this is an AI pass
 * rather than per-group regex. The per-group knobs (`hint`, `defaultCity`) are
 * folded into the prompt instead of into patterns.
 *
 * Rules of the road:
 *  - JSON only, never prose. A parse failure degrades to "not a listing" and the
 *    message is dropped — it must never throw into the socket handler.
 *  - Only *offers* count. "מחפש דירה 3 חדרים בבת ים" is a want-ad; the broker is
 *    hunting supply, so `isListing` is false for those.
 */
import { chat } from "@/modules/ai/provider";
import { logger } from "@/modules/wa-engine/logger";
import { extractPhone } from "./phone";
import type { ExtractedListing, DealType } from "./models";

const NOT_A_LISTING: ExtractedListing = {
  isListing: false,
  dealType: "unknown",
  city: "",
  street: "",
  houseNumber: "",
  neighborhood: "",
  rooms: null,
  floor: null,
  price: null,
  sizeSqm: null,
  contactPhone: "",
  features: [],
  confidence: 0,
};

const SYSTEM = `אתה מחלץ פרטי דירות מהודעות וואטסאפ בקבוצות נדל"ן בישראל.
החזר אך ורק אובייקט JSON תקין, בלי טקסט נוסף, בלי markdown, בלי \`\`\`.

מבנה:
{
  "isListing": boolean,
  "dealType": "sale" | "rent" | "roommate" | "unknown",
  "city": string,
  "street": string,
  "houseNumber": string,
  "neighborhood": string,
  "rooms": number | null,
  "floor": number | null,
  "price": number | null,
  "sizeSqm": number | null,
  "contactPhone": string,
  "features": string[],
  "confidence": number
}

כללים:
- isListing=true רק אם ההודעה *מציעה* דירה (למכירה/להשכרה/שותפים).
  הודעת "מחפש/מבקש דירה" היא בקשה ולא היצע — isListing=false.
  פטפוט ("תודה", "עדיין רלוונטי?", "מישהו יודע?") — isListing=false.
- city: שם היישוב בלבד, בלי "עיר"/"ב-". אם לא מוזכר — מחרוזת ריקה.
- street: שם הרחוב בלבד, בלי "רחוב"/"רח'"/"שדרות". אם לא מוזכר — ריק.
  אל תכלול סוג נכס בשם הרחוב: ב"דירת גן בורוכוב 3" הרחוב הוא "בורוכוב" (לא "גן בורוכוב").
  כך גם "פנטהאוז"/"דופלקס"/"מיני פנטהאוז"/"דירת גג"/"סטודיו" — הם תיאור הנכס, לא הרחוב.
- houseNumber: מספר הבית בלבד ("12"). בלי מספר דירה/כניסה. אם אין — ריק.
- neighborhood: שכונה אם צוינה (למשל "רמת אליהו") — שימושי כשאין רחוב.
- price: מספר בשקלים בלבד. נרמל: "1.4 מיליון"→1400000, "5,500 ש״ח"→5500, "2.4M"→2400000.
  אם המחיר לא מוזכר או "גמיש"/"להשיג" — null.
- rooms: מספר, כולל חצאים ("3.5 חד'"→3.5).
- floor: קומה כמספר. "קרקע"→0. אם לא מוזכר — null.
- sizeSqm: שטח במ"ר כמספר בלבד.
- contactPhone: טלפון שמופיע *בגוף ההודעה*, ספרות בלבד. אם אין — ריק.
- features: עד 6 מאפיינים קצרים בעברית (מעלית, מרפסת, חניה, ממ״ד, משופצת, מרוהטת).
- confidence: 0..1 — כמה אתה בטוח שזו הצעת דירה אמיתית *ושהכתובת שחילצת נכונה*.
  אם הרחוב/עיר מעורפלים או נחשתם — הורד את הציון.
- מירכאות בתוך ערך טקסט (למשל קיצור כמו ממ"ד/ת"א) שוברות את ה-JSON. כתוב אותן
  תמיד עם גרשיים עבריים (״) ולא עם מירכאות ASCII ("), למשל "ממ״ד" ולא "ממ"ד".`;

/** Prices outside these bounds are extraction noise (a phone number read as a price, etc.). */
const PRICE_BOUNDS: Record<DealType, [number, number]> = {
  sale: [200_000, 40_000_000],
  rent: [500, 100_000],
  roommate: [400, 20_000],
  unknown: [400, 40_000_000],
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Pull the JSON object out of a reply that may still be wrapped in prose/fences. */
function parseJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerce(o: Record<string, unknown>, rawText: string): ExtractedListing {
  const dealType = (["sale", "rent", "roommate", "unknown"] as const).includes(o.dealType as DealType)
    ? (o.dealType as DealType)
    : "unknown";

  let price = num(o.price);
  if (price !== null) {
    const [lo, hi] = PRICE_BOUNDS[dealType];
    if (price < lo || price > hi) price = null;
  }

  const rooms = num(o.rooms);
  const floor = num(o.floor);
  const sizeSqm = num(o.sizeSqm);

  return {
    isListing: o.isListing === true,
    dealType,
    city: str(o.city),
    street: str(o.street),
    houseNumber: str(o.houseNumber),
    neighborhood: str(o.neighborhood),
    // Sanity bounds: an apartment with 40 rooms is a misparse, not a mansion.
    rooms: rooms !== null && rooms > 0 && rooms <= 20 ? rooms : null,
    floor: floor !== null && floor >= -2 && floor <= 100 ? floor : null,
    price,
    sizeSqm: sizeSqm !== null && sizeSqm > 5 && sizeSqm <= 2000 ? sizeSqm : null,
    // Regex first, model second: see `extractPhone`. The model's answer is only a
    // fallback for shapes the pattern misses (e.g. a landline), and even then it
    // is stripped to digits.
    contactPhone: extractPhone(rawText) || str(o.contactPhone).replace(/\D/g, ""),
    features: Array.isArray(o.features) ? o.features.slice(0, 6).map(str).filter(Boolean) : [],
    confidence: clamp01(num(o.confidence) ?? 0),
  };
}

export interface ExtractContext {
  /** The group's free-text structure hint, if the broker configured one. */
  hint?: string;
  /** The group's default city, used only to tell the model what to assume when the text omits it. */
  defaultCity?: string;
}

/**
 * Extract an apartment from one message. Never throws — on any failure the
 * message is reported as "not a listing" and skipped.
 */
export async function extractListing(text: string, ctx: ExtractContext = {}): Promise<ExtractedListing> {
  if (!text.trim()) return NOT_A_LISTING;

  const context: string[] = [];
  if (ctx.defaultCity?.trim()) {
    context.push(
      `הקבוצה הזו עוסקת בעיקר ב"${ctx.defaultCity.trim()}". אם ההודעה לא מציינת עיר — השאר את השדה city ריק (המערכת תשלים), אל תנחש עיר אחרת.`
    );
  }
  if (ctx.hint?.trim()) context.push(`רמז על סגנון הכתיבה בקבוצה: ${ctx.hint.trim()}`);

  const messages = [
    { role: "system" as const, content: SYSTEM },
    ...(context.length ? [{ role: "system" as const, content: context.join("\n") }] : []),
    { role: "user" as const, content: text.slice(0, 4000) },
  ];

  // One retry on a malformed reply before giving up: reproduced live against a
  // real "פינוי בינוי"-style message where the model's JSON came back
  // unparsable on roughly 1 in 3 calls despite a generous token budget (800 —
  // well above what these replies actually run, so it isn't token truncation,
  // just an occasional bad generation from a 70B model). A second attempt at
  // the *same* message reliably parsed. Without the retry that flakiness
  // silently turns a real listing into "not a listing" and the address is
  // gone — worth one extra call to not lose it.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await chat(messages, { maxTokens: 800 });
      const parsed = parseJson(res.text);
      if (parsed) return coerce(parsed, text);

      logger.warn(
        "wre",
        `extractor returned non-JSON (attempt ${attempt}/2, ${res.text.length} chars): ${res.text.slice(0, 500)}`
      );
    } catch (err) {
      logger.warn(
        "wre",
        `extract failed (attempt ${attempt}/2): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NOT_A_LISTING;
}
