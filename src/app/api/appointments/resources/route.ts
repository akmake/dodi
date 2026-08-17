/**
 * Appointment resources ([קטגוריה 13]).
 *
 *   GET  → list bookable resources (used by the Flow Builder's appointment node).
 *   POST → create a resource (name, slotMinutes, workingHours).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createResource, listResources } from "@/modules/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  try {
    const items = await listResources(auth.tenantId);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  if (!body?.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  try {
    const resource = await createResource(auth.tenantId, body as { name: string });
    return NextResponse.json({ ok: true, resource });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
