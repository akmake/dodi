"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtaApi, ApiError } from "@/lib/wtmbtb/api";

const norm = (id: string) => id.replace(/:\d+$/, "");

export default function TabGroups({ client: c, onSaved }: { client: any; onSaved: () => void }) {
  const [managed, setManaged] = useState<any[]>(c.managedGroups ?? []);
  const [exemptAdmins, setExemptAdmins] = useState<boolean>(c.exemptAdmins ?? true);
  const [logMessages, setLogMessages] = useState<boolean>(c.logMessages ?? false);
  const [allGroups, setAllGroups] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchGroups = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await wtaApi.get<any>(`/clients/${c._id}/wa-groups`);
      setAllGroups(res.data.groups);
    } catch (e) {
      setError(e instanceof ApiError ? e.response.data.error || "שגיאה בשליפת קבוצות" : "שגיאה בשליפת קבוצות");
    } finally {
      setLoading(false);
    }
  };

  const isManaged = (groupId: string) => managed.some((g) => norm(g.groupId) === norm(groupId));

  const toggle = (group: any) => {
    setManaged((prev) =>
      isManaged(group.groupId)
        ? prev.filter((g) => norm(g.groupId) !== norm(group.groupId))
        : [...prev, { groupId: group.groupId, groupName: group.groupName, enabled: true }]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await wtaApi.put(`/clients/${c._id}`, { action: "groups", managedGroups: managed, exemptAdmins, logMessages });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const [locking, setLocking] = useState("");
  const doLock = async (groupId: string, lock: boolean) => {
    setLocking(groupId + lock);
    try {
      await wtaApi.post(`/clients/${c._id}/lock`, { groupId, lock });
    } catch (e) {
      alert(e instanceof ApiError ? e.response.data.error || "הפעולה נכשלה" : "הפעולה נכשלה");
    } finally {
      setLocking("");
    }
  };

  const savedManaged = (c.managedGroups ?? []).filter((g: any) => g.enabled);

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? "bg-purple-600" : "bg-slate-200"}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );

  return (
    <div className="p-6 space-y-5">
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-right">
        <p className="text-sm font-semibold text-purple-900">קבוצות בפיקוח</p>
        <p className="text-xs text-purple-700/70 mt-1 leading-relaxed">
          הבוט יאכוף חוקים רק בקבוצות שסומנו כאן. ⚠️ ודא שהמספר המחובר הוא <b>מנהל</b> בקבוצה — אחרת אי אפשר למחוק הודעות או לנעול.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="flex items-center justify-between px-4 py-3.5">
          <Toggle on={exemptAdmins} onClick={() => setExemptAdmins((p) => !p)} />
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">פטור למנהלים</p>
            <p className="text-xs text-slate-400 mt-0.5">חוקי מחיקה לא חלים על מנהלי הקבוצה</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <Toggle on={logMessages} onClick={() => setLogMessages((p) => !p)} />
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">תיעוד הודעות</p>
            <p className="text-xs text-slate-400 mt-0.5">שמירת הודעות הקבוצה לצורך ניתוח (נמחק אוטומטית אחרי 30 יום)</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <button onClick={fetchGroups} disabled={loading || c.waStatus !== "connected"} className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-40 transition flex items-center gap-1">
            {loading ? "..." : "↺ רענן רשימה"}
          </button>
          <h3 className="text-sm font-semibold text-slate-800">קבוצות זמינות</h3>
        </div>

        {error && <div className="px-5 py-3 text-sm text-red-600 bg-red-50 text-right">{error}</div>}

        {c.waStatus !== "connected" && !allGroups && (
          <div className="px-5 py-6 text-center text-sm text-slate-400">יש לחבר את הוואטסאפ של הלקוח כדי לשלוף קבוצות</div>
        )}

        {allGroups && allGroups.length === 0 && <div className="px-5 py-6 text-center text-sm text-slate-400">לא נמצאו קבוצות</div>}

        {allGroups && allGroups.length > 0 && (
          <div className="divide-y divide-slate-100">
            {allGroups.map((g) => {
              const on = isManaged(g.groupId);
              return (
                <div key={g.groupId} onClick={() => toggle(g)} className={`flex items-center justify-between px-5 py-3 cursor-pointer transition ${on ? "bg-purple-50" : "hover:bg-slate-50"}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${on ? "bg-purple-600 border-purple-600" : "border-slate-300"}`}>
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

        {!allGroups && managed.length > 0 && (
          <div className="divide-y divide-slate-100">
            {managed.map((g) => (
              <div key={g.groupId} className="flex items-center justify-between px-5 py-3 bg-purple-50">
                <button onClick={() => setManaged((p) => p.filter((x) => norm(x.groupId) !== norm(g.groupId)))} className="text-xs text-red-400 hover:text-red-600 transition">
                  הסר
                </button>
                <p className="text-sm font-medium text-slate-800">{g.groupName}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {managed.length > 0 && <p className="text-xs text-slate-400 text-center">{managed.length} קבוצות בפיקוח</p>}

      <button onClick={save} disabled={saving} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
        {saving ? "שומר..." : "שמור הגדרות"}
      </button>

      {savedManaged.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 text-right">
            <h3 className="text-sm font-semibold text-slate-800">נעילה ידנית</h3>
            <p className="text-xs text-slate-400 mt-0.5">נעל/פתח קבוצה מיד (רק מנהלים כותבים ⇄ פתוח לכולם)</p>
          </div>
          <div className="divide-y divide-slate-100">
            {savedManaged.map((g: any) => (
              <div key={g.groupId} className="flex items-center justify-between px-5 py-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => doLock(g.groupId, true)}
                    disabled={locking === g.groupId + "true" || c.waStatus !== "connected"}
                    className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                  >
                    🔒 נעל
                  </button>
                  <button
                    onClick={() => doLock(g.groupId, false)}
                    disabled={locking === g.groupId + "false" || c.waStatus !== "connected"}
                    className="text-xs font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                  >
                    🔓 פתח
                  </button>
                </div>
                <p className="text-sm font-medium text-slate-800 truncate">{g.groupName}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
