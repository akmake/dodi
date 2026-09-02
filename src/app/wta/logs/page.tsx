"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wtaApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";

const TYPE_META: Record<string, { label: string; cls: string; icon: string }> = {
  delete: { label: "מחיקה", cls: "bg-red-100 text-red-700", icon: "🗑️" },
  warn: { label: "אזהרה", cls: "bg-amber-100 text-amber-700", icon: "⚠️" },
  kick: { label: "הרחקה", cls: "bg-rose-100 text-rose-700", icon: "🚪" },
  lock: { label: "נעילה", cls: "bg-slate-200 text-slate-700", icon: "🔒" },
  unlock: { label: "פתיחה", cls: "bg-emerald-100 text-emerald-700", icon: "🔓" },
};

export default function WtaLogsPage() {
  const [actions, setActions] = useState<any[]>([]);

  const fetchLog = useCallback(async () => {
    try {
      setActions((await wtaApi.get<any>("/logs")).data.actions ?? []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);
  useSSE(fetchLog);

  return (
    <div className="wtmbtb-scope h-full overflow-auto bg-slate-50 p-6" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-slate-800 mb-1">יומן מודרציה</h1>
        <p className="text-sm text-slate-400 mb-5">כל פעולות המודרציה מכל הלקוחות (300 אחרונות)</p>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {actions.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-slate-400">אין פעולות עדיין</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {actions.map((a) => {
                const m = TYPE_META[a.type] || TYPE_META.delete;
                return (
                  <div key={a._id} className="px-5 py-3 flex items-start gap-3">
                    <span className="text-lg leading-none flex-shrink-0">{m.icon}</span>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <span className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.cls}`}>{m.label}</span>
                        <span className="text-sm font-medium text-slate-800 truncate">{a.groupName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{a.clientName}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.actorName && <span>{a.actorName} · </span>}
                        <span className="text-slate-400">{a.reason}</span>
                      </p>
                      {a.textSnippet && <p className="text-xs text-slate-400 mt-1 bg-slate-50 rounded px-2 py-1 truncate">{a.textSnippet}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
