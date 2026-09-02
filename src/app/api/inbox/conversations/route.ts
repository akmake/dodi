/**
 * GET /api/inbox/conversations — the conversation list ([קטגוריה 3] §3.1).
 *
 * Query: ?status=&assignee=&unassigned=1&priority=&tag=&limit=
 * Thin controller — delegates to the inbox service.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listConversations, type InboxFilters } from "@/modules/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const sp = req.nextUrl.searchParams;

  const filters: InboxFilters = {};
  const status = sp.get("status");
  if (status) filters.status = status as InboxFilters["status"];
  const priority = sp.get("priority");
  if (priority) filters.priority = priority as InboxFilters["priority"];
  const tag = sp.get("tag");
  if (tag) filters.tag = tag;
  if (sp.get("unassigned") === "1") filters.unassigned = true;
  const assignee = sp.get("assignee");
  if (assignee) filters.assigneeId = assignee;
  const limit = sp.get("limit");
  if (limit) filters.limit = Number(limit);

  try {
    const items = await listConversations(tenantId, filters);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
