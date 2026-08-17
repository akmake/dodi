"use client";

/**
 * Lead Management ([קטגוריה 21]) — sales pipeline kanban. Live /api/leads.
 */
import { useCallback, useEffect, useState } from "react";
import { Target, Plus, AlertCircle, Loader2, UserPlus, Star } from "lucide-react";

interface Stage { id: string; name: string; order: number; isWon: boolean; isLost: boolean }
interface Lead {
  id: string;
  contactId: string;
  source: string;
  status: string;
  score: number;
  ownerId: string | null;
  pipelineStageId: string | null;
  estimatedValue: number | null;
}
interface Contact { id: string; firstName: string | null; lastName: string | null; phone: string; waId: string }
interface User { id: string; name?: string; email?: string }

const SOURCE: Record<string, string> = {
  ctwa_ad: "מודעה", qr: "QR", website: "אתר", inbound: "נכנס", manual: "ידני", import: "ייבוא",
};
const STATUS: Record<string, string> = {
  new: "חדש", contacted: "יצרנו קשר", qualified: "מוסמך", unqualified: "לא רלוונטי", won: "נסגר", lost: "אבוד",
};
const scoreColor = (s: number) => (s >= 60 ? "#16A34A" : s >= 30 ? "#D97706" : "#6B7280");

export default function LeadsPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [contactId, setContactId] = useState("");
  const [source, setSource] = useState("manual");
  const [value, setValue] = useState("");

  const load = useCallback(async () => {
    try {
      const [st, l, c, u] = await Promise.all([
        fetch("/api/leads/stages", { cache: "no-store" }),
        fetch("/api/leads", { cache: "no-store" }),
        fetch("/api/contacts", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
      ]);
      if (!st.ok) throw new Error((await st.json()).error ?? `HTTP ${st.status}`);
      setStages((await st.json()).items ?? []);
      setLeads(l.ok ? (await l.json()).items ?? [] : []);
      setContacts(c.ok ? (await c.json()).items ?? [] : []);
      setUsers(u.ok ? (await u.json()).items ?? [] : []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) return id.slice(0, 8);
    return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || c.waId;
  };
  const ownerName = (id: string | null) => {
    if (!id) return null;
    const u = users.find((x) => x.id === id);
    return u?.name || u?.email || id.slice(0, 6);
  };

  async function capture() {
    if (!contactId || saving) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, source, estimatedValue: value ? Number(value) : null }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setContactId(""); setValue("");
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const updated: Lead = await (await fetch(`/api/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })).json();
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>לידים</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>צינור מכירות — לכידה, הסמכה וניהול הזדמנויות</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      {/* Capture bar */}
      <div className="rounded-xl p-3 flex items-end gap-3 flex-wrap" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
        <div className="flex-1 min-w-48">
          <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>איש קשר</label>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            <option value="">בחר איש קשר…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{nameOf(c.id)}</option>)}
          </select>
        </div>
        <div className="w-32">
          <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>מקור</label>
          <select value={source} onChange={(e) => setSource(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            {Object.entries(SOURCE).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="w-32">
          <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>ערך משוער (₪)</label>
          <input value={value} type="number" onChange={(e) => setValue(e.target.value)} placeholder="0"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
        </div>
        <button onClick={capture} disabled={saving || !contactId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          צור ליד
        </button>
      </div>

      {/* Kanban */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>טוען...</p>
      ) : stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <Target size={28} className="mb-2 opacity-30" />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין שלבי פייפליין — ייווצרו אוטומטית עם הליד הראשון</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const col = leads.filter((l) => l.pipelineStageId === stage.id);
            return (
              <div key={stage.id} className="flex-shrink-0 w-64">
                <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-sm font-semibold" style={{ color: stage.isWon ? "#16A34A" : stage.isLost ? "#DC2626" : "var(--text-primary)" }}>{stage.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}>{col.length}</span>
                </div>
                <div className="space-y-2 min-h-16 rounded-xl p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
                  {col.map((l) => (
                    <div key={l.id} className="rounded-lg p-2.5 space-y-2" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{nameOf(l.contactId)}</span>
                        <span className="flex items-center gap-0.5 text-xs font-bold flex-shrink-0" style={{ color: scoreColor(l.score) }}>
                          <Star size={11} fill="currentColor" />{l.score}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}>{SOURCE[l.source] ?? l.source}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}>{STATUS[l.status] ?? l.status}</span>
                        {l.estimatedValue ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>₪{l.estimatedValue}</span> : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select value={l.pipelineStageId ?? ""} onChange={(e) => patch(l.id, { stageId: e.target.value })}
                          className="flex-1 text-xs px-2 py-1 rounded-lg outline-none cursor-pointer"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
                          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button onClick={() => patch(l.id, { assignAuto: true })} title={ownerName(l.ownerId) ? `משויך ל-${ownerName(l.ownerId)}` : "שיוך אוטומטי"}
                          className="p-1.5 rounded-lg flex-shrink-0"
                          style={{ background: l.ownerId ? "var(--accent-light)" : "var(--bg-card)", color: l.ownerId ? "var(--accent)" : "var(--text-muted)", border: "1px solid var(--bg-border)" }}>
                          <UserPlus size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && <p className="text-xs text-center py-3" style={{ color: "var(--text-dim)" }}>ריק</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
