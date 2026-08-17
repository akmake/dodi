import type { BaseEntity } from "@/core/types";

export interface SmsSettings extends BaseEntity {
  /** Destination WhatsApp number in wa.me form ("972501234567"). The primary channel. */
  waPhone: string;
  /** Send an email when the WhatsApp send fails, so a message is never silently lost. */
  emailFallback: boolean;
  senderEmail: string;
  appPasswordEncrypted: string;
  destinationEmail: string;
  inboundKeyHash: string;
  inboundKeyPrefix: string;
  enabled: boolean;
  lastTestAt: Date | null;
  lastDeliveryAt: Date | null;
  lastError: string | null;
}

export type SmsDeliveryStatus = "pending" | "sending" | "sent" | "failed";

/** Which channel actually carried the message. `null` until a send succeeds. */
export type SmsDeliveryChannel = "whatsapp" | "email";

export interface SmsDelivery extends BaseEntity {
  externalId: string;
  from: string;
  body: string;
  receivedAt: Date;
  deviceId: string | null;
  status: SmsDeliveryStatus;
  channel: SmsDeliveryChannel | null;
  attempts: number;
  waMessageId: string | null;
  emailMessageId: string | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
}
