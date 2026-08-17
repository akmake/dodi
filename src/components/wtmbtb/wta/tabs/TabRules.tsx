"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wtaApi, ApiError } from "@/lib/wtmbtb/api";

const ACTION_LABEL: Record<string, string> = { delete: "מחיקה בלבד", warn: "מחיקה + אזהרה", kick: "מחיקה + הרחקה" };
const MODE_LABEL: Record<string, string> = { contains: "מכיל", exact: "מילה מדויקת", regex: "ביטוי רגולרי" };
const TYPE_LABEL: Record<string, string> = { keyword_delete: "מילים אסורות", link_delete: "קישורים / הזמנות", admin_only_schedule: "נעילה לפי שעות" };
const DAY_NAMES = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition";

function RuleForm({ clientId, onDone, onCancel }: { clientId: string; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<"keyword_delete" | "link_delete" | "admin_only_schedule">("keyword_delete");
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [mode, setMode] = useState("contains");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [includeInviteLinks, setInvite] = useState(true);
  const [includeAllLinks, setAllLinks] = useState(false);
  const [allowlist, setAllowlist] = useState("");
  const [onMatch, setOnMatch] = useState("delete");
  const [warnText, setWarnText] = useState("");
  const [lockAt, setLockAt] = useState("22:00");
  const [unlockAt, setUnlockAt] = useState("07:00");
  const [days, setDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleDay = (d: number) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      let payload: any;
      if (type === "keyword_delete") {
        payload = { type, name, onMatch, warnText, words: words.split(/[\n,]/).map((w) => w.trim()).filter(Boolean), mode, caseSensitive };
      } else if (type === "link_delete") {
        payload = { type, name, onMatch, warnText, includeInviteLinks, includeAllLinks, allowlist: allowlist.split(/[\n,]/).map((d) => d.trim()).filter(Boolean) };
      } else {
        payload = { type, name, lockAt, unlockAt, days };
      }
      await wtaApi.post(`/clients/${clientId}/rules`, payload);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "שגיאה" : "שגיאה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-purple-200 p-5 space-y-4">
      <div className="flex gap-2">
        {(["keyword_delete", "link_delete", "admin_only_schedule"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${type === t ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">שם החוק</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={TYPE_LABEL[type]} />
      </div>

      {type === "keyword_delete" && (
        <>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">מילים (מופרדות בפסיק או שורה)</label>
            <textarea className={inputCls} rows={3} value={words} onChange={(e) => setWords(e.target.value)} placeholder="מילה1, מילה2, מילה3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">אופן התאמה</label>
              <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="contains">מכיל</option>
                <option value="exact">מילה מדויקת</option>
                <option value="regex">ביטוי רגולרי</option>
              </select>
            </div>
            <label className="flex items-center gap-2 mt-6 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="accent-purple-600" />
              רגיש לאותיות
            </label>
          </div>
        </>
      )}

      {type === "link_delete" && (
        <div className="space-y-2">
          <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={includeInviteLinks} onChange={(e) => setInvite(e.target.checked)} className="accent-purple-600" />
            <span>חסום קישורי הזמנה לקבוצות (chat.whatsapp.com)</span>
          </label>
          <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={includeAllLinks} onChange={(e) => setAllLinks(e.target.checked)} className="accent-purple-600" />
            <span>חסום כל קישור (http/www)</span>
          </label>
          {includeAllLinks && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">דומיינים מותרים (חריגים)</label>
              <input className={inputCls} value={allowlist} onChange={(e) => setAllowlist(e.target.value)} placeholder="youtube.com, mysite.co.il" />
            </div>
          )}
        </div>
      )}

      {type === "admin_only_schedule" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">שעת נעילה (רק מנהלים)</label>
              <input type="time" className={inputCls} value={lockAt} onChange={(e) => setLockAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">שעת פתיחה (לכולם)</label>
              <input type="time" className={inputCls} value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">ימים (ריק = כל יום)</label>
            <div className="flex gap-1.5 justify-center">
              {DAY_NAMES.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)} className={`w-9 h-9 rounded-full text-sm font-medium transition ${days.includes(i) ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center">חל על כל הקבוצות בפיקוח. ⚠️ הבוט חייב להיות מנהל.</p>
        </>
      )}

      {type !== "admin_only_schedule" && (
        <>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">פעולה בהפרה</label>
            <select className={inputCls} value={onMatch} onChange={(e) => setOnMatch(e.target.value)}>
              <option value="delete">מחיקה בלבד</option>
              <option value="warn">מחיקה + אזהרה בקבוצה</option>
              <option value="kick">מחיקה + הרחקה מהקבוצה</option>
            </select>
          </div>
          {(onMatch === "warn" || onMatch === "kick") && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">טקסט אזהרה</label>
              <input className={inputCls} value={warnText} onChange={(e) => setWarnText(e.target.value)} placeholder="ההודעה נמחקה — אסור לפרסם כאן תוכן זה." />
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
          {saving ? "שומר..." : "צור חוק"}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-200 transition">
          ביטול
        </button>
      </div>
    </form>
  );
}

function ruleSummary(r: any): string {
  if (r.type === "keyword_delete") return `${(r.words ?? []).length} מילים · ${MODE_LABEL[r.mode] || r.mode} · ${ACTION_LABEL[r.onMatch] || r.onMatch}`;
  if (r.type === "link_delete") return `${[r.includeInviteLinks && "הזמנות", r.includeAllLinks && "כל קישור"].filter(Boolean).join(" · ")} · ${ACTION_LABEL[r.onMatch] || r.onMatch}`;
  const dayTxt = r.days?.length ? r.days.map((d: number) => DAY_NAMES[d]).join(",") : "כל יום";
  return `נעילה ${r.lockAt}–${r.unlockAt} · ${dayTxt}`;
}

export default function TabRules({ client: c }: { client: any }) {
  const [rules, setRules] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      setRules((await wtaApi.get<any[]>(`/clients/${c._id}/rules`)).data);
    } catch (e) {
      console.error(e);
    }
  }, [c._id]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const toggle = async (r: any) => {
    await wtaApi.put(`/clients/${c._id}/rules/${r._id}`, { enabled: !r.enabled });
    fetchRules();
  };
  const remove = async (r: any) => {
    if (!confirm(`למחוק את החוק "${r.name}"?`)) return;
    await wtaApi.del(`/clients/${c._id}/rules/${r._id}`);
    fetchRules();
  };

  return (
    <div className="p-6 space-y-4">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2">
          <span className="text-lg leading-none">+</span> חוק מודרציה חדש
        </button>
      )}

      {adding && <RuleForm clientId={c._id} onDone={() => { setAdding(false); fetchRules(); }} onCancel={() => setAdding(false)} />}

      {rules.length === 0 && !adding && <p className="text-center text-sm text-slate-400 py-8">אין חוקים עדיין — צור את הראשון</p>}

      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r._id} className={`bg-white rounded-xl border p-4 ${r.enabled ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggle(r)} className={`relative w-9 h-5 rounded-full transition-colors ${r.enabled ? "bg-purple-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.enabled ? "left-4" : "left-0.5"}`} />
                </button>
                <button onClick={() => remove(r)} className="text-xs text-red-400 hover:text-red-600 transition">מחק</button>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{TYPE_LABEL[r.type]}</span>
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                </div>
                <p className="text-xs text-slate-500 mt-1">{ruleSummary(r)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
