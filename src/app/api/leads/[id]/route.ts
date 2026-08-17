/**
 * A single lead ([קטגוריה 21]).
 *   GET   /api/leads/[id]                     → lead
 *   PATCH /api/leads/[id]                     → move stage / assign / qualify / update
 *
 * PATCH body (any combination, applied in this order):
 *   { stageId }                 → move pipeline stage (settles won/lost)
 *   { ownerId } | { assignAuto } → assign owner (manual or via Routing)
 *   { qualification }           → merge BANT answers + rescore
 *   { estimatedValue?, lostReason?, status? } → generic field update
 *   { followupAt }              → schedule a follow-up nudge
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  getLead,
  moveStage,
  assignOwner,
  qualify,
  updateLead,
  scheduleFollowup,
  type Lead,
} from "@/modules/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  stageId?: string;
  ownerId?: string;
  assignAuto?: boolean;
  qualification?: Record<string, unknown>;
  estimatedValue?: number | null;
  lostReason?: string | null;
  status?: Lead["status"];
  followupAt?: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.view");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const lead = await getLead(auth.tenantId, id);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "contacts.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  try {
    let lead = await getLead(auth.tenantId, id);
    if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (body.stageId) lead = (await moveStage(auth.tenantId, id, body.stageId)) ?? lead;
    if (body.assignAuto || body.ownerId !== undefined)
      lead = (await assignOwner(auth.tenantId, id, body.ownerId)) ?? lead;
    if (body.qualification) lead = (await qualify(auth.tenantId, id, body.qualification)) ?? lead;

    const generic: Partial<Lead> = {};
    if (body.estimatedValue !== undefined) generic.estimatedValue = body.estimatedValue;
    if (body.lostReason !== undefined) generic.lostReason = body.lostReason;
    if (body.status !== undefined) generic.status = body.status;
    if (Object.keys(generic).length) lead = (await updateLead(auth.tenantId, id, generic)) ?? lead;

    if (body.followupAt) await scheduleFollowup(auth.tenantId, id, new Date(body.followupAt));

    return NextResponse.json(lead);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
