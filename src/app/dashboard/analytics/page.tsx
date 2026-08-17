"use client";

/**
 * Analytics dashboard ([קטגוריה 23]) — live KPIs + event-store reports
 * (counts / timeseries / topics) from /api/analytics.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, MessageSquare, Bot, ArrowDownLeft, ArrowUpRight, LifeBuoy, Ticket, Send, AlertCircle, TrendingDown, Activity,
} from "lucide-react";

interface Overview {
  contacts: number;
  conversations: { total: number; open: number };
  messages: { inbound: number; outbound: number; aiSent: number };
  ai: { handoffs: number; openHandoffs: number; deflectionRate: number | null };
  tickets: { open: number; total: number };
  campaignsSent: number;
}
interface Point { date: string; count: number }
interface Topic { intent: string; count: number; handoffRate: number }

const EVENT_LABEL: Record<string, string> = {
  message_in: "הודעות נכנסות", message_out: "הודעות יוצאות", ai_answer: "תשובות AI",
  handoff: "הסלמות", ticket_created: "טיקטים", ticket_resolved: "טיקטים שנפתרו",
  campaign_sent: "קמפיין", lead_created: "לידים", lead_stage_changed: "שינוי שלב",
  conversion: "המרות", order_created: "הזמנות",
};
const SERIES = ["message_in", "ai_answer", "handoff", "lead_created", "conversion"];

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [topics, setTopics] = useState<Topic[]>([]);
  const [series, setSeries] = useState<Point[]>([]);
  const [seriesType, setSeriesType] = useState("message_in");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSeries = useCallback(async (type: string) => {
    const r = await fetch(`/api/analytics?report=timeseries&type=${type}`, { cache: "no-store" });
    setSeries(r.ok ? (await r.json()).points ?? [] : []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [o, e, t] = await Promise.all([
          fetch("/api/analytics", { cache: "no-store" }),
          fetch("/api/analytics?report=events", { cache: "no-store" }),
          fetch("/api/analytics?report=topics", { cache: "no-store" }),
        ]);
        if (!o.ok) throw new Error((await o.json()).error ?? `HTTP ${o.status}`);
        setData(await o.json());
        setCounts(e.ok ? (await e.json()).counts ?? {} : {});
        setTopics(t.ok ? (await t.json()).topics ?? [] : []);
        await loadSeries("message_in");
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSeries]);

  function pickSeries(type: string) {
    setSeriesType(type);
    loadSeries(type);
  }

  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const maxCount = useMemo(() => Math.max(1, ...series.map((p) => p.count)), [series]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>סטטיסטיקות</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>תמונת מצב של השירות, ה-AI והקמפיינים</p>
      </div>

      {error && <ErrorBanner msg={error} />}
      {loading && <p className="text-sm" style={{ color: "var(--text-muted)" }}>טוען...</p>}

      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Stat icon={<Users size={18} />} label="אנשי קשר" value={data.contacts} />
            <Stat icon={<MessageSquare size={18} />} label="שיחות פתוחות" value={data.conversations.open} sub={`מתוך ${data.conversations.total}`} />
            <Stat icon={<Bot size={18} />} label="שיעור טיפול AI" value={pct(data.ai.deflectionRate)} accent />
            <Stat icon={<LifeBuoy size={18} />} label="הסלמות לנציג" value={data.ai.handoffs} sub={`${data.ai.openHandoffs} פתוחות`} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Stat icon={<ArrowDownLeft size={18} />} label="הודעות נכנסות" value={data.messages.inbound} />
            <Stat icon={<ArrowUpRight size={18} />} label="הודעות יוצאות" value={data.messages.outbound} />
            <Stat icon={<Bot size={18} />} label="תשובות AI" value={data.messages.aiSent} />
            <Stat icon={<Ticket size={18} />} label="טיקטים פתוחים" value={data.tickets.open} sub={`מתוך ${data.tickets.total}`} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Stat icon={<Send size={18} />} label="הודעות קמפיין שנשלחו" value={data.campaignsSent} />
          </div>

          {/* Event-store activity */}
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: "var(--accent)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>פעילות לאורך זמן</span>
              </div>
              <div className="flex gap-1">
                {SERIES.map((t) => (
                  <button key={t} onClick={() => pickSeries(t)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                    style={{
                      background: seriesType === t ? "var(--accent-light)" : "transparent",
                      color: seriesType === t ? "var(--accent)" : "var(--text-muted)",
                    }}>
                    {EVENT_LABEL[t] ?? t}
                  </button>
                ))}
              </div>
            </div>
            {series.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: "var(--text-dim)" }}>אין נתונים עדיין לתקופה זו</p>
            ) : (
              <div dir="ltr" className="flex items-end gap-1 h-32">
                {series.map((p) => (
                  <div key={p.date} className="flex-1 flex flex-col items-center justify-end group" title={`${p.date}: ${p.count}`}>
                    <div className="w-full rounded-t transition-all" style={{ height: `${(p.count / maxCount) * 100}%`, minHeight: 2, background: "var(--accent)" }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Event counts */}
            <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
              <span className="text-sm font-semibold block mb-3" style={{ color: "var(--text-primary)" }}>אירועים (סך הכל)</span>
              {Object.keys(counts).length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>אין אירועים עדיין</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span style={{ color: "var(--text-muted)" }}>{EVENT_LABEL[k] ?? k}</span>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Topics / knowledge gaps */}
            <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
              <span className="text-sm font-semibold block mb-3" style={{ color: "var(--text-primary)" }}>נושאים מובילים</span>
              {topics.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>אין מספיק נתוני intent עדיין</p>
              ) : (
                <div className="space-y-2">
                  {topics.slice(0, 8).map((t) => (
                    <div key={t.intent} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate" style={{ color: "var(--text-primary)" }}>{t.intent}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t.count}</span>
                        {t.handoffRate > 0 && (
                          <span className="flex items-center gap-0.5 text-xs" style={{ color: "#DC2626" }} title="שיעור הסלמה">
                            <TrendingDown size={11} />{Math.round(t.handoffRate * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <ScheduledReports />
        </>
      )}
    </div>
  );
}

interface Schedule { id: string; name: string; frequency: string; events: string[]; webhookUrl: string | null; lastRunAt: string | null }

/** Scheduled digest reports (§23.5) — create, run-now, delete. */
function ScheduledReports() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/analytics/reports").then((r) => (r.ok ? r.json() : { items: [] })).then((d) => setItems(d.items ?? [])).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/analytics/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), frequency, webhookUrl: webhookUrl.trim() || null }) });
      setName(""); setWebhookUrl(""); load();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>דוחות מתוזמנים</h3>
      </div>
      <div className="space-y-2 mb-4">
        {items.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>אין דוחות מתוזמנים. צור דוח יומי/שבועי שיישלח ל-webhook.</p>
        ) : items.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "var(--bg-base)" }}>
            <div>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.name}</span>
              <span className="text-xs mr-2" style={{ color: "var(--text-muted)" }}> · {s.frequency === "weekly" ? "שבועי" : "יומי"}{s.lastRunAt ? ` · רץ לאחרונה ${new Date(s.lastRunAt).toLocaleDateString("he-IL")}` : ""}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={async () => { await fetch(`/api/analytics/reports/${s.id}`, { method: "POST" }); load(); }} className="text-xs" style={{ color: "var(--accent)" }}>הרץ עכשיו</button>
              <button onClick={async () => { await fetch(`/api/analytics/reports/${s.id}`, { method: "DELETE" }); load(); }} className="text-xs" style={{ color: "#DC2626" }}>מחק</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הדוח" className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)", width: 160 }} />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
          <option value="daily">יומי</option><option value="weekly">שבועי</option>
        </select>
        <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="Webhook URL (אופציונלי)" className="px-3 py-2 rounded-lg text-sm outline-none flex-1" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)", direction: "ltr", textAlign: "left", minWidth: 180 }} />
        <button onClick={create} disabled={busy || !name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>הוסף</button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: accent ? "var(--accent)" : "var(--text-muted)" }}>
        {icon}
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
      <AlertCircle size={16} />
      <span>{msg.includes("MONGODB") ? "לא מחובר למסד נתונים — הגדר MONGODB_URI" : msg}</span>
    </div>
  );
}
