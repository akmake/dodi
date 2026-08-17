/**
 * Inbox repositories — only the Inbox's own entities (canned replies). The
 * conversation/message data lives in the WhatsApp module's repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { CannedReply, InboxView, Mention } from "./models";

export class CannedReplyRepository extends Repository<CannedReply> {
  constructor() {
    super("canned_replies");
  }

  findByShortcut(tenantId: string, shortcut: string) {
    return this.findOne(tenantId, { shortcut } as Filter<CannedReply>);
  }
}

export class InboxViewRepository extends Repository<InboxView> {
  constructor() {
    super("inbox_views");
  }
}

export class MentionRepository extends Repository<Mention> {
  constructor() {
    super("inbox_mentions");
  }
  listForUser(tenantId: string, userId: string, unreadOnly: boolean) {
    const f: Record<string, unknown> = { userId };
    if (unreadOnly) f.read = false;
    return this.findMany(tenantId, f as Filter<Mention>);
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureInboxIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("canned_replies").createIndex({ tenantId: 1, shortcut: 1 }, { unique: true }),
        db.collection("inbox_views").createIndex({ tenantId: 1 }),
        db.collection("inbox_mentions").createIndex({ tenantId: 1, userId: 1, read: 1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
