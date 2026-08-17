"use client";

/**
 * מרכז וואטסאפ רשמי — [קטגוריה 2] §2.1.
 *
 * The single dashboard home for the tenant's official WhatsApp (Cloud API)
 * connection: live account details, webhook health, token state, quality
 * rating and disconnect. Everything is LIVE from /api/whatsapp/account —
 * no hardcoded values (the old settings cards were mockups).
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Loader2,
  Pencil, RefreshCw, ShieldCheck, WifiOff, X,
} from "lucide-react";

interface WebhookIssue { at: string; level: "error" | "warn"; message: string }

interface ConnectionStatus {
  source: "db" | "env" | "none";
  connected: boolean;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  accountStatus: string | null;
  tokenPreview: string | null;
  tokenUpdatedAt: string | null;
  tokenExpiresAt: string | null;
  webhookConfigured: boolean;
  health: {
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    recentWebhookIssues: WebhookIssue[];
  };
}

const QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  GREEN: { label: "ירוק — תקין", color: "#16A34A" },
  YELLOW: { label: "צהוב — אזהרה", color: "#D97706" },
  RED: { label: "אדום — בסיכון", color: "#DC2626" },
  UNKNOWN: { label: "לא ידוע", color: "var(--text-muted)" },
};

const TIER_LABELS: Record<string, string> = {
  TIER_250: "עד 250 שיחות/יום",
  TIER_1K: "עד 1,000 שיחות/יום",
  TIER_10K: "עד 10,000 שיחות/יום",
  TIER_100K: "עד 100,000 שיחות/יום",
  UNLIMITED: "ללא הגבלה",
};

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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 rounded-lg text-sm font-mono truncate" dir="ltr"
          style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-muted)", textAlign: "left" }}>
          {value}
        </div>
        <button onClick={copy} className="p-2 rounded-lg flex-shrink-0"
          style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}>
          {copied ? <CheckCircle2 size={14} style={{ color: "var(--accent)" }} /> : <Copy size={14} style={{ color: "var(--text-muted)" }} />}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--bg-border)" }}>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "אף פעם";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק'`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `לפני ${hrs} שע'`;
  return `לפני ${Math.floor(hrs / 24)} ימים`;
}

export default function WhatsAppHubPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");

  // Connect / edit form
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phoneNumberId: "", wabaId: "", displayPhoneNumber: "", accessToken: "" });
  const [saving, setSaving] = useState(false);

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/account", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setStatus(await r.json());
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
    load();
  }, [load]);

  function openEdit() {
    setForm({
      phoneNumberId: status?.phoneNumberId ?? "",
      wabaId: status?.wabaId ?? "",
      displayPhoneNumber: status?.displayPhoneNumber ?? "",
      accessToken: "",
    });
    setEditing(true);
  }

  async function save() {
    if (!form.phoneNumberId.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/whatsapp/account", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: form.phoneNumberId,
          wabaId: form.wabaId || undefined,
          displayPhoneNumber: form.displayPhoneNumber || undefined,
          accessToken: form.accessToken || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setStatus(await r.json());
      setEditing(false);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      const r = await fetch("/api/whatsapp/account", { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setConfirmDisconnect(false);
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  const quality = QUALITY_LABELS[status?.qualityRating ?? "UNKNOWN"] ?? QUALITY_LABELS.UNKNOWN;
  const hasIssues = (status?.health.recentWebhookIssues.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>וואטסאפ רשמי</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            חיבור ה-WhatsApp Cloud API של העסק — חשבון, webhook, טוקן ובריאות
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); load(); }} className="p-2 rounded-lg"
            style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }} title="רענון">
            <RefreshCw size={14} style={{ color: "var(--text-muted)" }} />
          </button>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
            style={status?.connected
              ? { background: "var(--accent-light)", color: "var(--accent-dark)" }
              : { background: "#FEE2E2", color: "#DC2626" }}>
            {status?.connected ? <CheckCircle2 size={13} /> : <WifiOff size={13} />}
            {status?.connected ? "מחובר" : "לא מחובר"}
            {status?.source === "env" && " (env)"}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: "#FEE2E2", color: "#DC2626" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* חשבון */}
        <Card title="חשבון מחובר" subtitle={status?.source === "env"
          ? "החיבור מוגדר במשתני הסביבה של השרת. שמירה כאן תעביר אותו לניהול מוצפן בבסיס הנתונים."
          : status?.source === "db" ? "מנוהל בבסיס הנתונים — הטוקן מוצפן במנוחה" : "אין חיבור פעיל — חבר חשבון כדי להתחיל"}>
          {!editing ? (
            <div>
              <InfoRow label="מספר טלפון" value={status?.displayPhoneNumber || "—"} />
              <InfoRow label="Phone Number ID" value={<span dir="ltr" className="font-mono text-xs">{status?.phoneNumberId || "—"}</span>} />
              <InfoRow label="WABA ID" value={<span dir="ltr" className="font-mono text-xs">{status?.wabaId || "—"}</span>} />
              <InfoRow label="שם מאומת" value={status?.verifiedName || "—"} />
              <div className="flex items-center gap-2 mt-4">
                <button onClick={openEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  <Pencil size={12} /> {status?.source === "none" ? "חיבור חשבון" : "עדכון פרטים / טוקן"}
                </button>
                <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}>
                  <ExternalLink size={12} /> Meta Developers
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {([
                { key: "phoneNumberId", label: "Phone Number ID *", ph: "1206672..." },
                { key: "wabaId", label: "WABA ID", ph: "2060494..." },
                { key: "displayPhoneNumber", label: "מספר טלפון לתצוגה", ph: "+972 50 000 0000" },
                { key: "accessToken", label: "Access Token (יישמר מוצפן; ריק = ללא שינוי)", ph: "EAAG..." },
              ] as const).map((f) => (
                <div key={f.key}>
                  <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>{f.label}</label>
                  <input value={form[f.key]} dir="ltr" placeholder={f.ph}
                    type={f.key === "accessToken" ? "password" : "text"}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                    style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={save} disabled={saving || !form.phoneNumberId.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.7 : 1 }}>
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} שמירה
                </button>
                <button onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}>
                  <X size={12} /> ביטול
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Webhook */}
        <Card title="Webhook" subtitle="הכתובת שמוגדרת ב-Meta Developer Console">
          <div className="space-y-3">
            <CopyField label="כתובת Webhook (הדומיין הנוכחי)" value={webhookUrl} />
            <div className="flex items-center gap-2 p-2.5 rounded-lg text-xs"
              style={status?.webhookConfigured
                ? { background: "var(--accent-light)", color: "var(--accent-dark)" }
                : { background: "#FEF3C7", color: "#92400E" }}>
              {status?.webhookConfigured ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {status?.webhookConfigured
                ? "Verify Token ו-App Secret מוגדרים — חתימות מאומתות"
                : "חסר WEBHOOK_VERIFY_TOKEN או WHATSAPP_APP_SECRET במשתני הסביבה"}
            </div>
            <InfoRow label="הודעה נכנסת אחרונה" value={timeAgo(status?.health.lastInboundAt ?? null)} />
            <InfoRow label="הודעה יוצאת אחרונה" value={timeAgo(status?.health.lastOutboundAt ?? null)} />
          </div>
        </Card>

        {/* טוקן */}
        <Card title="טוקן גישה" subtitle="Access Token לשליחת הודעות דרך Graph API">
          <div className="space-y-3">
            <InfoRow label="טוקן" value={<span dir="ltr" className="font-mono text-xs">{status?.tokenPreview ?? "לא מוגדר"}</span>} />
            <InfoRow label="עודכן" value={status?.tokenUpdatedAt ? timeAgo(status.tokenUpdatedAt) : "—"} />
            {status?.tokenExpiresAt && (
              <div className="p-3 rounded-lg text-xs flex items-start gap-2"
                style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <div>טוקן זמני — פג ב-{new Date(status.tokenExpiresAt).toLocaleString("he-IL")}. לשימוש ייצורי צור System User עם טוקן קבוע.</div>
              </div>
            )}
            <a href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-users"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>
              <KeyRound size={12} /> מדריך: יצירת טוקן קבוע (System User)
            </a>
          </div>
        </Card>

        {/* בריאות ואיכות */}
        <Card title="בריאות ואיכות" subtitle="דירוג האיכות של Meta ותקלות webhook אחרונות">
          <div className="space-y-3">
            <InfoRow label="דירוג איכות" value={<span style={{ color: quality.color }}>{quality.label}</span>} />
            <InfoRow label="מכסת הודעות" value={TIER_LABELS[status?.messagingLimitTier ?? ""] ?? "לא ידוע"} />
            <div>
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>תקלות webhook אחרונות</p>
              {!hasIssues ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg text-xs"
                  style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>
                  <CheckCircle2 size={13} /> אין תקלות שנרשמו (14 ימים אחרונים)
                </div>
              ) : (
                <div className="space-y-1.5">
                  {status?.health.recentWebhookIssues.map((iss, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs"
                      style={{ background: iss.level === "error" ? "#FEE2E2" : "#FEF3C7", color: iss.level === "error" ? "#DC2626" : "#92400E" }}>
                      <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                      <span className="flex-1">{iss.message}</span>
                      <span className="flex-shrink-0 opacity-70">{timeAgo(iss.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ניתוק */}
      <div className="rounded-xl p-5" style={{ background: "#FFF5F5", border: "1px solid #FCA5A5" }}>
        <div className="flex items-center gap-2 mb-1">
          <WifiOff size={14} style={{ color: "#DC2626" }} />
          <span className="text-sm font-semibold" style={{ color: "#DC2626" }}>ניתוק וואטסאפ</span>
        </div>
        <p className="text-xs mb-3" style={{ color: "#EF4444" }}>
          מסיר את פרטי החיבור השמורים. שיחות והודעות קיימות לא נמחקות.
          {status?.source === "env" && " שים לב: החיבור הנוכחי מגיע ממשתני הסביבה — ניתוק מלא דורש גם הסרת WHATSAPP_TOKEN מהשרת."}
        </p>
        {confirmDisconnect ? (
          <div className="flex gap-2 max-w-xs">
            <button onClick={() => setConfirmDisconnect(false)} className="flex-1 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "#fff", color: "#6B7280", border: "1px solid #D1D5DB" }}>ביטול</button>
            <button onClick={disconnect} disabled={disconnecting} className="flex-1 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "#DC2626", color: "#fff", opacity: disconnecting ? 0.7 : 1 }}>
              {disconnecting ? "מנתק..." : "מאשר ניתוק"}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDisconnect(true)} disabled={status?.source === "none"}
            className="py-1.5 px-4 rounded-lg text-xs font-medium"
            style={{ background: "#fff", color: "#DC2626", border: "1px solid #FCA5A5", opacity: status?.source === "none" ? 0.5 : 1 }}>
            נתק
          </button>
        )}
      </div>
    </div>
  );
}
