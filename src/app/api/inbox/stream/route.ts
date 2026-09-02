/**
 * GET /api/inbox/stream — Server-Sent Events for near-real-time Inbox updates.
 *
 * This gives the UI a realtime transport without adding a WebSocket server to
 * the Next runtime. Clients receive a compact conversation snapshot every few
 * seconds, scoped by auth/tenant.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { listConversations } from "@/modules/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = async () => {
        if (closed) return;
        try {
          const items = await listConversations(tenantId, { limit: 50 });
          controller.enqueue(enc.encode(`event: conversations\ndata: ${JSON.stringify({ items })}\n\n`));
        } catch (err) {
          controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`));
        }
      };
      send();
      const timer = setInterval(send, 3000);
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
