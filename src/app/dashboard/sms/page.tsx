"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Check, CheckCircle2, Clock3, Copy, KeyRound, Link2Off, Loader2,
  Mail, MessageCircle, QrCode, RefreshCw, RotateCw, Send, ShieldCheck, Smartphone,
} from "lucide-react";
import { formatWaPhone, isValidWaPhone, normalizeWaPhone } from "@/modules/sms/phone";

type Settings = {
  waPhone: string;
  waPhoneDisplay: string;
  emailFallback: boolean;
  senderEmail: string;
  destinationEmail: string;
  enabled: boolean;
  passwordConfigured: boolean;
  keyConfigured: boolean;
  keyPrefix: string;
  lastTestAt: string | null;
  lastDeliveryAt: string | null;
  lastError: string | null;
};

type Delivery = {
  id: string;
  externalId: string;
  from: string;
  body: string;
  receivedAt: string;
  status: "pending" | "sending" | "sent" | "failed";
  channel: "whatsapp" | "email" | null;
  attempts: number;
  lastError: string | null;
};

type WaState = { status: string; connected: boolean };
type DashboardData = { settings: Settings | null; wa: WaState; deliveries: Delivery[] };

const inputClass = "w-full rounded-xl px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2";
const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)", border: "1px solid var(--bg-border)",
  color: "var(--text-primary)", direction: "ltr", textAlign: "left",
};

const WA_STATUS_TEXT: Record<string, string> = {
  connecting: "מתחבר...",
  waiting_qr: "סרוק את הקוד",
  connected: "מחובר",
  disconnected: "מנותק",
};

/** Poll gap while pairing. The route itself holds up to ~8s when there's no code yet. */
const QR_POLL_MS = 2000;

export default function SmsPage() {
  const [data, setData] = useState<DashboardData>({ settings: null, wa: { status: "disconnected", connected: false }, deliveries: [] });
  const [waPhone, setWaPhone] = useState("");
  const [emailFallback, setEmailFallback] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [destinationEmail, setDestinationEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pairingKey, setPairingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState("disconnected");

  const endpoint = useMemo(() => "https://www.yosefautomations.com/api/sms/inbound", []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sms/settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "לא ניתן לטעון את הגדרות SMS");
      setData(body);
      setWaStatus(body.wa?.status ?? "disconnected");
      if (body.settings) {
        setWaPhone(body.settings.waPhone ?? "");
        setEmailFallback(Boolean(body.settings.emailFallback));
        setSenderEmail(body.settings.senderEmail ?? "");
        setDestinationEmail(body.settings.destinationEmail ?? "");
        setEnabled(body.settings.enabled !== false);
      }
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "שגיאה בטעינה" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Pairing poll. Only runs while the QR panel is open — a page view must not
  // spin up a socket on its own (the always-on bootstrap owns that).
  useEffect(() => {
    if (!pairing) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const response = await fetch("/api/sms/wa", { cache: "no-store" });
        const body = await response.json();
        if (!alive) return;
        if (response.ok) {
          setQr(body.qr ?? null);
          setWaStatus(body.status ?? "disconnected");
          if (body.status === "connected") {
            setPairing(false);
            setQr(null);
            setMessage({ kind: "success", text: "הוואטסאפ חובר בהצלחה" });
            void load();
            return;
          }
        }
      } catch {
        // transient — keep polling
      }
      if (alive) timer = setTimeout(poll, QR_POLL_MS);
    };

    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [pairing, load]);

  async function save() {
    setSaving(true); setMessage(null); setPairingKey(null);
    try {
      const response = await fetch("/api/sms/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waPhone, emailFallback, senderEmail, destinationEmail,
          appPassword: appPassword || undefined, enabled,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "שמירת ההגדרות נכשלה");
      setAppPassword("");
      if (body.pairingKey) setPairingKey(body.pairingKey);
      setMessage({ kind: "success", text: "ההגדרות נשמרו" });
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "שמירת ההגדרות נכשלה" });
    } finally { setSaving(false); }
  }

  async function action(actionName: "test_whatsapp" | "test_email" | "rotate_key") {
    const setter = actionName === "test_whatsapp" ? setTesting : actionName === "test_email" ? setTestingEmail : setRotating;
    setter(true); setMessage(null);
    try {
      const response = await fetch("/api/sms/settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "הפעולה נכשלה");
      if (body.pairingKey) setPairingKey(body.pairingKey);
      setMessage({
        kind: "success",
        text: actionName === "test_whatsapp" ? "הודעת בדיקה נשלחה לוואטסאפ"
          : actionName === "test_email" ? "מייל בדיקה נשלח בהצלחה"
          : "נוצר מפתח חיבור חדש",
      });
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "הפעולה נכשלה" });
    } finally { setter(false); }
  }

  async function waAction(actionName: "reconnect" | "unlink") {
    setMessage(null);
    try {
      const response = await fetch("/api/sms/wa", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "הפעולה נכשלה");
      if (actionName === "unlink") { setWaStatus("disconnected"); setQr(null); setPairing(false); }
      else setPairing(true);
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "הפעולה נכשלה" });
    }
  }

  async function copyValue(value: string, id: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id); setTimeout(() => setCopied(null), 1800);
  }

  const settings = data.settings;
  const waConnected = waStatus === "connected";
  // Live echo of what the server will normalize the typed number to, so a typo
  // shows up before saving rather than as a message that never arrives.
  const normalizedPhone = normalizeWaPhone(waPhone);
  const configured = Boolean(settings?.waPhone && settings?.keyConfigured && settings.enabled && waConnected);
  const delivered = data.deliveries.filter((item) => item.status === "sent").length;
  const failed = data.deliveries.filter((item) => item.status === "failed").length;

  if (loading) return <div className="min-h-[55vh] flex items-center justify-center"><Loader2 className="animate-spin" style={{ color: "var(--accent)" }} /></div>;

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      <section className="relative overflow-hidden rounded-2xl p-6 md:p-8" style={{ background: "linear-gradient(125deg,#102c25 0%,#174b3d 62%,#1f6b55 100%)", color: "white" }}>
        <div className="absolute -left-12 -top-16 h-48 w-48 rounded-full opacity-20" style={{ background: "#d8ff72", filter: "blur(4px)" }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: "rgba(216,255,114,.14)", color: "#d8ff72", border: "1px solid rgba(216,255,114,.24)" }}>
              <Smartphone size={14} /> SMS RELAY
            </div>
            <h1 className="text-3xl font-bold tracking-tight">הודעות מהטלפון, ישר לוואטסאפ</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "rgba(255,255,255,.68)" }}>חבר וואטסאפ, הגדר את המספר שאליו יגיעו ההודעות, וצמד את אפליקציית Android.</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}>
            <span className={`h-2.5 w-2.5 rounded-full ${configured ? "animate-pulse" : ""}`} style={{ background: configured ? "#d8ff72" : "#ff8a7a" }} />
            <div><div className="text-sm font-bold">{configured ? "המערכת פעילה" : "נדרשת הגדרה"}</div><div className="text-xs" style={{ color: "rgba(255,255,255,.58)" }}>{configured ? "מוכנה לקבל הודעות" : "השלם את שלושת השלבים"}</div></div>
          </div>
        </div>
      </section>

      {message && <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: message.kind === "success" ? "#ECFDF5" : "#FFF1F0", color: message.kind === "success" ? "#047857" : "#B42318", border: `1px solid ${message.kind === "success" ? "#A7F3D0" : "#FECDCA"}` }}>{message.kind === "success" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />} {message.text}</div>}

      {pairingKey && <section className="rounded-2xl p-5" style={{ background: "#FFF9E8", border: "1px solid #F4D77D" }}>
        <div className="flex items-start gap-3"><KeyRound size={21} style={{ color: "#8A6100" }} /><div className="min-w-0 flex-1"><h2 className="font-bold" style={{ color: "#5F4300" }}>שמור את מפתח החיבור עכשיו</h2><p className="mt-1 text-xs" style={{ color: "#8A6100" }}>המפתח מוצג פעם אחת בלבד. העתק אותו לשדה Bearer token באפליקציית Relay.</p><div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3" dir="ltr" style={{ border: "1px solid #E7C75E" }}><code className="min-w-0 flex-1 break-all text-xs" style={{ color: "#352800" }}>{pairingKey}</code><button onClick={() => copyValue(pairingKey, "key")} className="rounded-lg p-2" aria-label="העתקת מפתח">{copied === "key" ? <Check size={16} /> : <Copy size={16} />}</button></div></div></div>
      </section>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="rounded-2xl p-5 xl:col-span-2" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <StepTitle number="1" icon={MessageCircle} title="חיבור הוואטסאפ" subtitle="החשבון שממנו תישלח ההודעה, והמספר שאליו היא תגיע" />

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl p-4" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${waConnected ? "animate-pulse" : ""}`} style={{ background: waConnected ? "#10B981" : waStatus === "waiting_qr" ? "#F59E0B" : "#EF4444" }} />
                  <b className="text-sm" style={{ color: "var(--text-primary)" }}>{WA_STATUS_TEXT[waStatus] ?? waStatus}</b>
                </div>
                {waConnected && <button onClick={() => waAction("unlink")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium" style={{ border: "1px solid var(--bg-border)", color: "#B42318" }}><Link2Off size={13} />נתק מכשיר</button>}
              </div>
              <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                {waConnected ? "החיבור פעיל ונשאר מחובר גם אחרי הפעלה מחדש של השרת." : "סרוק QR כדי לחבר את המכשיר ששולח את ההודעות."}
              </p>
              {!waConnected && !pairing && <button onClick={() => setPairing(true)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: "var(--accent)" }}><QrCode size={15} />חבר וואטסאפ</button>}
              {pairing && <div className="mt-3">
                <div className="relative mx-auto flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl" style={{ background: "#fff", border: "1px solid var(--bg-border)" }}>
                  {qr
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={qr} alt="QR" className="h-full w-full" />
                    : <div className="px-6 text-center"><Loader2 className="mx-auto mb-2 animate-spin" size={22} style={{ color: "var(--accent)" }} /><p className="text-[11px]" style={{ color: "var(--text-muted)" }}>ממתין לקוד מהוואטסאפ...</p></div>}
                </div>
                <p className="mt-2 text-center text-[11px] leading-5" style={{ color: "var(--text-muted)" }}>וואטסאפ ← מכשירים מקושרים ← קשר מכשיר<br />הקוד מתרענן אוטומטית והחלון ייסגר לבד.</p>
                <button onClick={() => { setPairing(false); setQr(null); }} className="mt-2 w-full rounded-xl py-2 text-xs" style={{ border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>ביטול</button>
              </div>}
            </div>

            <div>
              <Field label="מספר וואטסאפ ליעד" hint={!waPhone ? "המספר שאליו יגיעו הודעות ה-SMS, למשל 050-1234567" : isValidWaPhone(normalizedPhone) ? `יישלח אל ${formatWaPhone(normalizedPhone)}` : "המספר אינו תקין"}>
                <input type="tel" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="050-1234567" className={inputClass} style={inputStyle} />
              </Field>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => setEnabled((value) => !value)} className="flex items-center gap-3 text-right"><span className="relative h-6 w-11 rounded-full transition-colors" style={{ background: enabled ? "var(--accent)" : "#CBD5E1" }}><span className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ right: enabled ? 4 : 23 }} /></span><span><b className="block text-sm" style={{ color: "var(--text-primary)" }}>העברה אוטומטית</b><small style={{ color: "var(--text-muted)" }}>ניתן לעצור בלי למחוק את ההגדרות</small></span></button>
                {settings?.lastDeliveryAt && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>מסירה אחרונה: {new Date(settings.lastDeliveryAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</div>}
                {settings?.lastError && <div className="rounded-lg px-2.5 py-2 text-[11px]" style={{ background: "#FFF1F0", color: "#B42318" }}>{settings.lastError}</div>}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end" style={{ borderColor: "var(--bg-border)" }}>
            <button onClick={() => action("test_whatsapp")} disabled={testing || !settings?.waPhone} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40" style={{ border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>{testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}שלח בדיקה לוואטסאפ</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>{saving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}שמור הגדרות</button>
          </div>
        </section>

        <section className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <StepTitle number="2" icon={Smartphone} title="חיבור האפליקציה" subtitle="Endpoint ומפתח פרטי למכשיר" />
          <div className="mt-5 space-y-4">
            <CopyField label="כתובת השרת" value={endpoint} copied={copied === "endpoint"} onCopy={() => copyValue(endpoint, "endpoint")} />
            <div className="rounded-xl p-3" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}><div className="text-xs" style={{ color: "var(--text-muted)" }}>מפתח נוכחי</div><div className="mt-1 flex items-center justify-between gap-2"><code className="text-xs" dir="ltr">{settings?.keyConfigured ? `${settings.keyPrefix}••••••••` : "טרם נוצר"}</code><span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: settings?.keyConfigured ? "#ECFDF5" : "#FFF1F0", color: settings?.keyConfigured ? "#047857" : "#B42318" }}>{settings?.keyConfigured ? "פעיל" : "חסר"}</span></div></div>
            <button onClick={() => action("rotate_key")} disabled={rotating || !settings} className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium disabled:opacity-40" style={{ border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>{rotating ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}צור מפתח חדש</button>
            <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>יצירת מפתח חדש מבטלת מיד את המפתח הקודם. יש לעדכן אותו גם באפליקציה.</p>
          </div>
        </section>
      </div>

      <section className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StepTitle number="3" icon={Mail} title="גיבוי במייל (רשות)" subtitle="נשלח רק אם שליחת הוואטסאפ נכשלה" />
          <button type="button" onClick={() => setEmailFallback((value) => !value)} className="flex items-center gap-3 text-right"><span className="relative h-6 w-11 rounded-full transition-colors" style={{ background: emailFallback ? "var(--accent)" : "#CBD5E1" }}><span className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ right: emailFallback ? 4 : 23 }} /></span><span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{emailFallback ? "גיבוי פעיל" : "גיבוי כבוי"}</span></button>
        </div>

        {emailFallback && <>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="כתובת Gmail שולח" hint="הכתובת שממנה יישלח המייל">
              <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="sender@gmail.com" className={inputClass} style={inputStyle} />
            </Field>
            <Field label="מייל יעד" hint="לשם יישלח הגיבוי">
              <input type="email" value={destinationEmail} onChange={(e) => setDestinationEmail(e.target.value)} placeholder="you@gmail.com" className={inputClass} style={inputStyle} />
            </Field>
            <Field label="סיסמת אפליקציה של Gmail" hint={settings?.passwordConfigured ? "כבר שמורה ומוצפנת — השאר ריק כדי לא לשנות" : "16 התווים שמתקבלים ב-Google App Passwords"}>
              <input type="password" autoComplete="new-password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder={settings?.passwordConfigured ? "••••••••••••••••" : "xxxx xxxx xxxx xxxx"} className={inputClass} style={inputStyle} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => action("test_email")} disabled={testingEmail || !settings?.passwordConfigured} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40" style={{ border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>{testingEmail ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}בדוק את גיבוי המייל</button>
          </div>
        </>}
        {!emailFallback && <p className="mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>ללא גיבוי, הודעה שלא הצליחה להישלח בוואטסאפ תיכנס לתור ותנוסה שוב אוטומטית עד שהחיבור יחזור.</p>}
      </section>

      <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--bg-border)" }}><StepTitle number="4" icon={RefreshCw} title="הודעות אחרונות" subtitle="מעקב אחרי קליטה ומסירה" /><div className="flex gap-2"><Metric value={delivered} label="נמסרו" color="#047857" /><Metric value={failed} label="נכשלו" color="#B42318" /><button onClick={load} className="rounded-xl p-2.5" style={{ border: "1px solid var(--bg-border)" }} aria-label="רענון"><RefreshCw size={16} /></button></div></div>
        {data.deliveries.length === 0 ? <div className="flex flex-col items-center px-5 py-14 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--bg-base)" }}><Smartphone style={{ color: "var(--text-muted)" }} /></div><h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>עדיין לא התקבלו הודעות</h3><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>אחרי חיבור האפליקציה, ההודעות יופיעו כאן.</p></div> : <div className="divide-y" style={{ borderColor: "var(--bg-border)" }}>{data.deliveries.map((item) => <DeliveryRow key={item.id} item={item} />)}</div>}
      </section>
    </div>
  );
}

function StepTitle({ number, icon: Icon, title, subtitle }: { number: string; icon: React.ComponentType<{ size?: number }>; title: string; subtitle: string }) {
  return <div className="flex items-center gap-3"><div className="relative flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}><Icon size={20} /><span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>{number}</span></div><div><h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2><p className="text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p></div></div>;
}
function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>{children}<span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span></label>;
}
function CopyField({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return <div><div className="mb-1 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{label}</div><div className="flex items-center gap-2 rounded-xl p-3" dir="ltr" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}><code className="min-w-0 flex-1 truncate text-[11px]">{value}</code><button onClick={onCopy} aria-label="העתקה">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></div>;
}
function Metric({ value, label, color }: { value: number; label: string; color: string }) {
  return <div className="rounded-xl px-3 py-1.5 text-center" style={{ background: "var(--bg-base)" }}><b className="block text-sm" style={{ color }}>{value}</b><span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span></div>;
}
function DeliveryRow({ item }: { item: Delivery }) {
  const meta = item.status === "sent" ? { label: "נמסר", color: "#047857", bg: "#ECFDF5", icon: CheckCircle2 } : item.status === "failed" ? { label: "בתור לניסיון חוזר", color: "#B42318", bg: "#FFF1F0", icon: AlertCircle } : { label: "בתהליך", color: "#8A6100", bg: "#FFF9E8", icon: Clock3 };
  const Icon = meta.icon;
  const channel = item.channel === "whatsapp" ? { label: "וואטסאפ", icon: MessageCircle } : item.channel === "email" ? { label: "מייל (גיבוי)", icon: Mail } : null;
  const ChannelIcon = channel?.icon;
  return <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 p-4 md:p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: meta.bg, color: meta.color }}><Icon size={18} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm" dir="ltr" style={{ color: "var(--text-primary)" }}>{item.from}</b><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>{channel && ChannelIcon && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}><ChannelIcon size={11} />{channel.label}</span>}</div><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>{item.body}</p>{item.lastError && <p className="mt-1 text-[11px]" style={{ color: "#B42318" }}>{item.lastError}</p>}</div><div className="text-left text-[11px]" style={{ color: "var(--text-muted)" }}>{new Date(item.receivedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}<div className="mt-1">{item.attempts} ניסיונות</div></div></div>;
}
