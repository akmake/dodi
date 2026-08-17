/**
 * AI Flow Architect endpoint ([קטגוריה 27]).
 *
 *   POST → { message, history?, currentFlow? } → ArchitectResult
 *
 * Fetches the tenant's available actions/templates/resources so the architect
 * can wire real ids (and the validator can flag bad references), then delegates
 * to `runArchitect`. Thin controller — all logic lives in the module.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { runArchitect, type ArchitectRequest, type KnownEntities } from "@/modules/flow-ai";
import { listActions } from "@/modules/actions";
import { listTemplates } from "@/modules/templates";
import { listResources } from "@/modules/appointments";
import { listCollections } from "@/modules/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;

  const body = (await req.json().catch(() => null)) as ArchitectRequest | null;
  if (!body?.message?.trim()) {
    return NextResponse.json({ error: "missing message" }, { status: 400 });
  }

  try {
    const known = await loadKnownEntities(tenantId);
    const result = await runArchitect(
      {
        message: body.message,
        history: Array.isArray(body.history) ? body.history.slice(-12) : [],
        currentFlow: body.currentFlow ?? null,
      },
      known
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[flow-ai] architect failed", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function loadKnownEntities(tenantId: string): Promise<KnownEntities> {
  const [actions, templates, resources, collections] = await Promise.all([
    listActions(tenantId).catch(() => []),
    listTemplates(tenantId).catch(() => []),
    listResources(tenantId).catch(() => []),
    listCollections(tenantId).catch(() => []),
  ]);
  return {
    actionIds: actions.map((a) => a.id),
    templateNames: templates.map((t) => t.name),
    resourceIds: resources.map((r) => r.id),
    collectionNames: collections.map((c) => c.name),
  };
}
