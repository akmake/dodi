/**
 * Ecommerce / Conversational Commerce models — [קטגוריה 20].
 *
 * Product catalog (§20.1) synced from a store and surfaced inside the chat as
 * product messages (§20.2); inbound cart `order` events become Orders (§20.3)
 * that the agent can act on (§20.4). Prices are stored in MINOR units (agorot/
 * cents) to avoid float drift.
 *
 * Collections:
 *   products → Product   (unique per (tenant, retailerId))
 *   orders   → Order
 */
import type { BaseEntity } from "@/core/types";

export type ProductAvailability = "in_stock" | "out_of_stock" | "preorder";
export type ProductSource = "shopify" | "woocommerce" | "manual";

export interface Product extends BaseEntity {
  /** SKU in the source store — the id WhatsApp/Meta Catalog references. */
  retailerId: string;
  catalogId: string | null;
  title: string;
  description: string | null;
  /** Minor units (e.g. agorot). */
  price: number;
  currency: string;
  availability: ProductAvailability;
  imageUrl: string | null;
  source: ProductSource;
}

export interface OrderItem {
  retailerId: string;
  title: string | null;
  quantity: number;
  /** Minor units. */
  itemPrice: number;
  currency: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export interface Order extends BaseEntity {
  contactId: string | null;
  conversationId: string | null;
  catalogId: string | null;
  items: OrderItem[];
  /** Sum of quantity × itemPrice, minor units. */
  total: number;
  currency: string;
  status: OrderStatus;
  /** Order id in the source store, once synced. */
  externalOrderId: string | null;
  notes: string | null;
}
