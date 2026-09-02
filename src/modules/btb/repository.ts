/**
 * BTB data access — native Mongo driver over the legacy
 * `btbaccounts`/`statusposts`/`statusviews` collections.
 */
import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/core/db/mongo";
import type { BtbAccount, StatusPost, StatusView } from "./models";

let indexesReady: Promise<void> | null = null;

export function ensureBtbIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("btbaccounts").createIndex({ phone: 1 }, { unique: true }),
        db.collection("statusposts").createIndex({ accountId: 1, msgId: 1 }, { unique: true }),
        db.collection("statusposts").createIndex({ accountId: 1, postedAt: -1 }),
        db.collection("statusviews").createIndex({ accountId: 1, msgId: 1, viewerJid: 1 }, { unique: true }),
        db.collection("statusviews").createIndex({ accountId: 1, viewerJid: 1 }),
        db.collection("statusdeletions").createIndex({ accountId: 1, msgId: 1 }, { unique: true }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

const accountsCol = async () => (await getDb()).collection<BtbAccount>("btbaccounts");
const postsCol = async () => (await getDb()).collection<StatusPost>("statusposts");
const viewsCol = async () => (await getDb()).collection<StatusView>("statusviews");
/**
 * Tombstones for deleted statuses. `onStatusPost` upserts by `{accountId,msgId}`,
 * so without this a status the user deleted comes straight back the next time
 * WhatsApp re-delivers that message (reconnect, resync). A tombstone is cheap and
 * makes the delete stick.
 */
const deletionsCol = async () =>
  (await getDb()).collection<{ accountId: ObjectId; msgId: string; deletedAt: Date }>("statusdeletions");

export async function markStatusDeleted(accountId: string, msgId: string): Promise<void> {
  const col = await deletionsCol();
  await col.updateOne(
    { accountId: new ObjectId(accountId), msgId },
    { $setOnInsert: { accountId: new ObjectId(accountId), msgId, deletedAt: new Date() } },
    { upsert: true }
  );
}

export async function isStatusDeleted(accountId: string, msgId: string): Promise<boolean> {
  const col = await deletionsCol();
  return (await col.countDocuments({ accountId: new ObjectId(accountId), msgId }, { limit: 1 })) > 0;
}

/** Remove a status by its WhatsApp message id (the shape a revoke event gives us). */
export async function deleteStatusPostByMsgId(accountId: string, msgId: string): Promise<boolean> {
  const oid = new ObjectId(accountId);
  const views = await viewsCol();
  await views.deleteMany({ accountId: oid, msgId } as Filter<StatusView>);
  const posts = await postsCol();
  const res = await posts.deleteOne({ accountId: oid, msgId } as Filter<StatusPost>);
  await markStatusDeleted(accountId, msgId);
  return (res.deletedCount ?? 0) > 0;
}

export async function listBtbAccounts(): Promise<BtbAccount[]> {
  const col = await accountsCol();
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

export async function getBtbAccount(id: string): Promise<BtbAccount | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await accountsCol();
  return col.findOne({ _id: new ObjectId(id) } as Filter<BtbAccount>);
}

export async function createBtbAccount(name: string, phone: string): Promise<BtbAccount> {
  await ensureBtbIndexes();
  const now = new Date();
  const doc: Omit<BtbAccount, "_id"> = {
    name,
    phone,
    active: true,
    targetFollowers: 1000,
    videoResolution: 1080,
    tags: [],
    internalNotes: "",
    createdAt: now,
    updatedAt: now,
  };
  const col = await accountsCol();
  const result = await col.insertOne(doc as BtbAccount);
  return { ...doc, _id: result.insertedId };
}

export async function updateBtbAccount(id: string, patch: Partial<BtbAccount>): Promise<BtbAccount | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await accountsCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) } as Filter<BtbAccount>,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ?? null;
}

export async function deleteBtbAccount(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await accountsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) } as Filter<BtbAccount>);
  return result.deletedCount === 1;
}

export async function countStatusPosts(accountId: string): Promise<number> {
  const col = await postsCol();
  return col.countDocuments({ accountId: new ObjectId(accountId) } as Filter<StatusPost>);
}

export async function countStatusViews(accountId: string): Promise<number> {
  const col = await viewsCol();
  return col.countDocuments({ accountId: new ObjectId(accountId) } as Filter<StatusView>);
}

export async function countUniqueViewers(accountId: string): Promise<number> {
  const col = await viewsCol();
  const jids = await col.distinct("viewerJid", { accountId: new ObjectId(accountId) } as Filter<StatusView>);
  return jids.length;
}

export async function listRecentStatusPosts(accountId: string, limit = 50): Promise<StatusPost[]> {
  const col = await postsCol();
  return col
    .find({ accountId: new ObjectId(accountId) } as Filter<StatusPost>)
    .sort({ postedAt: -1 })
    .limit(limit)
    .toArray();
}

export async function findStatusPostById(accountId: string, statusId: string): Promise<StatusPost | null> {
  if (!ObjectId.isValid(statusId)) return null;
  const col = await postsCol();
  return col.findOne({ _id: new ObjectId(statusId), accountId: new ObjectId(accountId) } as Filter<StatusPost>);
}

export async function listViewersForStatus(accountId: string, msgId: string): Promise<StatusView[]> {
  const col = await viewsCol();
  return col
    .find({ accountId: new ObjectId(accountId), msgId } as Filter<StatusView>)
    .sort({ viewedAt: -1 })
    .toArray();
}

export async function topViewers(accountId: string, limit = 1000) {
  const col = await viewsCol();
  return col
    .aggregate<{ _id: string; statusesViewed: number; firstViewedAt: Date; lastViewedAt: Date }>([
      { $match: { accountId: new ObjectId(accountId) } },
      { $group: { _id: "$viewerJid", statusesViewed: { $sum: 1 }, firstViewedAt: { $min: "$viewedAt" }, lastViewedAt: { $max: "$viewedAt" } } },
      { $sort: { statusesViewed: -1, lastViewedAt: -1 } },
      { $limit: limit },
    ])
    .toArray();
}

/**
 * Delete a single status post + all its recorded views. Returns the removed
 * post (so the caller can attempt the WhatsApp-side delete-for-everyone using
 * its `msgId`), or null if it wasn't found.
 */
export async function deleteStatusPost(accountId: string, statusId: string): Promise<StatusPost | null> {
  if (!ObjectId.isValid(statusId)) return null;
  const posts = await postsCol();
  const post = await posts.findOne({ _id: new ObjectId(statusId), accountId: new ObjectId(accountId) } as Filter<StatusPost>);
  if (!post) return null;
  const views = await viewsCol();
  await views.deleteMany({ accountId: new ObjectId(accountId), msgId: post.msgId } as Filter<StatusView>);
  await posts.deleteOne({ _id: post._id } as Filter<StatusPost>);
  await markStatusDeleted(accountId, post.msgId);
  return post;
}

export async function deleteBtbAccountData(accountId: string): Promise<void> {
  const oid = new ObjectId(accountId);
  const [posts, views] = await Promise.all([postsCol(), viewsCol()]);
  await Promise.all([
    posts.deleteMany({ accountId: oid } as Filter<StatusPost>),
    views.deleteMany({ accountId: oid } as Filter<StatusView>),
  ]);
}
