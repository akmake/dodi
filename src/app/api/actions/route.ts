/**
 * Business Actions ([קטגוריה 13]).  GET → list enabled.  POST → register { name, description, target, ... }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listActions, registerAction, type RegisterActionInput } from "@/modules/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ items: await listActions(auth.tenantId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as Partial<RegisterActionInput>;
  if (!body.name?.trim() || !body.description?.trim() || !body.target) {
    return NextResponse.json({ error: "name, description and target are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await registerAction(auth.tenantId, {
        name: body.name,
        description: body.description,
        target: body.target,
        inputSchema: body.inputSchema,
        outputSchema: body.outputSchema,
        requiresConfirmation: body.requiresConfirmation,
        allowedInSkills: body.allowedInSkills,
      }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
