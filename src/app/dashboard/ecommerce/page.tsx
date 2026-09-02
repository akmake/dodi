"use client";

/**
 * Ecommerce ([קטגוריה 20]) — product catalog + orders. Live /api/ecommerce/*.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag, Package, Plus, AlertCircle, Loader2, Trash2, Tag,
} from "lucide-react";

interface Product {
  id: string;
  retailerId: string;
  title: string;
  price: number;
  currency: string;
  availability: string;
  catalogId: string | null;
}
interface Order {
  id: string;
  items: { quantity: number }[];
  total: number;
  currency: string;
  status: string;
  contactId: string | null;
}

const AVAILABILITY: Record<string, string> = {
  in_stock: "במלאי", out_of_stock: "אזל", preorder: "בהזמנה מוקדמת",
};
const ORDER_STATUS: Record<string, string> = {
  pending: "ממתינה", confirmed: "אושרה", paid: "שולמה",
  fulfilled: "סופקה", cancelled: "בוטלה", refunded: "זוכתה",
};
const STATUS_COLOR: Record<string, string> = {
  paid: "#16A34A", fulfilled: "#16A34A", confirmed: "#2563EB",
  pending: "#D97706", cancelled: "#DC2626", refunded: "#6B7280",
};

const money = (minor: number, cur: string) => `${(minor / 100).toFixed(2)} ${cur}`;

export default function EcommercePage() {
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // create-product form
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [catalogId, setCatalogId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([
        fetch("/api/ecommerce/products", { cache: "no-store" }),
        fetch("/api/ecommerce/orders", { cache: "no-store" }),
      ]);
      if (!p.ok) throw new Error((await p.json()).error ?? `HTTP ${p.status}`);
      setProducts((await p.json()).items ?? []);
      setOrders(o.ok ? (await o.json()).items ?? [] : []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addProduct() {
    if (!sku.trim() || !title.trim() || !price || saving) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/ecommerce/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retailerId: sku, title, currency,
          price: Math.round(parseFloat(price) * 100),
          catalogId: catalogId.trim() || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setSku(""); setTitle(""); setPrice(""); setCatalogId("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(id: string) {
    await fetch(`/api/ecommerce/products/${id}`, { method: "DELETE" });
    await load();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/ecommerce/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>חנות</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>קטלוג מוצרים והזמנות בערוץ השיחה</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="flex gap-1.5">
        {([["products", "מוצרים", ShoppingBag], ["orders", "הזמנות", Package]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === k ? "var(--accent-light)" : "var(--bg-card)",
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              border: "1px solid var(--bg-border)",
            }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {tab === "products" ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
            <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>מוצר חדש</div>
            {[
              { v: title, set: setTitle, ph: "שם המוצר" },
              { v: sku, set: setSku, ph: "מק\"ט (SKU) — מזהה בחנות" },
              { v: price, set: setPrice, ph: "מחיר (₪)", type: "number" },
              { v: catalogId, set: setCatalogId, ph: "Catalog ID (Meta) — אופציונלי" },
            ].map((f, i) => (
              <input key={i} value={f.v} type={f.type ?? "text"} onChange={(e) => f.set(e.target.value)} placeholder={f.ph}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
            ))}
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
              {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={addProduct} disabled={saving || !sku.trim() || !title.trim() || !price}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              הוסף מוצר
            </button>
          </div>

          <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
            {loading ? (
              <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <ShoppingBag size={28} className="mb-2 opacity-30" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין מוצרים עדיין — הוסף את הראשון</p>
              </div>
            ) : (
              products.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag size={15} style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{p.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}>{p.retailerId}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-base)", color: p.availability === "in_stock" ? "#16A34A" : "#D97706" }}>
                      {AVAILABILITY[p.availability] ?? p.availability}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{money(p.price, p.currency)}</span>
                    <button onClick={() => removeProduct(p.id)} title="מחק" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package size={28} className="mb-2 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין הזמנות עדיין</p>
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>#{o.id.slice(0, 8)}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{o.items.reduce((s, i) => s + i.quantity, 0)} פריטים</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{money(o.total, o.currency)}</span>
                </div>
                <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}
                  className="text-xs font-medium px-2.5 py-1 rounded-full outline-none cursor-pointer"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: STATUS_COLOR[o.status] ?? "var(--text-muted)" }}>
                  {Object.entries(ORDER_STATUS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
