/**
 * GET/PUT/DELETE /api/whatsapp/account — the tenant's official-WhatsApp
 * connection ([קטגוריה 2] §2.1). Backs the dashboard "מרכז וואטסאפ".
 *
 * GET    → live connection status + health (masked token only).
 * PUT    → connect / update credentials (token encrypted at rest).
 * DELETE → disconnect (removes the persisted account; data untouched).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import {
  disconnectAccount,
  getConnectionStatus,
  upsertAccount,
  type UpsertAccountInput,
} from "@/modules/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await getConnectionStatus(auth.tenantId));
}

export async function PUT(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<UpsertAccountInput>;
  if (!body.phoneNumberId?.trim()) {
    return NextResponse.json({ error: "phoneNumberId נדרש" }, { status: 400 });
  }
  try {
    const status = await upsertAccount(auth.tenantId, {
      phoneNumberId: body.phoneNumberId,
      wabaId: body.wabaId,
      displayPhoneNumber: body.displayPhoneNumber,
      businessId: body.businessId,
      verifiedName: body.verifiedName,
      accessToken: body.accessToken,
    });
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const result = await disconnectAccount(auth.tenantId);
  return NextResponse.json(result);
}
