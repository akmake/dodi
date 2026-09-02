/**
 * GET /api/wtm/events — push-based SSE for WTM + BTB live updates
 * (`wa_status`, `message`, `btb_status`). Port of `Whatsapp/server/routes/
 * sseRoutes.js`, adapted to a Next.js `ReadableStream` response — same wire
 * format (`event: update\ndata: {"event": "..."}\n\n`) as the legacy client.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { addSseClient } from "@/modules/wa-engine/sseManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const remove = addSseClient({
        write: (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(chunk));
          } catch {
            closed = true;
          }
        },
      });
      req.signal.addEventListener("abort", () => {
        closed = true;
        remove();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
