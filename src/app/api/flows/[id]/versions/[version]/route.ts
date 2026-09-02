/**
 * A single flow version ([קטגוריה 8]).
 *   GET → the version's full graph in the builder's wire shape, so the canvas can
 *         load it for restore. Restoring = load here → Save (which records a new
 *         version), keeping restore reversible.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getVersion, graphToBuilder } from "@/modules/flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; version: string }> }
) {
  const auth = await authorize(req, "bot.edit");
  if (auth instanceof NextResponse) return auth;
  const { id, version } = await ctx.params;
  const v = await getVersion(auth.tenantId, id, Number(version));
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { nodes, edges } = graphToBuilder(v.graph);
  return NextResponse.json({
    version: v.version,
    name: v.name,
    active: v.enabled && v.status === "published",
    nodes,
    edges,
  });
}
