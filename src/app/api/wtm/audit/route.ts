/**
 * GET /api/wtm/audit — WTM/BTB audit log (the `auditlogs` collection).
 * Port of `Whatsapp/server/routes/auditRoutes.js` (filter by tenantId/action).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getDb } from "@/core/db/mongo";
import type { AuditLogDoc } from "@/modules/wa-engine/auditLog";
import type { Filter } from "mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const tenantId = sp.get("tenantId");
  const action = sp.get("action");
  const limit = Math.min(parseInt(sp.get("limit") ?? "50") || 50, 500);

  const q: Record<string, unknown> = {};
  if (tenantId) q.tenantId = tenantId;
  if (action) q.action = action;

  const db = await getDb();
  const rows = await db
    .collection<AuditLogDoc>("auditlogs")
    .find(q as Filter<AuditLogDoc>)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return NextResponse.json(rows);
}
