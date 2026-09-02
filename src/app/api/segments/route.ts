/**
 * Segments ([קטגוריה 5]).  GET → list.  POST → create { name, type?, definition, excludeSegmentIds? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createSegment, listSegments, type CreateSegmentInput } from "@/modules/segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listSegments(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CreateSegmentInput>;
  if (!body.name?.trim() || !body.definition) {
    return NextResponse.json({ error: "name and definition are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createSegment(auth.tenantId, {
        name: body.name,
        type: body.type,
        definition: body.definition,
        excludeSegmentIds: body.excludeSegmentIds,
        refreshEveryMinutes: body.refreshEveryMinutes,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
