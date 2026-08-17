/**
 * WTM/BTB audit trail — port of `Whatsapp/server/utils/audit.js` +
 * `models/AuditLog.js`. Kept as its own native-Mongo collection (`auditlogs`,
 * ObjectId-keyed, 1-year TTL) rather than bootWhat's `admin` audit log, since it
 * predates a userId/session and is keyed by the WTM/BTB actor email instead —
 * see the plan's note on not conflating the two `tenantId` vocabularies.
 */
import { getDb } from "@/core/db/mongo";

export interface AuditLogDoc {
  userEmail: string;
  action: string;
  tenantId: string | null; // WTM client id or BTB account id (ObjectId as string), not bootWhat's org tenantId
  ip: string;
  meta: Record<string, unknown>;
  createdAt: Date;
}

let indexesReady: Promise<void> | null = null;

export function ensureAuditIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("auditlogs").createIndex({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }),
        db.collection("auditlogs").createIndex({ tenantId: 1, createdAt: -1 }),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

export async function audit(
  actorEmail: string | undefined,
  ip: string | undefined,
  action: string,
  tenantId: string | null = null,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await ensureAuditIndexes();
    const db = await getDb();
    const doc: AuditLogDoc = {
      userEmail: actorEmail || "system",
      action,
      tenantId,
      ip: ip || "",
      meta,
      createdAt: new Date(),
    };
    await db.collection<AuditLogDoc>("auditlogs").insertOne(doc);
  } catch (err) {
    console.error("[audit]", err instanceof Error ? err.message : err);
  }
}
