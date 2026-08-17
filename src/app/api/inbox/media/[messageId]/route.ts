/**
 * GET /api/inbox/media/{messageId}
 *
 * Proxies WhatsApp media through the authenticated app. The browser never sees
 * the Meta temporary URL or access token, and tenant scoping is enforced by the
 * message lookup.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { downloadMessageMedia } from "@/modules/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ messageId: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;

  const { messageId } = await ctx.params;
  try {
    const media = await downloadMessageMedia(auth.tenantId, messageId);
    const filename = sanitizeFilename(media.filename ?? `whatsapp-media-${messageId}`);
    return new NextResponse(media.data, {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "media";
}
