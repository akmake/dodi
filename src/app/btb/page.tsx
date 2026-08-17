"use client";
// Port of Whatsapp/client/src/pages/BtbConsole.jsx
// NOTE: the original's per-customer login management (create/reset a `role:client`
// login bound to a BTB account) is intentionally deferred in this unified build —
// bootWhat's user/auth model needs a `btbAccountId` link + a customer login flow
// first. Everything else (list, create, connect, manage, delete) is ported faithfully.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { btbApi, ApiError } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import Modal from "@/components/wtmbtb/ui/Modal";
import { SERVICES } from "@/lib/wtmbtb/services";

const BTB = SERVICES.btb;

const WA: Record<string, { label: string; cls: string }> = {
  connected: { label: "מחובר", cls: "bg-green-100 text-green-700" },
  connecting: { label: "מתחבר…", cls: "bg-yellow-100 text-yellow-700" },
  waiting_qr: { label: "ממתין ל-QR", cls: "bg-yellow-100 text-yellow-700" },
  disconnected: { label: "מנותק", cls: "bg-red-100 text-red-600" },
};

const fmtDate = (ts: string) => (ts ? new Date(ts).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

function CreateAccount({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setBusy(true);
    try {
      const res = await btbApi.post<any>("/accounts", { name, phone });
      onCreated(res.data._id);
    } catch (err) {
      alert(err instanceof ApiError ? err.response.data.error || "שגיאה ביצירת לקוח" : "שגיאה ביצירת לקוח");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <h2 className="text-lg font-bold text-[#111b21] mb-1">לקוח חדש</h2>
        <p className="text-sm text-gray-500 mb-5">צור חשבון. אחרי היצירה תחבר את הוואטסאפ שלו ב-QR מתוך הכרטיס.</p>

        <label className="block text-sm font-medium text-[#111b21] mb-1">שם העסק</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />

        <label className="block text-sm font-medium text-[#111b21] mb-1">מספר טלפון</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9725XXXXXXXX" dir="ltr" className="w-full mb-5 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />

        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg text-white font-semibold transition disabled:opacity-50" style={{ backgroundColor: BTB.color }}>
          {busy ? "יוצר…" : "צור לקוח"}
        </button>
      </form>
    </Modal>
  );
}

export default function BtbConsole() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts((await btbApi.get<any[]>("/accounts")).data);
    } catch {
      setAccounts([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useSSE(load);

  const del = async (a: any) => {
    if (!confirm(`למחוק את "${a.name}" וכל הנתונים שלו? פעולה בלתי הפיכה.`)) return;
    try {
      await btbApi.del(`/accounts/${a._id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.response.data.error || "שגיאה במחיקה" : "שגיאה במחיקה");
    }
  };

  const filtered = (accounts || []).filter((a) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [a.name, a.phone].filter(Boolean).some((x) => String(x).toLowerCase().includes(s));
  });

  if (accounts === null) return <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50">טוען…</div>;

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#111b21]">הלקוחות שלי</h1>
            <p className="text-sm text-gray-400">
              {accounts.length} לקוחות · {accounts.filter((a) => a.waStatus === "connected").length} מחוברים
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם / טלפון" className="px-3 py-2 rounded-lg border border-gray-200 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap" style={{ backgroundColor: BTB.color }}>
              ＋ לקוח חדש
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
            {accounts.length === 0 ? 'עדיין אין לקוחות. צור את הראשון עם "＋ לקוח חדש".' : "אין תוצאות לחיפוש."}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-2.5">עסק</th>
                  <th className="text-right font-medium px-4 py-2.5">טלפון</th>
                  <th className="text-right font-medium px-4 py-2.5">חיבור</th>
                  <th className="text-right font-medium px-4 py-2.5">נוצר</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((a) => {
                  const badge = WA[a.waStatus] || WA.disconnected;
                  return (
                    <tr key={a._id} className="hover:bg-gray-50/70 transition cursor-pointer" onClick={() => router.push(`/btb/${a._id}`)}>
                      <td className="px-4 py-3 font-semibold text-[#111b21]">{a.name}</td>
                      <td className="px-4 py-3 text-gray-500" dir="ltr">
                        {a.phone}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{fmtDate(a.createdAt)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => router.push(`/btb/${a._id}`)} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: BTB.accent }}>
                            נהל
                          </button>
                          <button onClick={() => del(a)} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50">
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateAccount
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            load();
            router.push(`/btb/${id}`);
          }}
        />
      )}
    </div>
  );
}
