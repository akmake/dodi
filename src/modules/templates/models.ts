/**
 * WhatsApp Message Templates — [קטגוריה 19].
 *
 * A local catalog mirroring the tenant's approved templates in Meta. Templates
 * are the only way to message a customer outside the 24h window (§2.4), so this
 * is MVP-core. Collection: `message_templates`.
 */
import type { BaseEntity } from "@/core/types";
import type { QualityRating } from "@/modules/whatsapp/models";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type TemplateStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL";

export interface MessageTemplate extends BaseEntity {
  /** Meta's template id, once created/synced. */
  metaTemplateId: string | null;
  /** snake_case, unique per language. */
  name: string;
  /** BCP-47 (he, en_US). */
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  rejectionReason: string | null;
  qualityScore: QualityRating;
  /** Raw Meta `components` array (HEADER/BODY/FOOTER/BUTTONS). */
  components: TemplateComponent[];
  /** Number of {{n}} body variables — drives parameter mapping on send. */
  variableCount: number;
  /** Version snapshots — one per submission/edit, newest last (§19.2). */
  history?: TemplateRevision[];
}

/** A point-in-time snapshot of a template, kept for the version history (§19.2). */
export interface TemplateRevision {
  revision: number;
  category: TemplateCategory;
  components: TemplateComponent[];
  /** What produced this revision. */
  action: "created" | "edited" | "submitted";
  status: TemplateStatus;
  at: Date;
  note?: string | null;
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  buttons?: TemplateButton[];
  example?: unknown;
}

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "FLOW";
  text: string;
  payload?: string;
  url?: string;
  phone?: string;
}
