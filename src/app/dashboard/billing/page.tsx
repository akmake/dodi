"use client";

/**
 * Billing & usage dashboard ([קטגוריה 25.6]).
 * Shows the active plan, this month's usage vs each quota, and lets the tenant
 * switch plans. Payment capture is handled by the provider integration later —
 * this view owns plan selection + quota visibility.
 */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, Check, Loader2, AlertCircle } from "lucide-react";

interface QuotaRow { metric: string; label: string; used: number; limit: number; remaining: number; allowed: boolean }
interface Plan { id: string; label: string; priceMonthly: number; limits: Record<string, number> }
interface Summary { plan: Plan; status: string; period: string; usage: QuotaRow[] }

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 };

export default function BillingPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/billing", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      const d = await r.json();
      setSummary(d.summary); setPlans(d.plans ?? []); setError(null);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function choose(plan: string) {
    setChanging(plan);
    try {
      await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      await load();
    } finally { setChanging(null); }
  }

  const fmtLimit = (n: number) => (n < 0 ? "∞" : n.toLocaleString("he-IL"));
  const price = (n: number) => (n === 0 ? "חינם" : `₪${(n / 100).toLocaleString("he-IL")}/חודש`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><CreditCard size={22} /> חיוב ומכסות</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>התוכנית שלך, השימוש החודשי מול המכסות, ושדרוג/שינוי תוכנית.</p>
      </div>

      {error && <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}><AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span></div>}

      {loading ? (
        <div style={{ ...card, padding: 40, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}><Loader2 className="animate-spin" size={20} /></div>
      ) : summary && (
        <>
          <div style={{ ...card, padding: 18 }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>התוכנית הנוכחית</div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{summary.plan.label} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· {summary.period}</span></div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>{summary.status === "active" ? "פעיל" : summary.status}</span>
            </div>
            <div className="space-y-3">
              {summary.usage.map((q) => {
                const ratio = q.limit < 0 ? 0 : Math.min(1, q.used / Math.max(1, q.limit));
                const danger = q.limit >= 0 && ratio >= 0.9;
                return (
                  <div key={q.metric}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: "var(--text-primary)" }}>{q.label}</span>
                      <span style={{ color: danger ? "#DC2626" : "var(--text-muted)" }}>{q.used.toLocaleString("he-IL")} / {fmtLimit(q.limit)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--bg-base)", overflow: "hidden" }}>
                      <div style={{ width: `${q.limit < 0 ? 4 : ratio * 100}%`, height: "100%", background: danger ? "#DC2626" : "var(--accent)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {plans.map((p) => {
              const current = p.id === summary.plan.id;
              return (
                <div key={p.id} style={{ ...card, padding: 16, border: current ? "2px solid var(--accent)" : "1px solid var(--bg-border)" }}>
                  <div className="font-bold text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>{p.label}</div>
                  <div className="text-lg font-bold mb-3" style={{ color: "var(--accent-dark)" }}>{price(p.priceMonthly)}</div>
                  <ul className="space-y-1 mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    <li>{fmtLimit(p.limits.messages_out)} הודעות</li>
                    <li>{fmtLimit(p.limits.ai_answers)} תשובות AI</li>
                    <li>{fmtLimit(p.limits.contacts)} אנשי קשר</li>
                    <li>{fmtLimit(p.limits.seats)} משתמשים</li>
                  </ul>
                  <button onClick={() => choose(p.id)} disabled={current || changing === p.id}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                    style={{ background: current ? "var(--bg-base)" : "var(--accent)", color: current ? "var(--text-muted)" : "#fff", border: current ? "1px solid var(--bg-border)" : "none", cursor: current ? "default" : "pointer" }}>
                    {changing === p.id ? <Loader2 size={14} className="animate-spin" /> : current ? <><Check size={14} /> נוכחי</> : "עבור לתוכנית"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
