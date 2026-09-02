/**
 * Lead Management / Sales models — [קטגוריה 21].
 *
 * A Lead is a sales opportunity attached to a Contact ([קטגוריה 4]). It carries a
 * source (how it entered: CTWA ad, QR, inbound…), a qualification bundle, a
 * 0..100 score, an owner (sales rep), and a position in the sales pipeline.
 * Conversions feed Analytics ([קטגוריה 23]) and campaign attribution ([18]).
 *
 * Collections:
 *   leads            → Lead
 *   pipeline_stages  → PipelineStage  (the ordered sales funnel, §21.3)
 */
import type { BaseEntity } from "@/core/types";

export type LeadSource = "ctwa_ad" | "qr" | "website" | "inbound" | "manual" | "import";

export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "won" | "lost";

export interface LeadSourceMeta {
  adId?: string;
  campaign?: string;
  referrer?: string;
  [k: string]: unknown;
}

export interface Lead extends BaseEntity {
  contactId: string;
  source: LeadSource;
  sourceMeta: LeadSourceMeta;
  status: LeadStatus;
  /** 0..100, recomputed from qualification + behaviour signals (§21.2). */
  score: number;
  /** Assigned sales rep (admin User id), via Routing or manual. */
  ownerId: string | null;
  pipelineStageId: string | null;
  estimatedValue: number | null;
  /** BANT-style answers and any custom qualification fields. */
  qualification: Record<string, unknown>;
  /** Why the lead was lost/unqualified (free text). */
  lostReason: string | null;
  lastActivityAt: Date | null;
}

/** One column of the sales pipeline (kanban). `isWon`/`isLost` mark terminal stages. */
export interface PipelineStage extends BaseEntity {
  name: string;
  /** Ascending — defines column order left→right. */
  order: number;
  isWon: boolean;
  isLost: boolean;
}

/**
 * Default funnel seeded for a tenant on first use (§21.3). Maps onto LeadStatus
 * so moving a lead to a terminal stage also settles its status.
 */
export const DEFAULT_STAGES: Array<Pick<PipelineStage, "name" | "order" | "isWon" | "isLost">> = [
  { name: "חדש", order: 0, isWon: false, isLost: false },
  { name: "יצרנו קשר", order: 1, isWon: false, isLost: false },
  { name: "מוסמך", order: 2, isWon: false, isLost: false },
  { name: "הצעת מחיר", order: 3, isWon: false, isLost: false },
  { name: "נסגר בהצלחה", order: 4, isWon: true, isLost: false },
  { name: "אבוד", order: 5, isWon: false, isLost: true },
];

/**
 * Lead-scoring weights (§21.2). Each present qualification field adds points;
 * behaviour signals bump the score at runtime. Capped at 100. `qualifiedAt` is
 * the threshold that flips a lead to `qualified` and triggers assignment.
 */
export const SCORING = {
  /** Points per filled BANT field. */
  qualificationFields: {
    budget: 25,
    need: 20,
    authority: 15,
    timeline: 15,
  } as Record<string, number>,
  /** Points per behaviour signal. */
  signals: {
    replied: 5,
    clicked: 10,
    visited: 8,
    opened: 2,
  } as Record<string, number>,
  qualifiedAt: 60,
} as const;
