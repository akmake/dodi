"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wreApi, ApiError } from "@/lib/wtmbtb/api";

interface WatchedGroup {
  groupId: string;
  groupName: string;
  enabled: boolean;
  defaultCity: string;
  hint: string;
}

/** The engine's `fetchGroups` shape (wa-engine/whatsappManager.ts) — `groupId` already has `@g.us` stripped. */
interface WaGroup {
  groupId: string;
  groupName: string;
  size: number;
}

const bare = (id: string) => (id ?? "").replace("@g.us", "").replace(/:\d+$/, "");

export default function TabGroups({ client, onSaved }: { client: any; onSaved: () => void }) {
  const [waGroups, setWaGroups] = useState<WaGroup[]>([]);
  const [rows, setRows] = useState<WatchedGroup[]>(client.watchedGroups ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await wreApi.get<any>(`/clients/${client._id}/wa-groups`);
      setWaGroups(res.data.groups ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "שגיאה בטעינת הקבוצות" : "שגיאה בטעינת הקבוצות");
    } finally {
      setLoading(false);
    }
  }, [client._id]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const rowFor = (groupId: string) => rows.find((r) => bare(r.groupId) === bare(groupId));

  const toggle = (groupId: string, groupName: string) => {
    const existing = rowFor(groupId);
    if (existing) {
      setRows(rows.map((r) => (bare(r.groupId) === bare(groupId) ? { ...r, enabled: !r.enabled } : r)));
    } else {
      setRows([...rows, { groupId: bare(groupId), groupName, enabled: true, defaultCity: "", hint: "" }]);
      setExpanded(bare(groupId));
    }
  };

  const patch = (groupId: string, field: "defaultCity" | "hint", value: string) => {
    setRows(rows.map((r) => (bare(r.groupId) === bare(groupId) ? { ...r, [field]: value } : r)));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await wreApi.put(`/clients/${client._id}`, { action: "groups", watchedGroups: rows });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "שמירה נכשלה" : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <div className="p-6 space-y-4" style={{ direction: "rtl" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-800">קבוצות להאזנה</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
            סמן את הקבוצות שמהן לאסוף דירות. לכל קבוצה אפשר להגדיר <strong>עיר ברירת-מחדל</strong> — הכרחי בקבוצות
            עירוניות שבהן אנשים כותבים &quot;וייצמן 13&quot; בלי לציין את העיר. עיר שמופיעה בהודעה עצמה תמיד גוברת.
          </p>
        </div>
        <button onClick={loadGroups} disabled={loading} className="flex-shrink-0 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
          {loading ? "טוען..." : "רענן"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {!loading && waGroups.length === 0 && !error && (
        <p className="text-sm text-slate-400 py-8 text-center">אין קבוצות להצגה. ודא שהבוט מחובר ונמצא בקבוצות.</p>
      )}

      <div className="space-y-2">
        {waGroups.map((g) => {
          const row = rowFor(g.groupId);
          const on = !!row?.enabled;
          const isOpen = expanded === bare(g.groupId);
          return (
            <div key={g.groupId} className={`border rounded-xl transition ${on ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={on} onChange={() => toggle(g.groupId, g.groupName)} className="w-4 h-4 accent-emerald-600 flex-shrink-0" />
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{g.groupName || bare(g.groupId)}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{g.size} חברים</span>
                {on && row?.defaultCity && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex-shrink-0">{row.defaultCity}</span>
                )}
                {on && (
                  <button onClick={() => setExpanded(isOpen ? null : bare(g.groupId))} className="text-xs text-emerald-700 hover:underline flex-shrink-0">
                    {isOpen ? "סגור" : "הגדרות"}
                  </button>
                )}
              </div>

              {on && isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-emerald-100">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">עיר ברירת-מחדל</label>
                    <input
                      className="input-base"
                      placeholder="קרית מלאכי"
                      value={row?.defaultCity ?? ""}
                      onChange={(e) => patch(g.groupId, "defaultCity", e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      משמש רק כשההודעה לא מציינת עיר. בלי זה, הודעות בלי עיר לא ימופו.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">רמז על מבנה ההודעות (אופציונלי)</label>
                    <textarea
                      className="input-base min-h-[64px] resize-y"
                      placeholder='לדוגמה: "בקבוצה הזו כותבים קודם מחיר ואז כתובת. ״פינוי מיידי״ הכוונה להשכרה."'
                      value={row?.hint ?? ""}
                      onChange={(e) => patch(g.groupId, "hint", e.target.value)}
                      maxLength={500}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">נשלח ל-AI יחד עם ההודעה. עוזר בקבוצות עם סגנון כתיבה חריג.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-400">{enabledCount} קבוצות פעילות</span>
        <button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50">
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}
