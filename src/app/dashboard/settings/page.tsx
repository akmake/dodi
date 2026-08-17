"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Save, Trash2, ShieldCheck, KeyRound, Loader2 } from "lucide-react";

function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
      <div className="mb-4">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</div>
      </div>
      <button onClick={onChange} className="w-11 h-6 rounded-full transition-all relative flex-shrink-0"
        style={{ background: value ? "var(--accent)" : "#D1D5DB" }}>
        <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
          style={{ right: value ? "4px" : "auto", left: value ? "auto" : "4px" }} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [ai, setAi] = useState(true);
  const [autoReply, setAutoReply] = useState(true);
  const [businessHours, setBusinessHours] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [saved, setSaved] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [notifEmail, setNotifEmail] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>הגדרות</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>ניהול החיבורים והתצורה של הפלטפורמה</p>
        </div>
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: saved ? "var(--accent-light)" : "var(--accent)", color: saved ? "var(--accent-dark)" : "#fff" }}>
          <Save size={14} /> {saved ? "נשמר!" : "שמור הכל"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="פרטי עסק">
          <div className="space-y-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>שם העסק</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="לדוגמה: מספרת יוסי"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>אזור זמן</label>
              <select className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
                <option value="Asia/Jerusalem">ישראל (UTC+3)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">ניו יורק (UTC-5)</option>
                <option value="Europe/London">לונדון (UTC+1)</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>הודעה בשעות סגירה</label>
              <textarea rows={2} placeholder="כרגע סגורים. נענה בשעות הפעילות."
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
            </div>
          </div>
        </Card>

        <Card title="חיבור וואטסאפ רשמי" subtitle="החיבור מנוהל עכשיו במרכז ייעודי עם נתונים חיים">
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            חשבון, webhook, טוקן גישה, דירוג איכות ובריאות החיבור — הכול עבר לדף "וואטסאפ רשמי".
          </p>
          <a href="/dashboard/whatsapp"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}>
            <ExternalLink size={12} /> למרכז הוואטסאפ
          </a>
        </Card>
      </div>

      {/* Bot behaviour */}
      <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
        <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>התנהגות הבוט</p>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>שלוט בפונקציות הפעילות</p>
        <Toggle label="AI פעיל" desc="הבוט יענה באמצעות ספק ה-AI שמוגדר בסביבה" value={ai} onChange={() => setAi(v => !v)} />
        <Toggle label="מענה אוטומטי" desc="הפעל כללי מילות מפתח לפני ה-AI" value={autoReply} onChange={() => setAutoReply(v => !v)} />
        <Toggle label="מצב שעות עסקים" desc="ענה רק בין השעות שהגדרת בפרטי העסק" value={businessHours} onChange={() => setBusinessHours(v => !v)} />
        <Toggle label="אישורי קריאה (✓✓)" desc="שלח אישור קריאה כשהבוט מקבל הודעה" value={readReceipts} onChange={() => setReadReceipts(v => !v)} />
        <div style={{ borderBottom: "none" }}>
          <Toggle label="התראות אימייל" desc="קבל אימייל כשהבוט נכשל לשלוח הודעה" value={notifications} onChange={() => setNotifications(v => !v)} />
        </div>
        {notifications && (
          <div className="mt-3">
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>אימייל להתראות</label>
            <input value={notifEmail} onChange={e => setNotifEmail(e.target.value)} placeholder="you@example.com" type="email"
              className="w-full max-w-sm px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl p-5" style={{ background: "#FFF5F5", border: "1px solid #FCA5A5" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "#DC2626" }}>אזור מסוכן</p>
        <p className="text-xs mb-4" style={{ color: "#EF4444" }}>פעולות בלתי הפיכות — שים לב!</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-lg" style={{ background: "#FEE2E2", border: "1px solid #FCA5A5" }}>
            <div className="flex items-center gap-2 mb-1">
              <Trash2 size={14} style={{ color: "#DC2626" }} />
              <span className="text-sm font-semibold" style={{ color: "#DC2626" }}>איפוס הגדרות</span>
            </div>
            <p className="text-xs mb-3" style={{ color: "#EF4444" }}>מוחק את כל הגדרות הבוט וחוזר לברירת מחדל</p>
            {confirmReset ? (
              <div className="flex gap-2">
                <button onClick={() => setConfirmReset(false)} className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "#fff", color: "#6B7280", border: "1px solid #D1D5DB" }}>ביטול</button>
                <button className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ background: "#DC2626", color: "#fff" }}>מאשר</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="w-full py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "#fff", color: "#DC2626", border: "1px solid #FCA5A5" }}>אפס הגדרות</button>
            )}
          </div>
          <div className="p-4 rounded-lg flex flex-col justify-center" style={{ background: "var(--bg-base)", border: "1px dashed var(--bg-border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              ניתוק חשבון הוואטסאפ עבר לדף <a href="/dashboard/whatsapp" style={{ color: "var(--accent)" }}>וואטסאפ רשמי</a>.
            </p>
          </div>
        </div>
      </div>

      <SecuritySettings />
    </div>
  );
}

function SecuritySettings() {
  const [enabled, setEnabled] = useState(false);
  const [enroll, setEnroll] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // SSO
  const [sso, setSso] = useState<{ issuer: string; clientId: string; enabled: boolean; autoProvision: boolean } | null>(null);
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      fetch("/api/auth/2fa").then((r) => (r.ok ? r.json() : { enabled: false })).catch(() => ({ enabled: false })),
      fetch("/api/auth/sso").then((r) => (r.ok ? r.json() : { config: null })).catch(() => ({ config: null })),
    ]);
    setEnabled(!!a.enabled);
    if (s.config) { setSso(s.config); setIssuer(s.config.issuer ?? ""); setClientId(s.config.clientId ?? ""); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function begin() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin" }) });
      const d = await r.json();
      if (r.ok) setEnroll(d); else setMsg(d.error ?? "שגיאה");
    } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", code }) });
      const d = await r.json();
      if (r.ok) { setEnabled(true); setEnroll(null); setCode(""); setMsg("2FA הופעל בהצלחה"); }
      else setMsg(d.error ?? "קוד שגוי");
    } finally { setBusy(false); }
  }
  async function disable() {
    await fetch("/api/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable" }) });
    setEnabled(false); setEnroll(null); setMsg(null);
  }
  async function saveSso() {
    if (!issuer || !clientId || !clientSecret) { setMsg("יש למלא issuer, clientId ו-clientSecret"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/sso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issuer, clientId, clientSecret, enabled: true }) });
      const d = await r.json();
      if (r.ok) { setSso(d.config); setClientSecret(""); setMsg("הגדרות SSO נשמרו"); } else setMsg(d.error ?? "שגיאה");
    } finally { setBusy(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm outline-none";
  const inputStyle: React.CSSProperties = { background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="אימות דו-שלבי (2FA)" subtitle="הגנה נוספת לחשבון עם אפליקציית authenticator">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} style={{ color: enabled ? "var(--accent)" : "var(--text-muted)" }} />
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>{enabled ? "מופעל" : "כבוי"}</span>
        </div>
        {enabled ? (
          <button onClick={disable} className="py-1.5 px-3 rounded-lg text-xs font-medium" style={{ background: "#fff", color: "#DC2626", border: "1px solid #FCA5A5" }}>בטל 2FA</button>
        ) : enroll ? (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>סרוק בקוד QR או הזן ידנית את המפתח:</p>
            <code className="block text-xs p-2 rounded" style={{ background: "var(--bg-base)", color: "var(--text-primary)", direction: "ltr", wordBreak: "break-all" }}>{enroll.secret}</code>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="קוד בן 6 ספרות" className={inputCls} style={{ ...inputStyle, direction: "ltr", textAlign: "center" }} />
            <button onClick={confirm} disabled={busy} className="py-1.5 px-3 rounded-lg text-xs font-medium text-white" style={{ background: "var(--accent)" }}>{busy ? <Loader2 size={12} className="animate-spin inline" /> : "אשר והפעל"}</button>
          </div>
        ) : (
          <button onClick={begin} disabled={busy} className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium text-white" style={{ background: "var(--accent)" }}><KeyRound size={13} /> הפעל 2FA</button>
        )}
      </Card>

      <Card title="כניסה מאוחדת (SSO / OIDC)" subtitle="חיבור לספק זהות ארגוני">
        <div className="space-y-2">
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Issuer URL (https://...)" className={inputCls} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} />
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" className={inputCls} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} />
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" placeholder={sso ? "Client Secret (שמור — הזן כדי להחליף)" : "Client Secret"} className={inputCls} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} />
          <button onClick={saveSso} disabled={busy} className="py-1.5 px-3 rounded-lg text-xs font-medium text-white" style={{ background: "var(--accent)" }}>{busy ? <Loader2 size={12} className="animate-spin inline" /> : "שמור SSO"}</button>
          {sso?.enabled && <p className="text-xs" style={{ color: "var(--accent-dark)" }}>SSO פעיל · {sso.issuer}</p>}
        </div>
      </Card>

      {msg && <p className="col-span-2 text-xs" style={{ color: "var(--accent-dark)" }}>{msg}</p>}
    </div>
  );
}
