/**
 * Ecommerce / Conversational Commerce — [קטגוריה 20].
 *
 * Catalog management + sync (§20.1), product messages (§20.2), order capture &
 * checkout (§20.3), and order actions (§20.4). Sends ride on the WhatsApp
 * service's product-message path (window-checked); paid orders emit a
 * `conversion` event to Analytics ([23]). Store-side sync (Shopify/Woo) lands
 * via the Integrations connectors ([22] §22.4) — this module is the seam.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import { sendProduct, sendProductList, sendText } from "@/modules/whatsapp/service";
import { track } from "@/modules/analytics/events";
import {
  type Product,
  type ProductSource,
  type ProductAvailability,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "./models";

export * from "./models";

class ProductRepository extends Repository<Product> {
  constructor() {
    super("products");
  }
  findByRetailerId(tenantId: string, retailerId: string) {
    return this.findOne(tenantId, { retailerId } as Filter<Product>);
  }
}
class OrderRepository extends Repository<Order> {
  constructor() {
    super("orders");
  }
}

const products = new ProductRepository();
const orders = new OrderRepository();

// ─── Catalog (§20.1) ──────────────────────────────────────────────────────────

export interface ProductInput {
  retailerId: string;
  title: string;
  price: number;
  currency: string;
  description?: string | null;
  availability?: ProductAvailability;
  imageUrl?: string | null;
  catalogId?: string | null;
  source?: ProductSource;
}

/** Create or update a product by its retailer id (idempotent — backs store sync). */
export async function upsertProduct(tenantId: string, input: ProductInput): Promise<Product> {
  const existing = await products.findByRetailerId(tenantId, input.retailerId);
  const fields = {
    retailerId: input.retailerId,
    title: input.title,
    description: input.description ?? null,
    price: input.price,
    currency: input.currency,
    availability: input.availability ?? "in_stock",
    imageUrl: input.imageUrl ?? null,
    catalogId: input.catalogId ?? null,
    source: input.source ?? "manual",
  };
  if (existing) return (await products.update(tenantId, existing.id, fields)) ?? existing;
  return products.create(tenantId, fields);
}

/** Bulk sync from a store feed (§20.1). Returns how many were written. */
export async function syncProducts(
  tenantId: string,
  items: ProductInput[],
  source: ProductSource
): Promise<number> {
  let n = 0;
  for (const item of items) {
    await upsertProduct(tenantId, { ...item, source });
    n++;
  }
  return n;
}

export function listProducts(tenantId: string) {
  return products.findMany(tenantId);
}
export function getProduct(tenantId: string, id: string) {
  return products.findById(tenantId, id);
}
export function deleteProduct(tenantId: string, id: string) {
  return products.delete(tenantId, id);
}

// ─── Product messages (§20.2) ─────────────────────────────────────────────────

/** Send a single product to a customer, resolving its catalog id from the SKU. */
export async function sendProductMessage(
  tenantId: string,
  to: string,
  retailerId: string,
  body = "מצאתי בשבילך:"
) {
  const product = await products.findByRetailerId(tenantId, retailerId);
  if (!product) throw new Error(`product not found: ${retailerId}`);
  if (!product.catalogId) throw new Error(`product ${retailerId} has no catalogId`);
  return sendProduct(tenantId, to, body, product.catalogId, retailerId);
}

/** Send a multi-product (catalog) message grouped into sections. */
export async function sendCatalogMessage(
  tenantId: string,
  to: string,
  input: {
    header: string;
    body: string;
    catalogId: string;
    sections: { title: string; productRetailerIds: string[] }[];
  }
) {
  return sendProductList(tenantId, to, input);
}

// ─── Orders, cart & checkout (§20.3) ──────────────────────────────────────────

function totalOf(items: OrderItem[]): number {
  return items.reduce((sum, it) => sum + it.quantity * it.itemPrice, 0);
}

export interface CreateOrderInput {
  contactId?: string | null;
  conversationId?: string | null;
  catalogId?: string | null;
  items: OrderItem[];
  notes?: string | null;
}

/** Create an order from cart items (§20.3). Total is computed server-side. */
export async function createOrder(tenantId: string, input: CreateOrderInput): Promise<Order> {
  if (!input.items.length) throw new Error("order has no items");
  const order = await orders.create(tenantId, {
    contactId: input.contactId ?? null,
    conversationId: input.conversationId ?? null,
    catalogId: input.catalogId ?? null,
    items: input.items,
    total: totalOf(input.items),
    currency: input.items[0]?.currency ?? "ILS",
    status: "pending",
    externalOrderId: null,
    notes: input.notes ?? null,
  });
  void track(tenantId, "order_created", {
    contactId: order.contactId,
    conversationId: order.conversationId,
    attributes: { total: order.total, currency: order.currency, items: order.items.length },
  });
  return order;
}

/**
 * Ingest an inbound WhatsApp cart `order` event (§20.3). The webhook parser is
 * the intended caller once it surfaces `messages[].order`; until then this is
 * reachable via the API. Maps Meta `product_items` → OrderItem.
 */
export function ingestWhatsAppOrder(
  tenantId: string,
  input: {
    contactId?: string | null;
    conversationId?: string | null;
    catalogId: string;
    productItems: Array<{ retailerId: string; quantity: number; itemPrice: number; currency: string }>;
  }
): Promise<Order> {
  return createOrder(tenantId, {
    contactId: input.contactId,
    conversationId: input.conversationId,
    catalogId: input.catalogId,
    items: input.productItems.map((p) => ({
      retailerId: p.retailerId,
      title: null,
      quantity: p.quantity,
      itemPrice: p.itemPrice,
      currency: p.currency,
    })),
  });
}

/** Send an order summary + checkout/payment link to the customer (§20.3). */
export async function sendCheckout(
  tenantId: string,
  to: string,
  order: Order,
  checkoutUrl: string
): Promise<void> {
  const lines = order.items.map(
    (it) => `• ${it.title ?? it.retailerId} ×${it.quantity} — ${formatMoney(it.itemPrice * it.quantity, it.currency)}`
  );
  const body = [
    "סיכום ההזמנה שלך:",
    ...lines,
    `סה"כ: ${formatMoney(order.total, order.currency)}`,
    "",
    `להשלמת התשלום: ${checkoutUrl}`,
  ].join("\n");
  await sendText(tenantId, to, body, { sender: "system" });
}

export function listOrders(tenantId: string, status?: OrderStatus) {
  return orders.findMany(tenantId, (status ? { status } : {}) as Filter<Order>);
}
export function getOrder(tenantId: string, id: string) {
  return orders.findById(tenantId, id);
}

// ─── Order actions (§20.4) ────────────────────────────────────────────────────

/**
 * Move an order to a new status. Reaching `paid` emits a `conversion` event for
 * analytics/attribution ([23]). Store-side effects (Shopify cancel/refund) are
 * performed via Business Actions ([13]) + connectors ([22]).
 */
export async function updateOrderStatus(
  tenantId: string,
  id: string,
  status: OrderStatus,
  externalOrderId?: string
): Promise<Order | null> {
  const patch: Partial<Order> = { status };
  if (externalOrderId !== undefined) patch.externalOrderId = externalOrderId;
  const updated = await orders.update(tenantId, id, patch);
  if (updated && status === "paid") {
    void track(tenantId, "conversion", {
      contactId: updated.contactId,
      conversationId: updated.conversationId,
      attributes: { total: updated.total, currency: updated.currency, kind: "order" },
    });
  }
  return updated;
}

export function cancelOrder(tenantId: string, id: string) {
  return updateOrderStatus(tenantId, id, "cancelled");
}

function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export async function ensureEcommerceIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("products").createIndex({ tenantId: 1, retailerId: 1 }, { unique: true }),
    db.collection("orders").createIndex({ tenantId: 1, status: 1 }),
    db.collection("orders").createIndex({ tenantId: 1, contactId: 1 }),
  ]);
}
