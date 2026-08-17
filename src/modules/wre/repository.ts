/**
 * WRE data access — native Mongo driver over dedicated `wre_*` collections.
 * Mirrors WTM/WTA's repository shape, scoped to WRE's own collections so the
 * services never share client data.
 */
import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/core/db/mongo";
import type {
  WreClient,
  WreClientInput,
  WreListing,
  WreListingInput,
  WreGeoCache,
  WreQuerySession,
  ListingStatus,
} from "./models";

let indexesReady: Promise<void> | null = null;

export function ensureWreIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("wre_clients").createIndex({ phone: 1 }, { unique: true }),
        db.collection("wre_listings").createIndex({ clientId: 1, createdAt: -1 }),
        db.collection("wre_listings").createIndex({ clientId: 1, status: 1, createdAt: -1 }),
        // Dedup probe: newest matching apartment for a client within the window.
        db.collection("wre_listings").createIndex({ clientId: 1, dedupKey: 1, lastSeenAt: -1 }),
        // Guards against double-processing the same WhatsApp message on reconnect/replay.
        db.collection("wre_listings").createIndex({ clientId: 1, msgId: 1 }, { sparse: true }),
        db.collection("wre_geocache").createIndex({ query: 1 }, { unique: true }),
        // Addresses do not move, but re-checking yearly lets new buildings appear.
        db.collection("wre_geocache").createIndex({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }),
        db.collection("wre_query_sessions").createIndex({ clientId: 1, phone: 1 }, { unique: true }),
        // Abandon a "waiting for radius" conversation after 15 minutes so a much
        // later, unrelated message can't be misread as the radius answer.
        db.collection("wre_query_sessions").createIndex({ createdAt: 1 }, { expireAfterSeconds: 15 * 60 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

const clientsCol = async () => (await getDb()).collection<WreClient>("wre_clients");
const listingsCol = async () => (await getDb()).collection<WreListing>("wre_listings");
const geoCacheCol = async () => (await getDb()).collection<WreGeoCache>("wre_geocache");
const querySessionsCol = async () => (await getDb()).collection<WreQuerySession>("wre_query_sessions");

const CLIENT_DEFAULTS: Omit<WreClientInput, "name" | "phone"> = {
  active: true,
  planType: "trial",
  planPrice: 0,
  billingStatus: "trial",
  nextBillingDate: null,
  contractEmail: "",
  tags: [],
  internalNotes: "",
  watchedGroups: [],
  allowedQueryPhones: [],
  minConfidence: 0.5,
  // 0 = every message goes through the extractor. Anything above it is a cost
  // saver that trades away visibility: shorter messages are stored as `skipped`
  // with no extracted values, so a terse-but-real post ("רוטשילד 12, 2.4מ") would
  // never be read. Raise it only if provider cost or rate limits demand it.
  minTextLength: 0,
  dedupEnabled: true,
  dedupWindowHours: 72,
};

// ─── Clients ─────────────────────────────────────────────────────────────────

export async function listWreClients(): Promise<WreClient[]> {
  const col = await clientsCol();
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

export async function getWreClient(id: string): Promise<WreClient | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await clientsCol();
  return col.findOne({ _id: new ObjectId(id) } as Filter<WreClient>);
}

export async function createWreClient(name: string, phone: string): Promise<WreClient> {
  await ensureWreIndexes();
  const now = new Date();
  const doc = { ...CLIENT_DEFAULTS, name, phone, createdAt: now, updatedAt: now } as WreClient;
  const col = await clientsCol();
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateWreClient(id: string, patch: Partial<WreClientInput>): Promise<WreClient | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await clientsCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) } as Filter<WreClient>,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ?? null;
}

export async function deleteWreClient(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await clientsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) } as Filter<WreClient>);
  if (result.deletedCount === 1) {
    const listings = await listingsCol();
    await listings.deleteMany({ clientId: id } as Filter<WreListing>).catch(() => {});
    return true;
  }
  return false;
}

// ─── Listings ────────────────────────────────────────────────────────────────

export interface ListingQuery {
  clientId: string;
  status?: ListingStatus | ListingStatus[];
  city?: string;
  dealType?: string;
  minRooms?: number;
  maxRooms?: number;
  minPrice?: number;
  maxPrice?: number;
  /** Only listings seen since this moment. */
  since?: Date;
  /** Free-text over the raw message / street / city. */
  search?: string;
  limit?: number;
  skip?: number;
}

function buildListingFilter(q: ListingQuery): Filter<WreListing> {
  const f: Record<string, unknown> = { clientId: q.clientId };

  if (q.status) f.status = Array.isArray(q.status) ? { $in: q.status } : q.status;
  if (q.city) f.city = q.city;
  if (q.dealType) f.dealType = q.dealType;
  if (q.since) f.lastSeenAt = { $gte: q.since };

  if (q.minRooms != null || q.maxRooms != null) {
    f.rooms = {
      ...(q.minRooms != null ? { $gte: q.minRooms } : {}),
      ...(q.maxRooms != null ? { $lte: q.maxRooms } : {}),
    };
  }
  if (q.minPrice != null || q.maxPrice != null) {
    f.price = {
      ...(q.minPrice != null ? { $gte: q.minPrice } : {}),
      ...(q.maxPrice != null ? { $lte: q.maxPrice } : {}),
    };
  }
  if (q.search?.trim()) {
    // Escaped: broker-supplied text must never be able to inject regex syntax.
    const rx = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    f.$or = [{ rawText: rx }, { street: rx }, { city: rx }, { neighborhood: rx }];
  }
  return f as Filter<WreListing>;
}

export async function listListings(q: ListingQuery): Promise<WreListing[]> {
  const col = await listingsCol();
  return col
    .find(buildListingFilter(q))
    .sort({ lastSeenAt: -1 })
    .skip(q.skip ?? 0)
    .limit(Math.min(q.limit ?? 200, 1000))
    .toArray();
}

export async function countListings(q: ListingQuery): Promise<number> {
  const col = await listingsCol();
  return col.countDocuments(buildListingFilter(q));
}

export async function getListing(clientId: string, id: string): Promise<WreListing | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await listingsCol();
  return col.findOne({ _id: new ObjectId(id), clientId } as Filter<WreListing>);
}

export async function createListing(input: WreListingInput): Promise<WreListing> {
  await ensureWreIndexes();
  const now = new Date();
  const col = await listingsCol();
  const doc = { ...input, createdAt: now, updatedAt: now } as WreListing;
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateListing(
  clientId: string,
  id: string,
  patch: Partial<WreListingInput>
): Promise<WreListing | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await listingsCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), clientId } as Filter<WreListing>,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ?? null;
}

export async function deleteListing(clientId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await listingsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id), clientId } as Filter<WreListing>);
  return result.deletedCount === 1;
}

/** Has this exact WhatsApp message already been turned into a listing? */
export async function listingExistsForMessage(clientId: string, msgId: string): Promise<boolean> {
  const col = await listingsCol();
  return (await col.countDocuments({ clientId, msgId } as Filter<WreListing>, { limit: 1 })) > 0;
}

/**
 * Find the canonical (non-duplicate) listing for the same apartment inside the
 * dedup window — the row a repost should fold into.
 */
export async function findDuplicate(clientId: string, key: string, since: Date): Promise<WreListing | null> {
  if (!key) return null;
  const col = await listingsCol();
  return col.findOne(
    {
      clientId,
      dedupKey: key,
      status: { $ne: "duplicate" },
      lastSeenAt: { $gte: since },
    } as Filter<WreListing>,
    { sort: { lastSeenAt: -1 } }
  );
}

/** Record that a known apartment was posted again. */
export async function bumpRepost(id: ObjectId, at: Date): Promise<void> {
  const col = await listingsCol();
  await col.updateOne({ _id: id } as Filter<WreListing>, {
    $inc: { repostCount: 1 },
    $set: { lastSeenAt: at, updatedAt: new Date() },
  });
}

/** Distinct cities present in a client's listings — powers the map/table filter. */
export async function listCities(clientId: string): Promise<string[]> {
  const col = await listingsCol();
  const cities = await col.distinct("city", { clientId, city: { $ne: "" } } as Filter<WreListing>);
  return (cities as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b, "he"));
}

export async function countByStatus(clientId: string): Promise<Record<string, number>> {
  const col = await listingsCol();
  const rows = await col
    .aggregate<{ _id: string; count: number }>([
      { $match: { clientId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

// ─── Geocode cache ───────────────────────────────────────────────────────────

export async function readCache(query: string): Promise<WreGeoCache | null> {
  const col = await geoCacheCol();
  return col.findOne({ query } as Filter<WreGeoCache>);
}

export async function writeCache(entry: Omit<WreGeoCache, "_id" | "createdAt">): Promise<void> {
  await ensureWreIndexes();
  const col = await geoCacheCol();
  // upsert: concurrent lookups of the same address must not throw on the unique index.
  await col.updateOne(
    { query: entry.query } as Filter<WreGeoCache>,
    { $set: { ...entry }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

// ─── Location→radius query (DM flow) ──────────────────────────────────────────

export async function getQuerySession(clientId: string, phone: string): Promise<WreQuerySession | null> {
  const col = await querySessionsCol();
  return col.findOne({ clientId, phone } as Filter<WreQuerySession>);
}

/** A fresh location share always replaces any prior pending one for that phone. */
export async function setQuerySession(clientId: string, phone: string, lat: number, lng: number): Promise<void> {
  await ensureWreIndexes();
  const col = await querySessionsCol();
  await col.updateOne(
    { clientId, phone } as Filter<WreQuerySession>,
    { $set: { lat, lng, createdAt: new Date() } },
    { upsert: true }
  );
}

export async function clearQuerySession(clientId: string, phone: string): Promise<void> {
  const col = await querySessionsCol();
  await col.deleteOne({ clientId, phone } as Filter<WreQuerySession>);
}

/** Mapped listings with real coordinates, for the location→radius search. */
export async function listMappedWithCoords(
  clientId: string
): Promise<Array<Pick<WreListing, "_id" | "city" | "street" | "houseNumber" | "rooms" | "price" | "dealType" | "lat" | "lng">>> {
  const col = await listingsCol();
  return col
    .find(
      { clientId, status: "mapped", lat: { $ne: null }, lng: { $ne: null } } as Filter<WreListing>,
      { projection: { city: 1, street: 1, houseNumber: 1, rooms: 1, price: 1, dealType: 1, lat: 1, lng: 1 } }
    )
    .toArray();
}
