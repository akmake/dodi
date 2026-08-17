"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Send, Save, Search, Loader2, ScanSearch } from "lucide-react";

interface TraceTurn {
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  urgency: string;
  confidence: number;
  decision: string;
  answerText: string | null;
  usedSources: { sourceId: string; title?: string }[];
  toolCalls: { name: string }[];
  createdAt: string;
}

const SENTIMENT: Record<string, { label: string; color: string }> = {
  positive: { label: "חיובי", color: "#16A34A" },
  neutral: { label: "ניטרלי", color: "#6B7280" },
  negative: { label: "שלילי", color: "#DC2626" },
};
const DECISION: Record<string, string> = {
  answer: "תשובה", clarify: "הבהרה", action: "פעולה", handoff: "הסלמה", fallback: "גיבוי",
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>{children}</div>;
}

const models = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", badge: "מומלץ" },
  { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B", badge: "" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", badge: "מהיר מאוד" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", badge: "" },
  { id: "gemma2-9b-it", name: "Gemma 2 9B", badge: "" },
];

const personalities = [
  { id: "professional", label: "מקצועי", desc: "רשמי ועסקי" },
  { id: "friendly", label: "ידידותי", desc: "חם ושיחותי" },
  { id: "concise", label: "תמציתי", desc: "קצר וענייני בלבד" },
  { id: "custom", label: "מותאם", desc: "לפי ה-Prompt שלך" },
];

export default function AIPage() {
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [personality, setPersonality] = useState("professional");
  const [botName, setBotName] = useState("עוזר");
  const [language, setLanguage] = useState("auto");
  const [systemPrompt, setSystemPrompt] = useState("אתה עוזר שירות לקוחות ידידותי ומקצועי. ענה תמיד בעברית בצורה קצרה וברורה. אל תכתוב יותר מ-3 משפטים אלא אם הלקוח ביקש.");
  const [welcome, setWelcome] = useState("");
  const [fallback, setFallback] = useState("מצטער, אני מתקשה לענות כרגע. אנסה שוב בעוד מספר שניות.");
  const [testMsg, setTestMsg] = useState("");
  const [testReply, setTestReply] = useState("");
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [traceId, setTraceId] = useState("");
  const [trace, setTrace] = useState<TraceTurn[] | null>(null);
  const [tracing, setTracing] = useState(false);

  async function loadTrace() {
    if (!traceId.trim()) return;
    setTracing(true); setTrace(null);
    try {
      const res = await fetch(`/api/ai-optimization/trace/${traceId.trim()}`, { cache: "no-store" });
      setTrace(res.ok ? (await res.json()).items ?? [] : []);
    } catch {
      setTrace([]);
    } finally {
      setTracing(false);
    }
  }

  async function runTest() {
    if (!testMsg.trim()) return;
    setTesting(true); setTestReply("");
    try {
      const res = await fetch("/api/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMsg, systemPrompt, model, temperature, maxTokens }),
      });
      const data = await res.json();
      setTestReply(data.reply ?? "אין תגובה");
    } catch { setTestReply("שגיאה בחיבור ל-AI."); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>הגדרות AI</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>הגדר איך הבוט שלך מתנהג ועונה</p>
        </div>
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: saved ? "var(--accent-light)" : "var(--accent)", color: saved ? "var(--accent-dark)" : "#fff" }}>
          <Save size={14} /> {saved ? "נשמר!" : "שמור"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left: identity + personality + messages */}
        <div className="col-span-2 space-y-4">

          <Card>
            <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>זהות הבוט</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>שם הבוט</label>
                <input value={botName} onChange={e => setBotName(e.target.value)} placeholder="נועה, דני, עוזר..."
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>שפת תגובה</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
                  <option value="auto">זיהוי אוטומטי (מומלץ)</option>
                  <option value="he">עברית בלבד</option>
                  <option value="en">אנגלית בלבד</option>
                  <option value="ar">ערבית בלבד</option>
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>אופי הבוט</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {personalities.map(p => (
                <button key={p.id} onClick={() => setPersonality(p.id)}
                  className="p-3 rounded-lg text-right transition-all"
                  style={{
                    background: personality === p.id ? "var(--accent-light)" : "var(--bg-base)",
                    border: `1px solid ${personality === p.id ? "var(--accent)" : "var(--bg-border)"}`,
                  }}>
                  <div className="text-xs font-semibold" style={{ color: personality === p.id ? "var(--accent-dark)" : "var(--text-primary)" }}>{p.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{p.desc}</div>
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>הוראות לבוט (System Prompt)</label>
              <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>כאן אתה מגדיר מי הבוט, תחום העסק, וכיצד עליו להתנהג.</p>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>הודעות מיוחדות</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>הודעת ברכה (פנייה ראשונה)</label>
                <textarea value={welcome} onChange={e => setWelcome(e.target.value)} rows={3}
                  placeholder="השאר ריק כדי לדלג"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>הודעת גיבוי (כשה-AI נכשל)</label>
                <textarea value={fallback} onChange={e => setFallback(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>מגרש בדיקות</p>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>בדוק את הבוט לפני שמפעילים אותו ללקוחות</p>
            <div className="flex gap-2 mb-2">
              <input value={testMsg} onChange={e => setTestMsg(e.target.value)} placeholder="כתוב הודעת בדיקה..."
                onKeyDown={e => e.key === "Enter" && runTest()}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              <button onClick={runTest} disabled={testing || !testMsg.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "#fff", opacity: testing ? 0.7 : 1 }}>
                <Send size={13} /> {testing ? "רגע..." : "שלח"}
              </button>
            </div>
            {testReply && (
              <div className="p-3 rounded-lg text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>תגובת הבוט: </span>
                {testReply}
              </div>
            )}
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <ScanSearch size={16} style={{ color: "var(--accent)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>מעקב שיחה (Trace)</p>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>הזן מזהה שיחה כדי לראות איך ה-AI החליט: כוונה, סנטימנט, ביטחון, מקורות ופעולות</p>
            <div className="flex gap-2 mb-3">
              <input value={traceId} onChange={(e) => setTraceId(e.target.value)} placeholder="conversation id" dir="ltr"
                onKeyDown={(e) => e.key === "Enter" && loadTrace()}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              <button onClick={loadTrace} disabled={tracing || !traceId.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}>
                {tracing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} חפש
              </button>
            </div>
            {trace !== null && (
              trace.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>אין תורי AI לשיחה הזו</p>
              ) : (
                <div className="space-y-2">
                  {trace.map((t, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>{DECISION[t.decision] ?? t.decision}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-card)", color: SENTIMENT[t.sentiment]?.color ?? "var(--text-muted)" }}>{SENTIMENT[t.sentiment]?.label ?? t.sentiment}</span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>כוונה: {t.intent || "—"}</span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>ביטחון: {Math.round((t.confidence ?? 0) * 100)}%</span>
                      </div>
                      {t.answerText && <p className="text-xs mb-1.5" style={{ color: "var(--text-primary)" }}>{t.answerText}</p>}
                      <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-dim)" }}>
                        {t.usedSources?.length > 0 && <span>📚 {t.usedSources.length} מקורות</span>}
                        {t.toolCalls?.length > 0 && <span>🔧 {t.toolCalls.map((c) => c.name).join(", ")}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </Card>
        </div>

        {/* Right: model + parameters */}
        <div className="space-y-4">
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>מודל AI</p>
            <div className="space-y-2">
              {models.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg text-right transition-all"
                  style={{
                    background: model === m.id ? "var(--accent-light)" : "var(--bg-base)",
                    border: `1px solid ${model === m.id ? "var(--accent)" : "var(--bg-border)"}`,
                  }}>
                  <div className="text-xs font-medium" style={{ color: model === m.id ? "var(--accent-dark)" : "var(--text-primary)" }}>{m.name}</div>
                  {m.badge && <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ background: "var(--accent)", fontSize: "10px" }}>{m.badge}</span>}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>כוונון עדין</p>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>יצירתיות</label>
                  <span className="text-xs font-bold font-mono" style={{ color: "var(--accent-dark)" }}>{temperature.toFixed(1)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.1} value={temperature}
                  onChange={e => setTemperature(Number(e.target.value))} className="w-full accent-green-500" />
                <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  <span>מדויק</span><span>יצירתי</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>אורך תגובה</label>
                  <span className="text-xs font-bold font-mono" style={{ color: "var(--accent-dark)" }}>{maxTokens}</span>
                </div>
                <input type="range" min={64} max={2048} step={64} value={maxTokens}
                  onChange={e => setMaxTokens(Number(e.target.value))} className="w-full accent-green-500" />
                <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  <span>קצר</span><span>ארוך</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AgentVersionsPanel />
    </div>
  );
}

interface AgentVersion { id: string; version: number; label: string; systemPrompt: string; active: boolean }
interface Experiment { id: string; name: string; variantAConfigId: string; variantBConfigId: string; splitA: number }

/** Versioned agent persona + A/B experiment ([קטגוריה 24.5]). */
function AgentVersionsPanel() {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [label, setLabel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/ai/agent/versions").then((r) => (r.ok ? r.json() : { items: [] })).then((d) => setVersions(d.items ?? [])).catch(() => {});
    fetch("/api/ai/agent/experiment").then((r) => (r.ok ? r.json() : { experiment: null })).then((d) => setExperiment(d.experiment ?? null)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12, padding: 16 };
  const input: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" };

  async function createVersion() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/ai/agent/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), systemPrompt }) });
      setLabel(""); setSystemPrompt(""); load();
    } finally { setBusy(false); }
  }
  async function activate(id: string) { await fetch(`/api/ai/agent/versions/${id}/activate`, { method: "POST" }); load(); }
  async function startExperiment() {
    if (!a || !b) return;
    await fetch("/api/ai/agent/experiment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "A/B", variantAConfigId: a, variantBConfigId: b, splitA: 0.5 }) });
    load();
  }
  async function stopExperiment() { await fetch("/api/ai/agent/experiment", { method: "DELETE" }); load(); }

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div className="flex items-center gap-2 mb-1">
        <Bot size={16} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>גרסאות סוכן + בדיקת A/B</h3>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>צור גרסאות פרסונה, הפעל אחת כפעילה, או הרץ A/B בין שתיים — לקוח מקבל תמיד את אותו וריאנט.</p>

      <div className="space-y-2 mb-4">
        {versions.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>אין גרסאות עדיין.</p>
        ) : versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "var(--bg-base)" }}>
            <div className="min-w-0">
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>v{v.version} · {v.label}</span>
              {v.active && <span className="text-[10px] px-1.5 py-0.5 rounded mr-2" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>פעיל</span>}
            </div>
            {!v.active && <button onClick={() => activate(v.id)} className="text-xs" style={{ color: "var(--accent)" }}>הפעל</button>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="שם גרסה (למשל: טון ידידותי)" style={input} />
        <button onClick={createVersion} disabled={busy || !label.trim()} style={{ ...btn, opacity: busy || !label.trim() ? 0.5 : 1 }}>צור גרסה</button>
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={2} placeholder="הוראות פרסונה/טון לגרסה הזו..." style={{ ...input, gridColumn: "span 2", resize: "vertical" }} />
      </div>

      <div style={{ borderTop: "1px solid var(--bg-border)", paddingTop: 14 }}>
        {experiment ? (
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>ניסוי A/B פעיל ({Math.round(experiment.splitA * 100)}% / {Math.round((1 - experiment.splitA) * 100)}%)</span>
            <button onClick={stopExperiment} className="text-xs" style={{ color: "#DC2626" }}>עצור ניסוי</button>
          </div>
        ) : versions.length >= 2 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>A/B בין:</span>
            <select value={a} onChange={(e) => setA(e.target.value)} style={{ ...input, width: 170 }}><option value="">וריאנט A</option>{versions.map((v) => <option key={v.id} value={v.id}>v{v.version} {v.label}</option>)}</select>
            <select value={b} onChange={(e) => setB(e.target.value)} style={{ ...input, width: 170 }}><option value="">וריאנט B</option>{versions.map((v) => <option key={v.id} value={v.id}>v{v.version} {v.label}</option>)}</select>
            <button onClick={startExperiment} disabled={!a || !b || a === b} style={{ ...btn, opacity: !a || !b || a === b ? 0.5 : 1 }}>הרץ A/B</button>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>צור לפחות 2 גרסאות כדי להריץ A/B.</p>
        )}
      </div>
    </div>
  );
}
