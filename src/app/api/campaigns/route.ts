/**
 * Campaigns ([קטגוריה 18]).  GET → list.  POST → create { name, segmentId, templateName, ... }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createCampaign, listCampaigns, type CreateCampaignInput } from "@/modules/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listCampaigns(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "campaigns.send");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CreateCampaignInput>;
  if (!body.name?.trim() || !body.segmentId || !body.templateName) {
    return NextResponse.json(
      { error: "name, segmentId and templateName are required" },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(
      await createCampaign(auth.tenantId, {
        name: body.name,
        segmentId: body.segmentId,
        templateName: body.templateName,
        templateLanguage: body.templateLanguage,
        variableMapping: body.variableMapping,
        variants: body.variants,
        throttlePerMinute: body.throttlePerMinute,
        skipPreviouslySent: body.skipPreviouslySent,
        rrule: body.rrule,
        scheduledAt: body.scheduledAt,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
