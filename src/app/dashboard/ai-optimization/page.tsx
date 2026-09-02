"use client";

/**
 * AI Optimization ([קטגוריה 24]) — test suites + knowledge gaps.
 * Live /api/ai-optimization/*.
 */
import { useCallback, useEffect, useState } from "react";
import {
  FlaskConical, Gauge, Plus, AlertCircle, Loader2, Play, CheckCircle2, XCircle, TrendingDown,
} from "lucide-react";

interface TestCase {
  id: string;
  input: string;
  expectContains: string[];
  result: { passed: boolean; actualText: string; actualIntent: string | null } | null;
}
interface Suite {
  id: string;
  name: string;
  cases: TestCase[];
  passRate: number | null;
  lastRunAt: string | null;
}
interface Gap { intent: string; count: number; handoffRate: number }

export default function AiOptimizationPage() {
  const [tab, setTab] = useState<"suites" | "gaps">("suites");
  const [suites, setSuites] = useState<Suite[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [cases, setCases] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([
        fetch("/api/ai-optimization/suites", { cache: "no-store" }),
        fetch("/api/ai-optimization/gaps", { cache: "no-store" }),
      ]);
      if (!s.ok) throw new Error((await s.json()).error ?? `HTTP ${s.status}`);
      setSuites((await s.json()).items ?? []);
      setGaps(g.ok ? (await g.json()).items ?? [] : []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Parse one case per line: "שאלה => מילה1, מילה2"
  function parseCases(text: string) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [input, contains] = line.split("=>");
      return {
        input: input.trim(),
        expectContains: (contains ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      };
    });
  }

  async function addSuite() {
    if (!name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/ai-optimization/suites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cases: parseCases(cases) }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setName(""); setCases("");
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  async function run(id: string) {
    setRunning(id);
    try {
      const r = await fetch(`/api/ai-optimization/suites/${id}/run`, { method: "POST" });
      if (r.ok) {
        const updated: Suite = await r.json();
        setSuites((prev) => prev.map((s) => (s.id === id ? updated : s)));
      }
    } finally { setRunning(null); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>אופטימיזציית AI</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>בדיקות רגרסיה לסוכן וזיהוי פערי ידע</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="flex gap-1.5">
        {([["suites", "ערכות בדיקה", FlaskConical], ["gaps", "פערי ידע", Gauge]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === k ? "var(--accent-light)" : "var(--bg-card)",
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              border: "1px solid var(--bg-border)",
            }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {tab === "suites" ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
            <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>ערכת בדיקה חדשה</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הערכה"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
            <textarea value={cases} onChange={(e) => setCases(e.target.value)} rows={6}
              placeholder={"מקרה בכל שורה:\nמה שעות הפתיחה? => 9, 17\nאיך מבטלים הזמנה? => ביטול"}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>פורמט: שאלה {"=>"} מילים שחייבות להופיע בתשובה</div>
            <button onClick={addSuite} disabled={saving || !name.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              צור ערכה
            </button>
          </div>

          <div className="col-span-2 space-y-3">
            {loading ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>טוען...</p>
              : suites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
                  <FlaskConical size={28} className="mb-2 opacity-30" />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין ערכות בדיקה עדיין</p>
                </div>
              ) : suites.map((s) => (
                <div key={s.id} className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{s.cases.length} מקרים</span>
                      {s.passRate !== null && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "var(--bg-base)", color: s.passRate >= 0.8 ? "#16A34A" : s.passRate >= 0.5 ? "#D97706" : "#DC2626" }}>
                          {Math.round(s.passRate * 100)}% עברו
                        </span>
                      )}
                    </div>
                    <button onClick={() => run(s.id)} disabled={running === s.id}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      {running === s.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      הרץ
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {s.cases.map((c) => (
                      <div key={c.id} className="flex items-start gap-2 text-xs">
                        {c.result
                          ? (c.result.passed ? <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#16A34A" }} /> : <XCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#DC2626" }} />)
                          : <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5" style={{ border: "1.5px solid var(--bg-border)" }} />}
                        <div className="min-w-0">
                          <div style={{ color: "var(--text-primary)" }}>{c.input}</div>
                          {c.result && !c.result.passed && (
                            <div className="truncate" style={{ color: "var(--text-dim)" }}>קיבל: {c.result.actualText.slice(0, 80)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
            : gaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Gauge size={28} className="mb-2 opacity-30" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין מספיק נתונים — פערי ידע יופיעו לפי שיחות שהובילו ל-handoff</p>
              </div>
            ) : gaps.map((g) => (
              <div key={g.intent} className="flex items-center justify-between px-4 py-3 gap-4" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingDown size={15} style={{ color: "#DC2626" }} />
                  <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{g.intent}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{g.count} שיחות</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-40">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(g.handoffRate * 100)}%`, background: "#DC2626" }} />
                  </div>
                  <span className="text-xs font-semibold w-9 text-left" style={{ color: "#DC2626" }}>{Math.round(g.handoffRate * 100)}%</span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
