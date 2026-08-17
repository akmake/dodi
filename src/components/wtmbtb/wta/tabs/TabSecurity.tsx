"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtaApi, ApiError } from "@/lib/wtmbtb/api";

export default function TabSecurity({ client: c, onSaved }: { client: any; onSaved: () => void }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const setActive = async (active: boolean) => {
    setBusy("active");
    setMsg("");
    try {
      await wtaApi.put(`/clients/${c._id}`, { action: "active", active });
      onSaved();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.response.data.error || "שגיאה" : "שגיאה");
    } finally {
      setBusy("");
    }
  };

  const resetSession = async () => {
    if (!confirm("לאפס את החיבור? הבוט יתנתק ותצטרך לסרוק QR מחדש.")) return;
    setBusy("reset");
    setMsg("");
    try {
      await wtaApi.post(`/clients/${c._id}/reset-session`);
      setMsg("החיבור אופס — פתח 'הצג QR' לסריקה מחדש.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.response.data.error || "שגיאה" : "שגיאה");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <button
          onClick={() => setActive(!c.active)}
          disabled={busy === "active"}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${c.active ? "bg-emerald-500" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${c.active ? "left-5" : "left-0.5"}`} />
        </button>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-800">בוט פעיל</p>
          <p className="text-xs text-slate-400 mt-0.5">{c.active ? "הבוט מחובר ואוכף חוקים" : "הבוט מושבת — לא נאכפים חוקים"}</p>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-right">
        <h3 className="text-sm font-bold text-red-700 mb-1">אזור מסוכן</h3>
        <p className="text-xs text-red-600/80 mb-4 leading-relaxed">איפוס החיבור ימחק את ה-session הנוכחי ויחייב סריקת QR מחדש מהמכשיר.</p>
        <button
          onClick={resetSession}
          disabled={busy === "reset"}
          className="bg-white border border-red-300 text-red-600 hover:bg-red-100 disabled:opacity-50 text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {busy === "reset" ? "מאפס..." : "אפס חיבור (QR מחדש)"}
        </button>
      </div>

      {msg && <p className="text-sm text-center text-slate-600">{msg}</p>}
    </div>
  );
}
