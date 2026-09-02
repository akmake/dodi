/**
 * GET /api/wtm/clients/:id/export-conversation — download a conversation as JSON.
 * Port of `tenantRoutes.js` GET '/:id/export-conversation' + `aiAnalysis.exportConversation`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { exportConversationMessages } from "@/modules/wtm/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") || "dm";
  const groupId = sp.get("groupId") || undefined;
  const phone = sp.get("phone") || undefined;
  if (type === "group" && !groupId) return NextResponse.json({ error: "נדרש groupId" }, { status: 400 });
  if (type === "dm" && !phone) return NextResponse.json({ error: "נדרש phone" }, { status: 400 });

  const from = sp.get("dateFrom")
    ? new Date(sp.get("dateFrom")!)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d;
      })();
  const to = sp.get("dateTo") ? new Date(sp.get("dateTo")!) : new Date();

  const messages = await exportConversationMessages(id, type, groupId, phone, from, to);
  if (messages.length === 0) return NextResponse.json({ error: "לא נמצאו הודעות בטווח התאריכים שנבחר" }, { status: 404 });

  const groupLabel = type === "group" ? messages.find((m) => m.groupName)?.groupName || groupId : phone;

  const data = {
    meta: { source: groupLabel, type, dateFrom: from.toISOString(), dateTo: to.toISOString(), count: messages.length, exported: new Date().toISOString() },
    messages: messages.map((m) => ({
      timestamp: m.createdAt,
      direction: m.direction,
      sender: m.direction === "out" ? "אנחנו" : m.senderName || m.phone,
      phone: m.phone,
      text: m.text || null,
      mediaType: m.mediaType || null,
    })),
  };

  const filename = `conversation_${data.meta.source}_${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
