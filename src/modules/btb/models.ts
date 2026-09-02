/**
 * BTB (status marketing) domain types — port of `Whatsapp/server/models/
 * {BtbAccount,StatusPost,StatusView}.js`. Native-Mongo/ObjectId-keyed, same
 * reasoning as `wtm/models.ts`.
 */
import type { ObjectId } from "mongodb";

export interface BtbAccount {
  _id: ObjectId;
  name: string;
  phone: string;
  active: boolean;
  /** "follower core" target — once unique viewers cross this, start distilling top-N. */
  targetFollowers: number;
  videoResolution: 1080 | 720;
  tags: string[];
  internalNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MediaProbe = Record<string, unknown>;

export interface StatusPost {
  _id: ObjectId;
  accountId: ObjectId;
  msgId: string;
  postedAt: Date;
  mediaType: "image" | "video" | "text" | "unknown";
  caption: string;
  thumbnail: string;
  bgColor: string;
  source: "upload" | "phone";
  batchId: string | null;
  segmentIndex: number;
  segmentCount: number;
  viewsCount: number;
  mediaProbe?: MediaProbe;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusView {
  _id: ObjectId;
  accountId: ObjectId;
  statusId: ObjectId | null;
  msgId: string;
  viewerJid: string;
  viewerPhone: string;
  viewerName: string;
  viewedAt: Date;
  receiptType: "read" | "played";
  createdAt: Date;
  updatedAt: Date;
}
