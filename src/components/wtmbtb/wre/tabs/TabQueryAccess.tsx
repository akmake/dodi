"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wreApi, ApiError } from "@/lib/wtmbtb/api";

const IL_MOBILE = /^05\d{8}$/;
const normalize = (raw: string) => raw.replace(/\D/g, "").replace(/^972/, "0");

export default function TabQueryAccess({ client, onSaved }: { client: any; onSaved: () => void }) {
  const [rows, setRows] = useState<string[]>(client.allowedQueryPhones ?? []);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const add = () => {
    const n = normalize(draft);
    setError("");
    if (!IL_MOBILE.test(n)) {
      setError('מספר לא תקין — פורמט "050-1234567"');
      return;
    }
    if (rows.includes(n)) {
      setError("המספר הזה כבר ברשימה");
      return;
    }
    setRows([...rows, n]);
    setDraft("");
  };

  const remove = (n: string) => setRows(rows.filter((r) => r !== n));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await wreApi.put(`/clients/${client._id}`, { action: "queryAccess", allowedQueryPhones: rows });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "שמירה נכשלה" : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-xl" style={{ direction: "rtl" }}>
      <div>
        <h3 className="text-base font-bold text-slate-800">גישה לחיפוש-דירות במיקום</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          מספרים ברשימה הזו יכולים לשלוח <strong>מיקום</strong> בוואטסאפ ישירות למספר הבוט, לענות באיזה טווח (בק״מ),
          ולקבל בחזרה את כל הדירות ה&quot;טופל · במפה&quot; בטווח הזה — ממוין לפי מרחק. כל מספר אחר שכותב לבוט
          ישירות — מתעלמים ממנו לגמרי.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          className="input-base flex-1"
          placeholder="050-1234567"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition flex-shrink-0">
          הוסף
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">אין מספרים ברשימה — אף אחד לא יכול להשתמש בחיפוש הזה.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((n) => (
            <div key={n} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-sm text-slate-700 font-mono" dir="ltr">{n}</span>
              <button onClick={() => remove(n)} className="text-xs text-slate-400 hover:text-red-600 transition">
                הסר
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-400">{rows.length} מספרים מורשים</span>
        <button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50">
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}
