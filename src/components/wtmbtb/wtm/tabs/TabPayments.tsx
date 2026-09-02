"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabPayments.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";

const METHOD: Record<string, string> = { credit: "כרטיס אשראי", bank: "העברה בנקאית", cash: "מזומן", bit: "ביט", paybox: "PayBox", other: "אחר" };
const EMPTY = { amount: "", method: "bit", period: "", paidAt: new Date().toISOString().slice(0, 10), notes: "" };
const INPUT =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white";

export default function TabPayments({ tenantId }: { tenantId: string }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      setPayments((await wtmApi.get<any[]>(`/clients/${tenantId}/payments`)).data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await wtmApi.post(`/clients/${tenantId}/payments`, form);
      setShowForm(false);
      setForm(EMPTY);
      load();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("למחוק תשלום זה?")) return;
    await wtmApi.del(`/clients/${tenantId}/payments/${id}`);
    load();
  };

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const last = payments[0];

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-400 mb-1.5">סה&quot;כ שולם</p>
          <p className="text-2xl font-bold text-slate-800">₪{total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-400 mb-1.5">מספר תשלומים</p>
          <p className="text-2xl font-bold text-slate-800">{payments.length}</p>
          {last && <p className="text-xs text-slate-400 mt-1">אחרון: {new Date(last.paidAt).toLocaleDateString("he-IL")}</p>}
        </div>
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          הוסף תשלום
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 transition">
              ביטול
            </button>
            <h3 className="text-sm font-semibold text-slate-800">תשלום חדש</h3>
          </div>
          <form onSubmit={add} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">סכום (₪)</label>
                <input type="number" required min="1" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={INPUT} placeholder="100" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">אמצעי תשלום</label>
                <select value={form.method} onChange={(e) => set("method", e.target.value)} className={INPUT}>
                  {Object.entries(METHOD).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">תקופה</label>
                <input type="text" value={form.period} onChange={(e) => set("period", e.target.value)} className={INPUT} placeholder="01/2025" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">תאריך תשלום</label>
                <input type="date" value={form.paidAt} onChange={(e) => set("paidAt", e.target.value)} className={INPUT} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">הערה</label>
              <input type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} className={INPUT} placeholder="אופציונלי" />
            </div>
            <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
              {saving ? "שומר..." : "שמור תשלום"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-3xl mb-2">💳</p>
          <p className="text-sm text-slate-400">אין תשלומים עדיין</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {payments.map((p) => (
            <div key={p._id} className="px-4 py-3.5 flex items-center gap-3">
              <div className="flex-1 text-right min-w-0">
                <div className="flex items-center justify-end gap-2">
                  <span className="font-bold text-slate-800">₪{p.amount.toLocaleString()}</span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{METHOD[p.method] || p.method}</span>
                  {p.period && <span className="text-xs text-slate-400">{p.period}</span>}
                </div>
                {p.notes && <p className="text-xs text-slate-400 mt-0.5">{p.notes}</p>}
              </div>
              <div className="text-left flex-shrink-0">
                <p className="text-xs font-medium text-slate-700">{new Date(p.paidAt).toLocaleDateString("he-IL")}</p>
                {p.createdBy && <p className="text-xs text-slate-400">{p.createdBy.split("@")[0]}</p>}
              </div>
              <button onClick={() => del(p._id)} className="text-slate-300 hover:text-red-500 transition flex-shrink-0 text-xl leading-none">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
