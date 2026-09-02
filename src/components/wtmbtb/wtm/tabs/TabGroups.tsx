"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabGroups.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtmApi, ApiError } from "@/lib/wtmbtb/api";

export default function TabGroups({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(tenant.groupsEnabled ?? false);
  const [allowed, setAllowed] = useState<any[]>(tenant.allowedGroups ?? []);
  const [allGroups, setAllGroups] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchGroups = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await wtmApi.get<any>(`/clients/${tenant._id}/wa-groups`);
      setAllGroups(res.data.groups);
    } catch (e) {
      setError(e instanceof ApiError ? e.response.data.error || "שגיאה בשליפת קבוצות" : "שגיאה בשליפת קבוצות");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (group: any) => {
    const exists = allowed.some((g) => g.groupId === group.groupId);
    setAllowed(exists ? allowed.filter((g) => g.groupId !== group.groupId) : [...allowed, { groupId: group.groupId, groupName: group.groupName }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await wtmApi.put(`/clients/${tenant._id}`, { action: "groups", groupsEnabled: enabled, allowedGroups: allowed });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const isAllowed = (groupId: string) => allowed.some((g) => g.groupId === groupId);

  return (
    <div className="p-6 space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-800">תמיכה בקבוצות</p>
          <p className="text-xs text-slate-400 mt-0.5">הפעל כדי להעביר הודעות מקבוצות מורשות למייל</p>
        </div>
        <button onClick={() => setEnabled((p: boolean) => !p)} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-indigo-600" : "bg-slate-200"}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${enabled ? "left-5" : "left-0.5"}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <button
            onClick={fetchGroups}
            disabled={loading || tenant.waStatus !== "connected"}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition flex items-center gap-1"
          >
            {loading ? "..." : "↺ רענן רשימה"}
          </button>
          <h3 className="text-sm font-semibold text-slate-800">קבוצות מורשות</h3>
        </div>

        {error && <div className="px-5 py-3 text-sm text-red-600 bg-red-50 text-right">{error}</div>}

        {tenant.waStatus !== "connected" && !allGroups && (
          <div className="px-5 py-6 text-center text-sm text-slate-400">יש לחבר את הוואצאפ של הלקוח כדי לשלוף קבוצות</div>
        )}

        {allGroups && allGroups.length === 0 && <div className="px-5 py-6 text-center text-sm text-slate-400">לא נמצאו קבוצות</div>}

        {allGroups && allGroups.length > 0 && (
          <div className="divide-y divide-slate-100">
            {allGroups.map((g) => {
              const on = isAllowed(g.groupId);
              return (
                <div key={g.groupId} onClick={() => toggle(g)} className={`flex items-center justify-between px-5 py-3 cursor-pointer transition ${on ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${on ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                    {on && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="text-right mr-3">
                    <p className="text-sm font-medium text-slate-800">{g.groupName}</p>
                    <p className="text-xs text-slate-400">{g.size} משתתפים</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!allGroups && allowed.length > 0 && (
          <div className="divide-y divide-slate-100">
            {allowed.map((g) => (
              <div key={g.groupId} className="flex items-center justify-between px-5 py-3 bg-indigo-50">
                <button onClick={() => setAllowed((p) => p.filter((x) => x.groupId !== g.groupId))} className="text-xs text-red-400 hover:text-red-600 transition">
                  הסר
                </button>
                <p className="text-sm font-medium text-slate-800">{g.groupName}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {allowed.length > 0 && <p className="text-xs text-slate-400 text-center">{allowed.length} קבוצות מורשות</p>}

      <button onClick={save} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
        {saving ? "שומר..." : "שמור הגדרות"}
      </button>
    </div>
  );
}
