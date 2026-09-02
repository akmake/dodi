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

function StatBox({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
      <p className={`text-2xl font-black ${cls}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

export default function TabActivity({ client: c }: { client: any }) {
  const [actions, setActions] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  const fetchLog = useCallback(async () => {
    try {
      const res = await wtaApi.get<any>(`/clients/${c._id}/actions`);
      setActions(res.data.actions ?? []);
      setStats(res.data.stats ?? {});
    } catch (e) {
      console.error(e);
    }
  }, [c._id]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);
  useSSE(fetchLog);

  return (
    <div className="p-6 space-y-5">
      <div>
        <p className="text-xs text-slate-400 mb-2 text-right">7 ימים אחרונים</p>
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="מחיקות" value={stats.delete ?? 0} cls="text-red-600" />
          <StatBox label="אזהרות" value={stats.warn ?? 0} cls="text-amber-600" />
          <StatBox label="הרחקות" value={stats.kick ?? 0} cls="text-rose-600" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-right">
          <h3 className="text-sm font-semibold text-slate-800">יומן פעולות</h3>
        </div>
        {actions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">אין פעולות עדיין</div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
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
  );
}
