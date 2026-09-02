/**
 * Routing rules ([קטגוריה 17]).  GET → list.  POST → create { target, match?, priority?, assignmentStrategy? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { createRule, listRules, type CreateRuleInput } from "@/modules/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listRules(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<CreateRuleInput>;
  if (!body.target?.type) {
    return NextResponse.json({ error: "target.type is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createRule(auth.tenantId, {
        target: body.target,
        match: body.match,
        priority: body.priority,
        assignmentStrategy: body.assignmentStrategy,
        requiredSkills: body.requiredSkills,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
