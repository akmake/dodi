/**
 * Meta WhatsApp Cloud API client (§2.3).
 *
 * A thin, credential-bound HTTP wrapper around `POST /{phone-number-id}/messages`.
 * Salvaged from the old `src/lib/whatsapp.ts` (IMPLEMENTATION.md §4) and hardened:
 *   - credentials are injected (per-account), not read from env at call time;
 *   - Meta error codes are surfaced as a typed `WhatsAppApiError` so the service
 *     can branch on them (§2.3 edge cases: 131047, 130429, 132000, 131026).
 */
import { config } from "@/core/config";

export interface WhatsAppCredentials {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
}

/** A typed error carrying Meta's numeric error code (see §2.3). */
export class WhatsAppApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly httpStatus?: number
  ) {
    super(`[${code}] ${title}${detail ? `: ${detail}` : ""}`);
    this.name = "WhatsAppApiError";
  }
}

export interface SendResult {
  wamid: string | null;
  /** accepted | held_for_quality_assessment | paused */
  messageStatus: string | null;
  raw: unknown;
}

export interface ReplyButton {
  id: string;
  /** Max 20 chars on WhatsApp — truncated defensively. */
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

/**
 * Optional header + footer for an interactive message (redesign §6.2 Option A).
 * Reply-buttons may carry a text OR media header; a list header is text-only.
 * Additive: a message with no header/footer behaves exactly as before.
 */
export type InteractiveHeader =
  | { kind: "text"; text: string }
  | { kind: "image"; link: string }
  | { kind: "video"; link: string }
  | { kind: "document"; link: string; filename?: string };

export interface InteractiveExtras {
  header?: InteractiveHeader;
  footer?: string;
}

/** Build the Graph API `interactive.header` object from our header union. */
function graphHeader(h: InteractiveHeader): Record<string, unknown> {
  switch (h.kind) {
    case "text": return { type: "text", text: h.text.slice(0, 60) };
    case "image": return { type: "image", image: { link: h.link } };
    case "video": return { type: "video", video: { link: h.link } };
    case "document": return { type: "document", document: { link: h.link, ...(h.filename ? { filename: h.filename } : {}) } };
  }
}

export type MediaKind = "image" | "video" | "audio" | "document";

export interface MediaPayload {
  /** Either an uploaded media id or a public link. */
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
}

export interface UploadedMedia {
  id: string;
  raw: unknown;
}

export interface MediaInfo {
  id: string;
  url: string;
  mimeType: string | null;
  sha256: string | null;
  fileSize: number | null;
  raw: unknown;
}

export interface DownloadedMedia {
  data: ArrayBuffer;
  mimeType: string;
  filename: string | null;
  media: MediaInfo;
}

/** Optional quote/reply context (§2.3 `context.message_id`). */
export interface SendContext {
  replyToWamid?: string;
}

export class WhatsAppClient {
  constructor(private readonly creds: WhatsAppCredentials) {}

  private endpoint(): string {
    return `https://graph.facebook.com/${this.creds.apiVersion}/${this.creds.phoneNumberId}/messages`;
  }

  private graph(path: string): string {
    return `https://graph.facebook.com/${this.creds.apiVersion}/${path}`;
  }

  /** Low-level send. Merges the shared envelope fields and surfaces Meta errors. */
  async send(
    body: Record<string, unknown>,
    context?: SendContext
  ): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...body,
    };
    if (context?.replyToWamid) {
      payload.context = { message_id: context.replyToWamid };
    }

    const res = await fetch(this.endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as MetaResponse;

    if (!res.ok) {
      const err = json.error ?? {};
      throw new WhatsAppApiError(
        err.code ?? 0,
        err.message ?? "WhatsApp API error",
        err.error_data?.details,
        res.status
      );
    }

    const message = json.messages?.[0];
    return {
      wamid: message?.id ?? null,
      messageStatus: message?.message_status ?? null,
      raw: json,
    };
  }

  sendText(to: string, body: string, context?: SendContext): Promise<SendResult> {
    return this.send({ to, type: "text", text: { body } }, context);
  }

  sendButtons(
    to: string,
    bodyText: string,
    buttons: ReplyButton[],
    context?: SendContext,
    extras?: InteractiveExtras
  ): Promise<SendResult> {
    const interactive: Record<string, unknown> = {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    };
    if (extras?.header) interactive.header = graphHeader(extras.header);
    if (extras?.footer) interactive.footer = { text: extras.footer.slice(0, 60) };
    return this.send({ to, type: "interactive", interactive }, context);
  }

  sendList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: ListSection[],
    context?: SendContext,
    extras?: { header?: string; footer?: string }
  ): Promise<SendResult> {
    const interactive: Record<string, unknown> = {
      type: "list",
      body: { text: bodyText },
      action: { button: buttonLabel.slice(0, 20), sections },
    };
    // A list header is text-only per the Cloud API.
    if (extras?.header) interactive.header = { type: "text", text: extras.header.slice(0, 60) };
    if (extras?.footer) interactive.footer = { text: extras.footer.slice(0, 60) };
    return this.send({ to, type: "interactive", interactive }, context);
  }

  sendMedia(
    to: string,
    kind: MediaKind,
    media: MediaPayload,
    context?: SendContext
  ): Promise<SendResult> {
    const obj: Record<string, unknown> = {};
    if (media.id) obj.id = media.id;
    if (media.link) obj.link = media.link;
    if (media.caption) obj.caption = media.caption;
    if (media.filename) obj.filename = media.filename;
    return this.send({ to, type: kind, [kind]: obj }, context);
  }

  async uploadMedia(file: Blob, filename: string, mimeType: string): Promise<UploadedMedia> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", file, filename);

    const res = await fetch(this.graph(`${this.creds.phoneNumberId}/media`), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.creds.accessToken}` },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as MetaMediaUploadResponse & MetaResponse;
    if (!res.ok || !json.id) {
      const err = json.error ?? {};
      throw new WhatsAppApiError(
        err.code ?? 0,
        err.message ?? "WhatsApp media upload failed",
        err.error_data?.details,
        res.status
      );
    }
    return { id: json.id, raw: json };
  }

  async getMediaInfo(mediaId: string): Promise<MediaInfo> {
    const res = await fetch(this.graph(mediaId), {
      headers: { Authorization: `Bearer ${this.creds.accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as MetaMediaInfoResponse & MetaResponse;
    if (!res.ok || !json.url) {
      const err = json.error ?? {};
      throw new WhatsAppApiError(
        err.code ?? 0,
        err.message ?? "WhatsApp media lookup failed",
        err.error_data?.details,
        res.status
      );
    }
    return {
      id: mediaId,
      url: json.url,
      mimeType: json.mime_type ?? null,
      sha256: json.sha256 ?? null,
      fileSize: json.file_size ?? null,
      raw: json,
    };
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    const media = await this.getMediaInfo(mediaId);
    const res = await fetch(media.url, {
      headers: { Authorization: `Bearer ${this.creds.accessToken}` },
    });
    if (!res.ok) {
      throw new WhatsAppApiError(
        0,
        "WhatsApp media download failed",
        await res.text().catch(() => undefined),
        res.status
      );
    }
    return {
      data: await res.arrayBuffer(),
      mimeType: res.headers.get("content-type") ?? media.mimeType ?? "application/octet-stream",
      filename: filenameFromDisposition(res.headers.get("content-disposition")),
      media,
    };
  }

  /** Approved template send. Components are passed through (see [קטגוריה 19]). */
  sendTemplate(
    to: string,
    name: string,
    languageCode: string,
    components?: unknown[],
    context?: SendContext
  ): Promise<SendResult> {
    return this.send(
      {
        to,
        type: "template",
        template: {
          name,
          language: { code: languageCode },
          ...(components ? { components } : {}),
        },
      },
      context
    );
  }
}

/** Single-tenant client built from env config — the bridge until onboarding lands. */
export function defaultClient(): WhatsAppClient {
  return new WhatsAppClient({
    apiVersion: config.whatsapp.apiVersion,
    phoneNumberId: config.whatsapp.phoneNumberId,
    accessToken: config.whatsapp.token,
  });
}

interface MetaResponse {
  messages?: Array<{ id?: string; message_status?: string }>;
  error?: {
    code?: number;
    message?: string;
    error_data?: { details?: string };
  };
}

interface MetaMediaUploadResponse {
  id?: string;
}

interface MetaMediaInfoResponse {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
}

function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
