"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabInfo.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";

const BILLING: Record<string, any> = {
  active: { label: "פעיל", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  overdue: { label: "חייב", color: "text-red-700", bg: "bg-red-50 border-red-200", dot: "bg-red-500", bar: "bg-red-500" },
  trial: { label: "ניסיון", color: "text-violet-700", bg: "bg-violet-50 border-violet-200", dot: "bg-violet-500", bar: "bg-violet-500" },
  suspended: { label: "מושהה", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500", bar: "bg-amber-500" },
  cancelled: { label: "בוטל", color: "text-slate-500", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400", bar: "bg-slate-400" },
};

const PLAN_LABELS: Record<string, string> = { trial: "ניסיון חינם", monthly: "חודשי", annual: "שנתי", custom: "מותאם" };

function StatCard({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-400 mb-1.5">{title}</p>
      <p className={`text-2xl font-bold ${accent || "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className={`text-sm ${mono ? "font-mono text-slate-700" : "text-slate-700"}`}>{value || <span className="text-slate-300">—</span>}</span>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  );
}

export default function TabInfo({ tenant: t, onSaved }: { tenant: any; onSaved: () => void }) {
  const bs = BILLING[t.billingStatus] || BILLING.trial;

  const daysUntil = t.nextBillingDate ? Math.ceil((new Date(t.nextBillingDate).getTime() - Date.now()) / 86_400_000) : null;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    planType: t.planType || "trial",
    planPrice: t.planPrice || "",
    billingStatus: t.billingStatus || "trial",
    nextBillingDate: t.nextBillingDate ? new Date(t.nextBillingDate).toISOString().slice(0, 10) : "",
    contractEmail: t.contractEmail || "",
    internalNotes: t.internalNotes || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await wtmApi.put(`/clients/${t._id}`, { action: "plan", ...form });
      onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing)
    return (
      <div className="p-6">
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-500 hover:text-slate-700 transition">
              ביטול
            </button>
            <h3 className="text-sm font-semibold text-slate-800">עדכון תוכנית</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">תוכנית</label>
                <select
                  value={form.planType}
                  onChange={(e) => set("planType", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white"
                >
                  <option value="trial">ניסיון</option>
                  <option value="monthly">חודשי</option>
                  <option value="annual">שנתי</option>
                  <option value="custom">מותאם</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">סטטוס חיוב</label>
                <select
                  value={form.billingStatus}
                  onChange={(e) => set("billingStatus", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white"
                >
                  <option value="trial">ניסיון</option>
                  <option value="active">פעיל</option>
                  <option value="overdue">חייב</option>
                  <option value="suspended">מושהה</option>
                  <option value="cancelled">בוטל</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">מחיר (₪/חודש)</label>
                <input
                  type="number"
                  min="0"
                  value={form.planPrice}
                  onChange={(e) => set("planPrice", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">חיוב הבא</label>
                <input
                  type="date"
                  value={form.nextBillingDate}
                  onChange={(e) => set("nextBillingDate", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">מייל ליצירת קשר</label>
              <input
                type="email"
                value={form.contractEmail}
                onChange={(e) => set("contractEmail", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                placeholder="client@company.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">הערה פנימית</label>
              <input
                type="text"
                value={form.internalNotes}
                onChange={(e) => set("internalNotes", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                placeholder="הערה שתוצג בסרגל הצד..."
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition"
            >
              {saving ? "שומר..." : "שמור שינויים"}
            </button>
          </div>
        </form>
      </div>
    );

  return (
    <div className="p-6 space-y-5">
      <div className={`rounded-xl border p-4 ${bs.bg}`}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setEditing(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition">
            ערוך ←
          </button>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${bs.dot}`} />
            <span className={`text-sm font-bold ${bs.color}`}>{bs.label}</span>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="text-right">
            <p className="text-xs text-slate-500">{PLAN_LABELS[t.planType] || "ניסיון"}</p>
            {t.planPrice > 0 && (
              <p className="text-2xl font-bold text-slate-800">
                ₪{t.planPrice}
                <span className="text-sm font-normal text-slate-400">/חודש</span>
              </p>
            )}
          </div>
          {daysUntil !== null && (
            <div className="text-center">
              <p className={`text-3xl font-black leading-none ${daysUntil < 0 ? "text-red-600" : daysUntil <= 7 ? "text-amber-600" : "text-slate-700"}`}>
                {Math.abs(daysUntil)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{daysUntil < 0 ? "ימים פג" : "ימים לחיוב"}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="הצטרף"
          value={t.createdAt ? new Date(t.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
          sub="תאריך רישום"
        />
        <StatCard
          title="חיוב הבא"
          value={t.nextBillingDate ? new Date(t.nextBillingDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
          accent={daysUntil !== null && daysUntil < 0 ? "text-red-600" : daysUntil !== null && daysUntil <= 7 ? "text-amber-600" : undefined}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-5 py-1">
        <InfoRow label="מספר וואצאפ" value={t.phone} mono />
        <InfoRow label="מייל ליצירת קשר" value={t.contractEmail} />
        {t.internalNotes && <InfoRow label="הערה פנימית" value={t.internalNotes} />}
      </div>
    </div>
  );
}
