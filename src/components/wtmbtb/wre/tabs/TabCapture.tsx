"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wreApi, ApiError } from "@/lib/wtmbtb/api";

export default function TabCapture({ client, onSaved }: { client: any; onSaved: () => void }) {
  const [minConfidence, setMinConfidence] = useState<number>(client.minConfidence ?? 0.5);
  const [minTextLength, setMinTextLength] = useState<number>(client.minTextLength ?? 25);
  const [dedupEnabled, setDedupEnabled] = useState<boolean>(client.dedupEnabled ?? true);
  const [dedupWindowHours, setDedupWindowHours] = useState<number>(client.dedupWindowHours ?? 72);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await wreApi.put(`/clients/${client._id}`, {
        action: "capture",
        minConfidence,
        minTextLength,
        dedupEnabled,
        dedupWindowHours,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "שמירה נכשלה" : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl" style={{ direction: "rtl" }}>
      <div>
        <h3 className="text-base font-bold text-slate-800">הגדרות איסוף</h3>
        <p className="text-xs text-slate-500 mt-1">שולט מה נחשב דירה, ומתי פרסום חוזר נחשב לאותה דירה.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          סף ביטחון מינימלי: <span className="text-emerald-700 font-bold">{Math.round(minConfidence * 100)}%</span>
        </label>
        <input type="range" min={0} max={1} step={0.05} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className="w-full accent-emerald-600" />
        <p className="text-[11px] text-slate-400 mt-1">
          הודעות שה-AI פחות בטוח לגביהן מהסף יידחו לגמרי. סף גבוה = פחות רעש אבל יותר דירות שיוחמצו.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">אורך הודעה מינימלי (תווים)</label>
        <input type="number" min={0} max={500} value={minTextLength} onChange={(e) => setMinTextLength(Number(e.target.value))} className="input-base w-32" />
        <p className="text-[11px] text-slate-400 mt-1">
          הודעות קצרות מזה נזרקות עוד <em>לפני</em> הפנייה ל-AI — כך פטפוט (&quot;תודה&quot;, &quot;עדיין רלוונטי?&quot;) לא עולה כסף.
        </p>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={dedupEnabled} onChange={(e) => setDedupEnabled(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          <span className="text-sm font-medium text-slate-700">אחד פרסומים חוזרים של אותה דירה</span>
        </label>
        <p className="text-[11px] text-slate-400 mt-1 mb-3">
          אותה דירה שמפורסמת שוב (או מוצלבת לכמה קבוצות) לא תיצור שורה חדשה — היא תעדכן את הקיימת ותקדם מונה.
        </p>
        {dedupEnabled && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">חלון איחוד (שעות)</label>
            <input type="number" min={1} max={8760} value={dedupWindowHours} onChange={(e) => setDedupWindowHours(Number(e.target.value))} className="input-base w-32" />
            <p className="text-[11px] text-slate-400 mt-1">אחרי חלון זה, אותה דירה תיחשב שוב כדירה חדשה.</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50">
        {saving ? "שומר..." : "שמור"}
      </button>
    </div>
  );
}
