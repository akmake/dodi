/**
 * GET/POST /api/skills — AI Skills management ([קטגוריה 11]).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listSkills, saveSkill, type SaveSkillInput } from "@/modules/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ items: await listSkills(auth.tenantId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<SaveSkillInput>;
  if (!body.name || !body.instructions) {
    return NextResponse.json({ error: "name and instructions are required" }, { status: 400 });
  }
  return NextResponse.json(
    await saveSkill(auth.tenantId, {
      name: body.name,
      description: body.description,
      intents: body.intents,
      instructions: body.instructions,
      allowedActionIds: body.allowedActionIds,
      knowledgeScope: body.knowledgeScope,
      enabled: body.enabled,
    }),
    { status: 201 }
  );
}
