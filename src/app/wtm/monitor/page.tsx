"use client";
// Port of Whatsapp/client/src/pages/DashboardPage.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import MetricCard from "@/components/wtmbtb/wtm/MetricCard";
import TenantRow from "@/components/wtmbtb/wtm/TenantRow";

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th className={`px-4 py-3 text-xs font-semibold text-[#8696a0] ${center ? "text-center" : "text-right"}`}>{children}</th>;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await wtmApi.get<any>("/dashboard");
      setData(res.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useSSE(fetchData);

  if (!data)
    return (
      <div className="h-full flex items-center justify-center text-[#8696a0]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">טוען נתונים...</p>
        </div>
      </div>
    );

  const { summary, tenants } = data;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "#eae6df" }}>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#111b21]">דשבורד ניטור</h2>
            <p className="text-xs text-[#8696a0] mt-0.5">עדכון אחרון: {lastUpdate ? lastUpdate.toLocaleTimeString("he-IL") : "—"}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#8696a0] bg-white px-3 py-1.5 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            עדכון בזמן אמת
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="סה״כ לקוחות" value={summary.total} icon="👥" color="text-[#111b21]" bg="bg-white" />
          <MetricCard label="מחוברים" value={summary.connected} icon="✅" color="text-[#075E54]" bg="bg-[#dcf8c6]" />
          <MetricCard label="מנותקים" value={summary.disconnected} icon="❌" color="text-red-600" bg="bg-red-50" />
          <MetricCard label="ממתינים לסריקה" value={summary.waitingQr} icon="📱" color="text-blue-600" bg="bg-blue-50" />
          <MetricCard label="מייל לא מוגדר" value={summary.emailNotConfigured} icon="⚠️" color="text-orange-600" bg="bg-orange-50" />
          <MetricCard label="WA → מייל" value={summary.totalWaToEmail} icon="💬" color="text-purple-600" bg="bg-purple-50" />
          <MetricCard label="מייל → WA" value={summary.totalEmailToWa} icon="📧" color="text-cyan-600" bg="bg-cyan-50" />
        </div>

        {tenants.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#d1d7db] p-16 text-center">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-[#8696a0] text-sm">אין לקוחות להצגה</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f0f2f5] bg-[#f0f2f5]/60">
                    <Th>לקוח</Th>
                    <Th>מספר WA</Th>
                    <Th>מייל תעבורה</Th>
                    <Th>מייל ייעד</Th>
                    <Th center>סטטוס WA</Th>
                    <Th center>גשר מייל</Th>
                    <Th center>WA→מייל</Th>
                    <Th center>מייל→WA</Th>
                    <Th>הודעה אחרונה</Th>
                    <Th>מחובר מאז</Th>
                    <Th center>reconnects</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f2f5]">
                  {tenants.map((t: any) => (
                    <TenantRow key={t._id} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
