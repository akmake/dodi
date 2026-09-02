/**
 * A single AI skill ([קטגוריה 11]).
 *   GET    /api/skills/[id]
 *   PATCH  /api/skills/[id]  { name?, intents?, instructions?, enabled?, ... }
 *   DELETE /api/skills/[id]
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getSkill, updateSkill, deleteSkill, type SaveSkillInput } from "@/modules/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const skill = await getSkill(auth.tenantId, id);
  if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(skill);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<SaveSkillInput>;
  try {
    const updated = await updateSkill(auth.tenantId, id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json({ deleted: await deleteSkill(auth.tenantId, id) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
