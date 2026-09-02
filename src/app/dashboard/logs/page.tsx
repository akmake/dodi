"use client";

/**
 * Logs & failures ([תשתית תצפית]) — a live operational console.
 *
 * Surfaces what the live pipeline used to swallow into Vercel's invisible
 * function logs: failed conversation triggers, webhook/AI errors, dead jobs.
 * Auto-refreshes so a "the bot disconnected" report shows up here within
 * seconds, with the stack + context needed to understand it fast.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollText, AlertCircle, AlertTriangle, Info, RefreshCw, Trash2,
  ChevronDown, ChevronLeft, Search, Loader2, CheckCircle2,
} from "lucide-react";

type LogLevel = "error" | "warn" | "info";
interface LogEntry {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string | null;
  context?: Record<string, unknown> | null;
  createdAt: string;
}
interface LogsResponse {
  logs: LogEntry[];
  sources: string[];
  counts: Record<LogLevel, number>;
}

const LEVEL_META: Record<LogLevel, { label: string; icon: typeof AlertCircle; fg: string; bg: string }> = {
  error: { label: "שגיאה", icon: AlertCircle, fg: "var(--c-danger)", bg: "var(--c-danger-50)" },
  warn: { label: "אזהרה", icon: AlertTriangle, fg: "var(--c-warning)", bg: "var(--c-warning-50)" },
  info: { label: "מידע", icon: Info, fg: "var(--c-info)", bg: "var(--c-info-50)" },
};

const SOURCE_LABELS: Record<string, string> = {
  pipeline: "צינור שיחה",
  webhook: "Webhook",
  drain: "מנוע משימות",
  job: "משימה",
  ai: "בינה מלאכותית",
};

export default function LogsPage() {
  const [data, setData] = useState<LogsResponse>({ logs: [], sources: [], counts: { error: 0, warn: 0, info: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [source, setSource] = useState<string>("");
  const [search, setSearch] = useState("");
  const [auto, setAuto] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const qs = new URLSearchParams();
    if (level !== "all") qs.set("level", level);
    if (source) qs.set("source", source);
    if (searchRef.current.trim()) qs.set("search", searchRef.current.trim());
    try {
      const r = await fetch(`/api/logs?${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [level, source]);

  // Initial load + reload on filter change (debounced for the search box).
  // `loading` starts true, so the first run of this effect clears the spinner.
  useEffect(() => {
    const t = setTimeout(() => load(false), 250);
    return () => clearTimeout(t);
  }, [load, search]);

  // Live tail.
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => load(false), 5000);
    return () => clearInterval(id);
  }, [auto, load]);

  async function clearAll() {
    if (!confirm("למחוק את כל הלוגים? פעולה זו אינה הפיכה.")) return;
    await fetch("/api/logs", { method: "DELETE" });
    setExpanded(new Set());
    await load(true);
  }

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const total = data.counts.error + data.counts.warn + data.counts.info;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <ScrollText size={22} /> לוגים ותקלות
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            כל תקלה בצינור החי נכנסת לכאן בזמן אמת — טריגרים שנפלו, שגיאות webhook/AI, משימות תקועות
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setAuto((a) => !a)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium"
            style={{ background: auto ? "var(--accent-light)" : "var(--bg-card)", color: auto ? "var(--accent-dark)" : "var(--text-muted)", border: "1px solid var(--bg-border)" }}>
            <RefreshCw size={13} className={auto ? "spin-slow" : ""} /> {auto ? "רענון אוטומטי" : "רענון כבוי"}
          </button>
          <button onClick={() => load(true)} title="רענן עכשיו"
            className="flex items-center justify-center px-3 py-2 rounded-lg"
            style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--bg-border)" }}>
            <RefreshCw size={14} />
          </button>
          {total > 0 && (
            <button onClick={clearAll}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium"
              style={{ background: "var(--bg-card)", color: "var(--c-danger)", border: "1px solid var(--bg-border)" }}>
              <Trash2 size={13} /> נקה
            </button>
          )}
        </div>
      </div>

      {/* Level summary / quick filters */}
      <div className="grid grid-cols-3 gap-3">
        {(["error", "warn", "info"] as LogLevel[]).map((lv) => {
          const m = LEVEL_META[lv];
          const Icon = m.icon;
          const active = level === lv;
          return (
            <button key={lv} onClick={() => setLevel(active ? "all" : lv)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-right transition-all"
              style={{ background: "var(--bg-card)", border: `1px solid ${active ? m.fg : "var(--bg-border)"}`, outline: active ? `1px solid ${m.fg}` : "none" }}>
              <span className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0" style={{ background: m.bg }}>
                <Icon size={18} style={{ color: m.fg }} />
              </span>
              <div>
                <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{data.counts[lv]}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{m.label === "שגיאה" ? "שגיאות" : m.label === "אזהרה" ? "אזהרות" : "מידע"}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3" style={{ color: "var(--text-muted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש בהודעות..."
            className="w-full pr-9 pl-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
          <option value="">כל המקורות</option>
          {data.sources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>)}
        </select>
        {level !== "all" && (
          <button onClick={() => setLevel("all")} className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--text-muted)", border: "1px solid var(--bg-border)" }}>
            הצג הכל
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "var(--c-danger-50)", border: "1px solid var(--c-danger)", color: "var(--c-danger)" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      {/* Log list */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={16} className="animate-spin" /> טוען...
          </div>
        ) : data.logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 size={30} className="mb-2" style={{ color: "var(--accent)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>אין תקלות 🎉</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>הכל רץ חלק. תקלות חדשות יופיעו כאן אוטומטית.</p>
          </div>
        ) : (
          data.logs.map((log) => {
            const m = LEVEL_META[log.level];
            const Icon = m.icon;
            const isOpen = expanded.has(log.id);
            const hasMore = !!(log.detail || (log.context && Object.keys(log.context).length));
            return (
              <div key={log.id} style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <button onClick={() => hasMore && toggle(log.id)} className="w-full flex items-start gap-3 px-4 py-3 text-right"
                  style={{ cursor: hasMore ? "pointer" : "default" }}>
                  <span className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 mt-0.5" style={{ background: m.bg }}>
                    <Icon size={13} style={{ color: m.fg }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{log.message}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--bg-sunken)", color: "var(--fg-muted)" }}>
                        {SOURCE_LABELS[log.source] ?? log.source}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{fmtTime(log.createdAt)}</div>
                  </div>
                  {hasMore && (isOpen
                    ? <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    : <ChevronLeft size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />)}
                </button>
                {isOpen && hasMore && (
                  <div className="px-4 pb-3" style={{ marginRight: 36 }}>
                    {log.context && Object.keys(log.context).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {Object.entries(log.context).map(([k, v]) => (
                          <span key={k} className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: "var(--bg-base)", color: "var(--text-muted)", border: "1px solid var(--bg-border)" }}>
                            <span style={{ color: "var(--fg-muted)" }}>{k}:</span> {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                    {log.detail && (
                      <pre className="text-[11px] leading-relaxed p-3 rounded-lg overflow-x-auto" dir="ltr"
                        style={{ background: "var(--bg-base)", color: "var(--text-muted)", border: "1px solid var(--bg-border)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {log.detail}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`.spin-slow { animation: spin-slow 2s linear infinite; } @keyframes spin-slow { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "לפני רגע";
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} ד׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} ש׳`;
  return d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
