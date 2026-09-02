/**
 * Skill simulator ([קטגוריה 11] §11.3).
 *   POST { message, skillId?, intent? } → a dry-run reply + the tools that
 *   would have been available, with no side effects.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { simulateSkill, type SimulateTurn } from "@/modules/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { message?: string; skillId?: string; intent?: string; history?: SimulateTurn[] };
  if (!body.message?.trim()) return NextResponse.json({ error: "missing message" }, { status: 400 });
  try {
    const result = await simulateSkill(auth.tenantId, { message: body.message.trim(), skillId: body.skillId, intent: body.intent, history: body.history });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
