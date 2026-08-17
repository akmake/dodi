/**
 * Scheduled analytics reports ([קטגוריה 23] §23.5).
 *   GET  → list schedules.   POST → create { name, frequency?, events?, webhookUrl?, timezone? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createSchedule, listSchedules, type ReportFrequency } from "@/modules/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listSchedules(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "analytics.view");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    frequency?: ReportFrequency;
    events?: string[];
    webhookUrl?: string | null;
    timezone?: string;
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const schedule = await createSchedule(auth.tenantId, {
    name: body.name.trim(),
    frequency: body.frequency,
    events: body.events,
    webhookUrl: body.webhookUrl,
    timezone: body.timezone,
  });
  return NextResponse.json(schedule, { status: 201 });
}
