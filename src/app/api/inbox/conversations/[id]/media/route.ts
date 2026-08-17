/**
 * POST /api/inbox/conversations/{id}/media
 *
 * Multipart body: { file, caption? }. Uploads to Meta, then sends the uploaded
 * media into the conversation through the normal WhatsApp send path.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { ConversationRepository } from "@/modules/whatsapp/repository";
import { sendMedia, uploadMedia, WhatsAppApiError, type MediaKind } from "@/modules/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const conversations = new ConversationRepository();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "inbox.access");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!isFileLike(file)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const conversation = await conversations.findById(auth.tenantId, id);
  if (!conversation) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const mimeType = file.type || "application/octet-stream";
  const filename = file.name || "attachment";
  const caption = String(form?.get("caption") ?? "").trim() || undefined;
  const kind = mediaKindFromMime(mimeType);

  try {
    const uploaded = await uploadMedia(auth.tenantId, file, filename, mimeType);
    const message = await sendMedia(
      auth.tenantId,
      conversation.waId,
      kind,
      { id: uploaded.id, caption, filename, mimeType },
      { sender: "agent" }
    );
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function mediaKindFromMime(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function isFileLike(value: FormDataEntryValue | null | undefined): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "type" in value &&
    "name" in value
  );
}
