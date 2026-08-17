"use client";

/**
 * Knowledge Base ([קטגוריה 12]) — sources the AI answers from. Live /api/knowledge.
 */
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Plus, AlertCircle, Loader2 } from "lucide-react";

interface Source {
  id: string;
  title: string;
  type: string;
  status: string;
  lastSyncedAt: string | null;
}

export default function KnowledgePage() {
  const [items, setItems] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/knowledge", { cache: "no-store" });
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

  async function add() {
    if (!title.trim() || !text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/knowledge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "snippet", title, text }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setTitle(""); setText("");
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
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>מאגר ידע</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>המקורות שה-AI עונה מתוכם — בלי להמציא</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Add form */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>הוספת מקור ידע</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת (למשל: שעות פתיחה)"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="תוכן המקור..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <button onClick={add} disabled={saving || !title.trim() || !text.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            הוסף למאגר
          </button>
        </div>

        {/* List */}
        <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <BookOpen size={28} className="mb-2 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין מקורות עדיין — הוסף את הראשון</p>
            </div>
          ) : (
            items.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex items-center gap-2">
                  <BookOpen size={15} style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.title}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>{s.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
