"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabEmail.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtmApi, ApiError } from "@/lib/wtmbtb/api";
import { BRIDGE_STATUS } from "@/components/wtmbtb/ui/constants";

const INPUT =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white";

export default function TabEmail({ tenant: t, onSaved }: { tenant: any; onSaved: () => void }) {
  const bridge = t.bridge || {};
  const bsKey = bridge.active ? "active" : t.bridgeEmail ? "disconnected" : "inactive";
  const bs = BRIDGE_STATUS[bsKey];

  const STATUS_STYLE: Record<string, any> = {
    active: { bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-700" },
    disconnected: { bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500", text: "text-amber-700" },
    inactive: { bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400", text: "text-slate-500" },
  };
  const ss = STATUS_STYLE[bsKey] || STATUS_STYLE.inactive;

  const [ef, setEf] = useState({
    bridgeEmail: t.bridgeEmail || "",
    bridgeEmailPassword: "",
    destinationEmail: t.destinationEmail || "",
    emailSignature: t.emailSignature || "",
  });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = (k: string, v: any) => setEf((p) => ({ ...p, [k]: v }));

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await wtmApi.put<any>(`/clients/${t._id}`, { action: "email-config", ...ef });
      setSaveResult(res.data.imapOk ? { ok: true, msg: "נשמר — המייל מחובר ופועל" } : { ok: false, msg: `נשמר — IMAP נכשל: ${res.data.imapError}` });
      onSaved();
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof ApiError ? err.response.data.error || "שגיאה" : "שגיאה" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className={`rounded-xl border p-4 ${ss.bg}`}>
        <div className="flex items-center justify-end gap-2">
          <span className={`text-sm font-semibold ${ss.text}`}>{bs.text}</span>
          <span className={`w-2 h-2 rounded-full ${ss.dot}`} />
        </div>
        {t.bridgeEmail && <p className="text-xs text-slate-500 mt-1 text-right font-mono">{t.bridgeEmail}</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 text-right">
          <h3 className="text-sm font-semibold text-slate-800">הגדרות חיבור מייל</h3>
        </div>
        <form onSubmit={saveEmail} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">מייל תעבורה</label>
            <input className={INPUT} type="email" placeholder="bridge@gmail.com" required value={ef.bridgeEmail} onChange={(e) => set("bridgeEmail", e.target.value)} />
            <p className="text-xs text-slate-400 mt-1 text-right">ה-Gmail שיצרת ללקוח — המערכת שולחת ממנו ומאזינה לתשובות</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">App Password</label>
            <input
              className={`${INPUT} font-mono`}
              type="text"
              autoComplete="off"
              placeholder="xxxx xxxx xxxx xxxx (ריק = ללא שינוי)"
              value={ef.bridgeEmailPassword}
              onChange={(e) => set("bridgeEmailPassword", e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1 text-right">Google Account → Security → App Passwords</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">מייל ייעד</label>
            <input className={INPUT} type="email" placeholder="client@gmail.com" required value={ef.destinationEmail} onChange={(e) => set("destinationEmail", e.target.value)} />
            <p className="text-xs text-slate-400 mt-1 text-right">המייל האישי של הלקוח — לכאן מגיעות ההודעות</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                בודק חיבור...
              </>
            ) : (
              "שמור ובדוק חיבור"
            )}
          </button>

          {saveResult && (
            <div
              className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 border ${saveResult.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}
            >
              <span className="flex-shrink-0">{saveResult.ok ? "✓" : "✕"}</span>
              <span>{saveResult.msg}</span>
            </div>
          )}
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 text-right">
          <h3 className="text-sm font-semibold text-slate-800">חתימה אוטומטית</h3>
          <p className="text-xs text-slate-400 mt-0.5">הטקסט שמוגדר כאן יימחק אוטומטית מכל תגובה לפני שליחה לוואטסאפ</p>
        </div>
        <div className="p-5">
          <textarea
            rows={4}
            value={ef.emailSignature}
            onChange={(e) => set("emailSignature", e.target.value)}
            placeholder={"בברכה,\nשם המשתמש\n052-0000000"}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition resize-none font-mono"
          />
          <button
            onClick={async () => {
              setSaving(true);
              try {
                await wtmApi.put(`/clients/${t._id}`, { action: "email-config", ...ef });
                onSaved();
                setSaveResult({ ok: true, msg: "חתימה נשמרה" });
              } catch {
                setSaveResult({ ok: false, msg: "שגיאה בשמירת חתימה" });
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="mt-3 w-full bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-semibold transition"
          >
            שמור חתימה
          </button>
        </div>
      </div>
    </div>
  );
}
