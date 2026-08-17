// Port of Whatsapp/server/routes/noteRoutes.js (GET '/', POST '/')
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listSupportNotes, createSupportNote } from "@/modules/wtm/repository";
import { audit } from "@/modules/wa-engine/auditLog";
import type { SupportNote } from "@/modules/wtm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  return NextResponse.json(await listSupportNotes(id));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { content?: string; priority?: SupportNote["priority"] };
  if (!body.content?.trim()) return NextResponse.json({ error: "תוכן ההערה הוא חובה" }, { status: 400 });

  const note = await createSupportNote(id, body.content.trim(), body.priority || "medium", "");
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "note.add", id, { priority: body.priority });
  return NextResponse.json(note, { status: 201 });
}
