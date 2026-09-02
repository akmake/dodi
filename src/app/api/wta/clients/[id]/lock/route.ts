/**
 * POST /api/wta/clients/:id/lock — manual, immediate lock/unlock of a managed
 * group ("only admins can send" ⇄ open). Body: { groupId, lock: boolean }.
 * Requires the bot to be an admin in the group.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getWtaClient, recordAction } from "@/modules/wta/repository";
import { isConnected, waId } from "@/modules/wta/manager";
import { setGroupAnnounce } from "@/modules/wa-engine/whatsappManager";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { audit } from "@/modules/wa-engine/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wta.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { groupId?: string; lock?: boolean };
  const groupId = (body.groupId ?? "").replace(/:\d+$/, "").replace("@g.us", "");
  if (!groupId) return NextResponse.json({ error: "חסר groupId" }, { status: 400 });

  const client = await getWtaClient(id);
  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  if (!isConnected(id)) return NextResponse.json({ error: "הבוט לא מחובר כרגע" }, { status: 400 });

  const managed = client.managedGroups.find((g) => g.groupId.replace(/:\d+$/, "") === groupId);
  const groupName = managed?.groupName ?? groupId;
  const lock = !!body.lock;

  try {
    await setGroupAnnounce(waId(id), `${groupId}@g.us`, lock);
  } catch (err) {
    return NextResponse.json({ error: `הפעולה נכשלה — ודא שהבוט מנהל בקבוצה. (${err instanceof Error ? err.message : String(err)})` }, { status: 500 });
  }

  await recordAction({
    clientId: id,
    type: lock ? "lock" : "unlock",
    ruleId: null,
    groupJid: groupId,
    groupName,
    actorPhone: "",
    actorName: "",
    reason: "ידני",
    textSnippet: "",
  }).catch(() => {});
  broadcast("wta");
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, lock ? "wta.group.lock" : "wta.group.unlock", id, { groupId });
  return NextResponse.json({ ok: true, lock });
}
