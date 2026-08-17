"use client";
// Port of Whatsapp/client/src/pages/LogsPage.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";

const LEVEL_STYLE: Record<string, any> = {
  warn: { bg: "bg-yellow-50", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-400" },
  error: { bg: "bg-red-50", text: "text-red-800", badge: "bg-red-100 text-red-600", bar: "bg-red-500" },
  fatal: { bg: "bg-red-100", text: "text-red-900", badge: "bg-red-600 text-white", bar: "bg-red-700" },
};

const COMP_LABELS: Record<string, string> = { imap: "IMAP", wa: "WhatsApp", pool: "Pool", server: "Server", crash: "CRASH", health: "Health", media: "Media" };

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(ts: string) {
  const d = new Date(ts);
  return `${d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} ${fmtTime(ts)}`;
}
function ago(ts: string) {
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}ש׳`;
  if (s < 3600) return `${Math.round(s / 60)}ד׳`;
  return `${Math.round(s / 3600)}ש׳`;
}

function MemBar({ used, total, label, warn = 600, error = 900 }: { used: number; total: number | null; label: string; warn?: number; error?: number }) {
  const pct = total ? Math.round((used / total) * 100) : 0;
  const color = used > error ? "bg-red-500" : used > warn ? "bg-yellow-400" : "bg-green-400";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-[#8696a0]">{label}</span>
        <span className="font-medium text-[#111b21]">
          {used}MB {total ? `/ ${total}MB` : ""}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ samples = [], h = 32, w = 120 }: { samples?: number[]; h?: number; w?: number }) {
  if (samples.length < 2) return null;
  const max = Math.max(...samples, 100);
  const pts = samples
    .map((v, i) => {
      const x = (i / (samples.length - 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const last = samples[samples.length - 1];
  const color = last > 900 ? "#ef4444" : last > 600 ? "#eab308" : "#22c55e";
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

export default function LogsPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [crash, setCrash] = useState<any>(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");

  const fetchData = useCallback(async () => {
    if (paused) return;
    try {
      const params: Record<string, string> = { limit: "300" };
      if (filter) {
        if (filter === "health") params.component = "health";
        else params.level = filter;
      }
      const [logsRes, statsRes] = await Promise.all([wtmApi.get<any[]>(`/logs`, { params }), wtmApi.get<any>("/logs/stats")]);
      const all = (logsRes.data || []).filter((e) => ["warn", "error", "fatal"].includes(e.level) || e.component === "health");
      setEntries(all);
      setStats(statsRes.data);
    } catch {
      /* retry on next tick */
    }
  }, [filter, paused]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useSSE(fetchData, 2000);

  useEffect(() => {
    wtmApi
      .get<any>("/logs/crash")
      .then((r) => {
        if (r.data?.found) setCrash(r.data);
      })
      .catch(() => {});
  }, []);

  const health = stats?.health;

  return (
    <div className="h-full bg-[#eae6df] flex flex-col" dir="rtl">
      <div className="bg-[#075E54] text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-base font-bold">📊 ניטור מערכת</span>
        <div className="flex items-center gap-2">
          <a href="/api/wtm/logs/file" className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
            ⬇ הורד לוג
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {crash && (
          <div className="bg-red-600 text-white rounded-xl p-4">
            <p className="text-sm font-bold mb-1">⚠️ קריסה זוהתה ב-PID {crash.crash.pid}</p>
            <p className="text-xs text-red-100">
              {crash.crash.message} · {fmtDate(crash.crash.ts)}
            </p>
            <details className="mt-2">
              <summary className="text-xs text-red-200 cursor-pointer">הצג הקשר ({crash.context.length} רשומות לפני הקריסה)</summary>
              <div className="mt-2 bg-red-900/40 rounded-lg p-3 space-y-0.5 max-h-40 overflow-y-auto text-left font-mono">
                {crash.context.map((e: any, i: number) => (
                  <div key={i} className="text-[11px] text-red-100">
                    [{fmtTime(e.ts)}] [{e.level?.toUpperCase()}] [{e.component}] {e.message}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {health && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-sm p-4 col-span-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#8696a0]">זיכרון</span>
                <div className="flex items-center gap-3">
                  <Sparkline samples={health.memSamples} />
                  <span className="text-xs text-[#8696a0]">דקה אחרונה</span>
                </div>
              </div>
              <div className="space-y-3">
                <MemBar label="Heap (JS)" used={health.heapUsed} total={health.heapTotal} warn={600} error={900} />
                <MemBar label="RSS (תהליך)" used={health.rss} total={null} warn={800} error={1200} />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-xs text-[#8696a0] mb-1">פעיל מזה</p>
              <p className="text-2xl font-bold text-[#111b21]">{health.uptime < 3600 ? `${Math.round(health.uptime / 60)}ד׳` : `${Math.round(health.uptime / 3600)}ש׳`}</p>
              <p className="text-xs text-[#8696a0] mt-0.5">PID {health.pid}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-xs text-[#8696a0] mb-2">שגיאות (ריצה זו)</p>
              <div className="space-y-1">
                {[
                  ["warn", "⚠️", "text-yellow-600"],
                  ["error", "🔴", "text-red-600"],
                  ["fatal", "💀", "text-red-900"],
                ].map(([l, icon, cls]) => (
                  <div key={l} className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${cls}`}>
                      {icon} {l}
                    </span>
                    <span className="font-bold text-[#111b21]">{stats?.counts?.[l] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {stats?.lastError && (
          <div className="bg-white rounded-xl shadow-sm p-4 border-r-4 border-red-500">
            <p className="text-xs text-[#8696a0] mb-1">שגיאה אחרונה · {ago(stats.lastError.ts)} לפני</p>
            <p className="text-sm font-medium text-[#111b21]">
              [{COMP_LABELS[stats.lastError.component] || stats.lastError.component}] {stats.lastError.message}
            </p>
            <p className="text-xs text-[#8696a0] mt-0.5">
              {fmtDate(stats.lastError.ts)} · {stats.lastError.mem}MB heap
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {[
            ["", "הכל"],
            ["error", "🔴 שגיאות"],
            ["warn", "⚠️ אזהרות"],
            ["fatal", "💀 קריסות"],
            ["health", "💓 עומס"],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${filter === val ? "bg-[#075E54] text-white border-[#075E54]" : "bg-white text-[#8696a0] border-gray-200 hover:border-gray-300"}`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setPaused((p) => !p)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${paused ? "bg-yellow-100 text-yellow-700 border-yellow-200" : "bg-white text-[#8696a0] border-gray-200"}`}
          >
            {paused ? "▶ המשך" : "⏸ עצור"}
          </button>
        </div>

        <div className="space-y-1">
          {entries.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl shadow-sm">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm text-[#8696a0]">אין שגיאות ב-ring buffer הנוכחי</p>
            </div>
          ) : (
            entries.map((e, i) => {
              const s = LEVEL_STYLE[e.level] || LEVEL_STYLE.warn;
              return (
                <div key={i} className={`rounded-xl shadow-sm p-3 border-r-4 ${s.bg}`} style={{ borderColor: s.bar?.replace("bg-", "") }}>
                  <div className="flex items-start gap-3">
                    <div className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${s.badge}`}>{e.level}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-[#111b21]">{COMP_LABELS[e.component] || e.component}</span>
                        {e.tenantId && <span className="text-[10px] text-purple-500">[{e.tenantId.slice(-6)}]</span>}
                        {e.lag && <span className="text-[10px] font-mono text-red-600">lag: {e.lag}ms</span>}
                        {e.heapMB && <span className="text-[10px] text-gray-400">{e.heapMB}MB</span>}
                        {e.growth && <span className="text-[10px] text-red-500">↑{e.growth}MB</span>}
                      </div>
                      <p className={`text-sm ${s.text} leading-snug`}>{e.message}</p>
                      {e.stack && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-red-400 cursor-pointer">stack</summary>
                          <pre className="text-[9px] text-red-500 whitespace-pre-wrap mt-1 font-mono">{e.stack}</pre>
                        </details>
                      )}
                    </div>
                    <span className="text-[10px] text-[#8696a0] flex-shrink-0 text-left">{fmtTime(e.ts)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={`flex-shrink-0 px-4 py-2 text-xs flex items-center gap-2 border-t border-[#d1d7db] ${paused ? "bg-yellow-50 text-yellow-700" : "bg-white text-[#8696a0]"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${paused ? "bg-yellow-400" : "bg-green-400 animate-pulse"}`} />
        {paused ? "עדכון מושהה" : `${entries.length} אירועים · עדכון בזמן אמת`}
      </div>
    </div>
  );
}
