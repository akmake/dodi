"use client";

/**
 * AI Skills ([קטגוריה 11]) — per-topic instructions the agent routes to. Live /api/skills.
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Plus, AlertCircle, Loader2, Trash2, Power, FlaskConical, X } from "lucide-react";

interface ProcedureStep { instruction: string }
interface Skill {
  id: string;
  name: string;
  intents: string[];
  instructions: string;
  procedure?: ProcedureStep[];
  enabled: boolean;
  version?: number;
}

export default function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [intents, setIntents] = useState("");
  const [instructions, setInstructions] = useState("");
  const [procedure, setProcedure] = useState("");
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState<Skill | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/skills", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setItems((await r.json()).items ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(s: Skill) {
    await fetch(`/api/skills/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הכישור?")) return;
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    await load();
  }

  async function add() {
    if (!name.trim() || !instructions.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/skills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          instructions,
          intents: intents.split(",").map((s) => s.trim()).filter(Boolean),
          procedure: procedure.split("\n").map((l) => l.trim()).filter(Boolean).map((instruction) => ({ instruction })),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setName(""); setIntents(""); setInstructions(""); setProcedure("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>כישורי AI</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>הוראות ייעודיות לכל נושא — הסוכן מנתב את השיחה לכישור המתאים</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>כישור חדש</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם (למשל: ביטול הזמנה)"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <input value={intents} onChange={(e) => setIntents(e.target.value)} placeholder="intents (מופרד בפסיק): cancel_order, refund"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="הוראות לסוכן בנושא הזה..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <textarea value={procedure} onChange={(e) => setProcedure(e.target.value)} rows={3} placeholder="נוהל (שלב בכל שורה):&#10;שאל את שם הלקוח&#10;בדוק זמינות&#10;אשר הזמנה"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <button onClick={add} disabled={saving || !name.trim() || !instructions.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            צור כישור
          </button>
        </div>

        <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Sparkles size={28} className="mb-2 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין כישורים עדיין — צור את הראשון</p>
            </div>
          ) : (
            items.map((s) => (
              <div key={s.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)", opacity: s.enabled ? 1 : 0.5 }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles size={15} style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                    {s.intents.map((i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>{i}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.version && s.version > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}>v{s.version}</span>}
                    <button onClick={() => setSimulating(s)} title="סימולטור" style={{ color: "var(--accent)" }}><FlaskConical size={14} /></button>
                    <button onClick={() => toggle(s)} title={s.enabled ? "השבת" : "הפעל"} style={{ color: s.enabled ? "#16A34A" : "var(--text-muted)" }}><Power size={14} /></button>
                    <button onClick={() => remove(s.id)} title="מחק" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-xs line-clamp-2" style={{ color: "var(--text-muted)" }}>{s.instructions}</p>
                {!!s.procedure?.length && <p className="text-[11px] mt-1" style={{ color: "var(--accent-dark)" }}>נוהל: {s.procedure.length} שלבים</p>}
              </div>
            ))
          )}
        </div>
      </div>

      {simulating && <SimulatorModal skill={simulating} onClose={() => setSimulating(null)} />}
    </div>
  );
}

interface SimTurn { role: "user" | "assistant"; content: string }

function SimulatorModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<SimTurn[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function send() {
    const text = message.trim();
    if (!text || running) return;
    // Optimistically show the user's turn; send prior history for memory.
    const history = turns;
    setTurns((t) => [...t, { role: "user", content: text }]);
    setMessage("");
    setRunning(true);
    try {
      const r = await fetch("/api/skills/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: skill.id, message: text, history }),
      });
      const d = await r.json().catch(() => ({}));
      setTurns((t) => [...t, { role: "assistant", content: r.ok ? d.reply : d.error ?? "הסימולציה נכשלה" }]);
      if (r.ok && Array.isArray(d.availableTools)) setTools(d.availableTools);
    } finally { setRunning(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92%", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 20, background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><FlaskConical size={16} /> סימולטור — {skill.name}</h3>
          <div className="flex items-center gap-2">
            {turns.length > 0 && <button onClick={() => { setTurns([]); setTools([]); }} className="text-xs" style={{ color: "var(--text-muted)" }}>נקה שיחה</button>}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
          </div>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>שיחת-בדיקה מתגלגלת מול הסוכן (עם זיכרון) — ללא שליחה אמיתית וללא הרצת פעולות.</p>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 160, display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px", marginBottom: 10 }}>
          {turns.length === 0 ? (
            <p className="text-xs text-center mt-8" style={{ color: "var(--text-muted)" }}>כתוב הודעת לקוח כדי להתחיל שיחת בדיקה.</p>
          ) : turns.map((t, i) => (
            <div key={i} style={{ alignSelf: t.role === "user" ? "flex-start" : "flex-end", maxWidth: "82%" }}>
              <div style={{ background: t.role === "user" ? "var(--bg-base)" : "var(--accent-light)", color: t.role === "user" ? "var(--text-primary)" : "var(--accent-dark)", border: "1px solid var(--bg-border)", borderRadius: 12, padding: "8px 11px", fontSize: 13, whiteSpace: "pre-wrap" }}>{t.content}</div>
            </div>
          ))}
          {running && <div style={{ alignSelf: "flex-end", color: "var(--text-muted)" }}><Loader2 size={14} className="animate-spin" /></div>}
        </div>

        {tools.length > 0 && <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>כלים זמינים: {tools.join(", ")}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="הודעת לקוח..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <button onClick={send} disabled={running || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>שלח</button>
        </div>
      </div>
    </div>
  );
}
