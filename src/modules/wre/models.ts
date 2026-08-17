/**
 * WRE (WhatsApp Real Estate) domain types.
 *
 * WRE rides the *same* QR-based Baileys engine as WTM/BTB/WTA (`wa-engine`),
 * but its purpose is listing capture for a broker: the connected number sits in
 * many real-estate groups, and every message is run through an AI extractor to
 * pull out the apartment (city / street / number / rooms / price), which is then
 * geocoded to a map pin. The broker reads a map instead of scrolling groups.
 *
 * Like WTA, sockets are ALWAYS-ON (namespaced `wre_<clientId>`) — a sleeping
 * socket misses messages, and a missed message is a missed listing.
 *
 * Like WTM/WTA these are native-Mongo/ObjectId documents (NOT bootWhat's
 * `BaseEntity`), in dedicated `wre_*` collections. `clientId` = `WreClient._id`.
 */
import type { ObjectId } from "mongodb";

export type PlanType = "trial" | "monthly" | "annual" | "custom";
export type BillingStatus = "active" | "overdue" | "trial" | "suspended" | "cancelled";

/**
 * A group the client wants harvested.
 *
 * `defaultCity` exists because most real-estate groups are city-scoped ("דירות
 * להשכרה בקרית מלאכי") and members therefore omit the city entirely — they post
 * "וייצמן 13, 4 חדרים". Without a group-level default, such a message can never
 * be geocoded. It is the fallback, never an override: a city named in the text
 * always wins.
 *
 * `hint` is free text describing how this group tends to write listings; it is
 * injected into the extractor prompt. This is the per-group "structure" knob.
 */
export interface WreWatchedGroup {
  groupId: string; // bare (no `@g.us`, no `:device`)
  groupName: string;
  enabled: boolean;
  defaultCity: string;
  hint: string;
}

export interface WreClient {
  _id: ObjectId;
  name: string;
  phone: string;
  active: boolean;

  planType: PlanType;
  planPrice: number;
  billingStatus: BillingStatus;
  nextBillingDate: Date | null;

  contractEmail: string;
  tags: string[];
  internalNotes: string;

  /** Groups harvested for listings. Only enabled groups are ever processed. */
  watchedGroups: WreWatchedGroup[];

  /**
   * Phone numbers (local IL form, "0501234567") allowed to use the
   * location→radius listing query in DM. Everyone else's direct messages to
   * this number are ignored by WRE entirely — this bot only ever *speaks* in
   * groups (never posts) except to these pre-approved numbers, so it can't be
   * mistaken for spam by a stranger who messages the broker's number.
   */
  allowedQueryPhones: string[];

  /**
   * Minimum extractor confidence (0..1) to accept a listing at all. Below this
   * the message is treated as not-a-listing and dropped.
   */
  minConfidence: number;

  /** Skip messages shorter than this many chars (kills "תודה"/"עדיין רלוונטי?" chatter before it reaches the AI). */
  minTextLength: number;

  /** Collapse repeat/cross-posts of the same apartment into one listing. */
  dedupEnabled: boolean;
  /** Window (hours) in which an identical apartment counts as a repost rather than a new listing. */
  dedupWindowHours: number;

  createdAt: Date;
  updatedAt: Date;
}

export type WreClientInput = Omit<WreClient, "_id" | "createdAt" | "updatedAt">;

// ─── Listings ────────────────────────────────────────────────────────────────

/**
 * Status of one captured message.
 *
 * NOTE: there is **one row per message** from a watched group — not one row per
 * accepted listing. Everything is kept, including the chatter, because the
 * broker must be able to see what the extractor did with each message and catch
 * what it got wrong. A silently dropped message is an apartment nobody ever
 * learns was missed.
 *
 *   mapped       — "טופל": values extracted and placed on the map.
 *   needs_review — an apartment, but the address is unusable/ambiguous. Sits in
 *                  the review queue with a draggable pin. A broker driving to a
 *                  wrong address is worse than one unmapped listing, so anything
 *                  the geocoder is unsure about lands here rather than on the map.
 *   not_listing  — the extractor says it isn't an apartment *offer* (chatter, or
 *                  a want-ad like "מחפש דירה").
 *   low_confidence — read as an apartment, but below the client's confidence bar.
 *                  Kept visible rather than dropped: this is where a real listing
 *                  the model was unsure about would otherwise vanish.
 *   duplicate    — the same apartment already captured inside the dedup window.
 *   rejected     — a human marked it as not a real listing.
 *   skipped      — never sent to the extractor (below `minTextLength`).
 */
export type ListingStatus =
  | "mapped"
  | "needs_review"
  | "not_listing"
  | "low_confidence"
  | "duplicate"
  | "rejected"
  | "skipped";

/** Statuses that represent a usable apartment the broker should act on. */
export const ACTIONABLE_STATUSES: ListingStatus[] = ["mapped", "needs_review"];

export type DealType = "sale" | "rent" | "roommate" | "unknown";

/** Why a listing needs review — drives the hint shown next to the draggable pin. */
export type ReviewReason =
  | "no_address"
  | "no_city"
  /**
   * @deprecated No longer produced going forward — a missing house number now
   * geocodes against a "1" placeholder and maps directly (see `houseNumberApprox`
   * below) instead of sitting in review. Kept in the type only because older
   * rows in the database still carry this value.
   */
  | "no_house_number"
  | "geocode_miss"
  | "low_score"
  | "geocode_error"
  | null;

export interface WreListing {
  _id: ObjectId;
  clientId: string;

  // ── provenance (where it came from) ──
  groupJid: string;
  groupName: string;
  msgId: string | null;
  senderPhone: string;
  senderName: string;
  /** The original message, verbatim — the broker must always be able to see the source. */
  rawText: string;
  messageAt: Date;

  // ── extraction (AI) ──
  status: ListingStatus;
  dealType: DealType;
  city: string;
  street: string;
  houseNumber: string;
  neighborhood: string;
  rooms: number | null;
  floor: number | null;
  /** In shekels. Normalized from "1.4 מיליון" / "5,500 ש\"ח" etc. */
  price: number | null;
  /** Built area in m². */
  sizeSqm: number | null;
  /** Contact phone found *inside* the message text (often differs from the sender). */
  contactPhone: string;
  /** 0..1, self-reported by the extractor. */
  confidence: number;
  /** Short free-text extras the extractor thought were worth keeping (מעלית, מרפסת, משופצת…). */
  features: string[];

  // ── geocoding ──
  lat: number | null;
  lng: number | null;
  /** Provider match score (govmap: ~4000+ exact, ~250 weak). Null when never geocoded. */
  geocodeScore: number | null;
  /** The address string the provider actually matched — lets a human eyeball a mis-geocode. */
  geocodeMatch: string | null;
  geocodeProvider: string | null;
  geocodedAt: Date | null;
  /** True once a human dragged the pin; protects it from being overwritten by re-geocoding. */
  manualPin: boolean;
  reviewReason: ReviewReason;
  /**
   * True when the post never gave a house number and `houseNumber` here is a
   * "1" placeholder used only to get a real, geocodable pin on the right
   * street — it is not the actual building. Every surface that displays the
   * address must disclose this; see `geocodeAddress` in geo/index.ts.
   */
  houseNumberApprox: boolean;

  // ── dedup ──
  /** Normalized identity of the apartment (city|street|number|rooms). Empty when address is unusable. */
  dedupKey: string;
  /** For `duplicate` rows: the listing this repeats. */
  duplicateOf: string | null;
  /** How many times this apartment was re-posted (on the canonical row). */
  repostCount: number;
  lastSeenAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type WreListingInput = Omit<WreListing, "_id" | "createdAt" | "updatedAt">;

/** The extractor's output — the AI-facing shape, before provenance/geocoding are attached. */
export interface ExtractedListing {
  isListing: boolean;
  dealType: DealType;
  city: string;
  street: string;
  houseNumber: string;
  neighborhood: string;
  rooms: number | null;
  floor: number | null;
  price: number | null;
  sizeSqm: number | null;
  contactPhone: string;
  features: string[];
  confidence: number;
}

// ─── Geocode cache ───────────────────────────────────────────────────────────

/**
 * Persistent geocode cache, keyed by the normalized query. Real-estate groups
 * repeat the same buildings constantly, so this both cuts provider load and
 * keeps results stable across restarts.
 */
export interface WreGeoCache {
  _id: ObjectId;
  /** Normalized query key (see `geo/normalize.ts`). */
  query: string;
  provider: string;
  lat: number | null;
  lng: number | null;
  score: number | null;
  matchedText: string | null;
  /** Cached misses too — a miss is expensive to rediscover and unlikely to change. */
  hit: boolean;
  createdAt: Date;
}

// ─── Location→radius query (DM flow) ──────────────────────────────────────────

/**
 * Pending "waiting for a radius" state after an allowed number shares a
 * location. TTL-expired (see `ensureWreIndexes`) so an abandoned conversation
 * doesn't leave a stale point around to confuse a later, unrelated message.
 */
export interface WreQuerySession {
  _id: ObjectId;
  clientId: string;
  /** International digits, matching `resolvePhone`'s JID-derived form (e.g. "972501234567"). */
  phone: string;
  lat: number;
  lng: number;
  createdAt: Date;
}
