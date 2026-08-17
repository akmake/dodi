"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wtaApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import { WA_STATUS } from "@/components/wtmbtb/ui/constants";

export default function WtaMonitorPage() {
  const [data, setData] = useState<any>({ total: 0, active: 0, connected: 0, rows: [] });

  const fetchStatus = useCallback(async () => {
    try {
      setData((await wtaApi.get<any>("/pool-status")).data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);
  useSSE(fetchStatus);

  return (
    <div className="wtmbtb-scope h-full overflow-auto bg-slate-50 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-slate-800 mb-1">ניטור חיבורים</h1>
        <p className="text-sm text-slate-400 mb-5">מצב החיבור של כל בוט (always-on)</p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-black text-slate-800">{data.total}</p>
            <p className="text-xs text-slate-400 mt-1">סה"כ לקוחות</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-black text-purple-600">{data.active}</p>
            <p className="text-xs text-slate-400 mt-1">פעילים</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-black text-emerald-600">{data.connected}</p>
            <p className="text-xs text-slate-400 mt-1">מחוברים</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {(data.rows ?? []).length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">אין לקוחות עדיין</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.rows.map((r: any) => {
                const ws = WA_STATUS[r.status] || WA_STATUS.disconnected;
                return (
                  <div key={r._id} className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-xs flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${ws.dot}`} />
                      <span className="text-slate-500">{ws.text}</span>
                    </span>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-800">
                        {r.name}
                        {!r.active && <span className="text-[10px] text-amber-600 mr-2">(מושבת)</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.phone} · {r.managedGroups} קבוצות בפיקוח
                      </p>
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
