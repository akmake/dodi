/**
 * Leads ([קטגוריה 21]).
 *   GET  /api/leads?status=&stageId=&ownerId=   → list
 *   POST /api/leads { contactId, source?, sourceMeta?, estimatedValue?, qualification? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { captureLead, listLeads, type CaptureLeadInput, type ListLeadsFilter } from "@/modules/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const filter: ListLeadsFilter = {
    status: (sp.get("status") as ListLeadsFilter["status"]) ?? undefined,
    stageId: sp.get("stageId") ?? undefined,
    ownerId: sp.get("ownerId") ?? undefined,
  };
  try {
    return NextResponse.json({ items: await listLeads(auth.tenantId, filter) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CaptureLeadInput>;
  if (!body.contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await captureLead(auth.tenantId, {
        contactId: body.contactId,
        source: body.source,
        sourceMeta: body.sourceMeta,
        estimatedValue: body.estimatedValue,
        qualification: body.qualification,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
