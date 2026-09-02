/**
 * A single segment ([קטגוריה 5]).
 *   GET    /api/segments/[id]
 *   PATCH  /api/segments/[id]  { name?, definition?, excludeSegmentIds?, refreshEveryMinutes? }
 *   DELETE /api/segments/[id]
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getSegment, updateSegment, deleteSegment, type UpdateSegmentInput } from "@/modules/segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const seg = await getSegment(auth.tenantId, id);
  if (!seg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(seg);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as UpdateSegmentInput;
  try {
    const updated = await updateSegment(auth.tenantId, id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json({ deleted: await deleteSegment(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
