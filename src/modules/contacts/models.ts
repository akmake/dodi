/**
 * Contacts / CRM domain models — [קטגוריה 4].
 *
 * The Contact is the single source of truth for a person: identity, consent,
 * ownership, tags and custom fields. A WhatsApp Conversation ([קטגוריה 2]) links
 * to it via `contactId`; the contact owns marketing consent at the CRM level.
 *
 * Collections:
 *   contacts            → Contact
 *   contact_identities  → ContactIdentity   (cross-channel resolution, §4.1 / [קטגוריה 1])
 *   custom_field_defs   → CustomFieldDef     (§4.2)
 */
import type { BaseEntity } from "@/core/types";
import type { ConversationChannel, MarketingOptIn } from "@/modules/whatsapp/models";

export type { MarketingOptIn };

export type ContactStatus = "new" | "active" | "customer" | "churned" | "blocked";

export interface Contact extends BaseEntity {
  firstName: string | null;
  lastName: string | null;
  /** E.164 phone (e.g. "+16505551234") — primary identity. */
  phone: string;
  /** WhatsApp id: bare digits ("16505551234"). Matches Conversation.waId. */
  waId: string;
  email: string | null;
  /** ISO 639-1 language code. */
  language: string | null;
  leadSource: string | null;
  firstChannel: ConversationChannel | null;
  lastChannel: ConversationChannel | null;
  status: ContactStatus;
  funnelStage: string | null;
  ownerId: string | null;
  teamId: string | null;
  tags: string[];
  /** Values keyed by CustomFieldDef.key (§4.2). */
  customFields: Record<string, unknown>;
  marketingOptIn: MarketingOptIn;
  optInSource: string | null;
  optInAt: Date | null;
  lastActivityAt: Date | null;
}

export type IdentityType = "phone" | "email" | "wa_id" | "psid" | "web_visitor_id";

export interface ContactIdentity extends BaseEntity {
  contactId: string;
  type: IdentityType;
  /** Unique per (tenant, type). */
  value: string;
}

export type CustomFieldType = "text" | "number" | "date" | "bool" | "enum" | "url";

export interface CustomFieldDef extends BaseEntity {
  /** Unique per tenant. Used as the key inside Contact.customFields. */
  key: string;
  label: string;
  type: CustomFieldType;
  /** For `enum` types. */
  options: string[] | null;
  default: unknown;
  scope: "contact" | "conversation";
}
