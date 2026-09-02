"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabAnalysis.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";

const today = () => new Date().toISOString().slice(0, 10);
const weekAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

export default function TabAnalysis({ tenant }: { tenant: any }) {
  const [type, setType] = useState("group");
  const [groupId, setGroupId] = useState("");
  const [phone, setPhone] = useState("");
  const [dateFrom, setDateFrom] = useState(weekAgo());
  const [dateTo, setDateTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const groups = tenant.allowedGroups || [];

  const download = async () => {
    if (type === "group" && !groupId) return;
    if (type === "dm" && !phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = { type, dateFrom, dateTo, ...(type === "group" ? { groupId } : { phone: phone.replace(/\D/g, "") }) };
      const res = await wtmApi.get<Blob>(`/clients/${tenant._id}/export-conversation`, { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      const cd = res.headers.get("content-disposition") || "";
      const name = cd.match(/filename="?([^"]+)"?/)?.[1] || "conversation.json";
      a.href = url;
      a.download = decodeURIComponent(name);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("שגיאה בייצוא — בדוק שיש הודעות בטווח שנבחר");
    } finally {
      setLoading(false);
    }
  };

  const ready = type === "group" ? !!groupId : !!phone.trim();

  return (
    <div className="p-6 space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 text-right">
          <p className="text-sm font-semibold text-slate-800">ייצוא שיחה ל-JSON</p>
          <p className="text-xs text-slate-400 mt-0.5">הורד את ההתכתבות כקובץ JSON להעלאה ל-AI שלך</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2 justify-end">
            {[
              { k: "group", l: "👥 קבוצה" },
              { k: "dm", l: "💬 DM" },
            ].map(({ k, l }) => (
              <button
                key={k}
                onClick={() => setType(k)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition border ${type === k ? "bg-indigo-600 text-white border-indigo-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {type === "group" &&
            (groups.length > 0 ? (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white"
              >
                <option value="">— בחר קבוצה —</option>
                {groups.map((g: any) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.groupName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-400 text-right">אין קבוצות מורשות — הגדר בטאב קבוצות</p>
            ))}

          {type === "dm" && (
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="מספר טלפון (972...)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block text-right">עד</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block text-right">מ</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-right">{error}</div>}

      <button
        onClick={download}
        disabled={loading || !ready}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> מייצא...
          </>
        ) : (
          "⬇ הורד JSON"
        )}
      </button>
    </div>
  );
}
