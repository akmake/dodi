"use client";

/**
 * Tickets / Helpdesk ([קטגוריה 16]) — live list with SLA clock, saved Views,
 * canned macros, and an inline detail panel for status/priority/notes.
 */
import { useCallback, useEffect, useState } from "react";
import { Ticket as TicketIcon, AlertCircle, Plus, Save, X, Loader2, Zap, Bookmark, Trash2, Settings2, Clock3 } from "lucide-react";

type Status = "new" | "open" | "pending" | "on_hold" | "solved" | "closed";
type Priority = "low" | "normal" | "high" | "urgent";
interface Sla { firstResponseDueAt: string | null; resolutionDueAt: string | null; firstRespondedAt: string | null; breached: boolean }
interface Ticket { id: string; subject: string; status: Status; priority: Priority; topic: string | null; tags: string[]; assigneeId: string | null; sla: Sla | null; createdAt: string }
interface Macro { id: string; name: string; body: string | null; setStatus: Status | null; setPriority: Priority | null; addTags: string[] }
interface View { id: string; name: string; filter: { status?: Status; priority?: Priority; assigneeId?: string; tag?: string } }

const STATUS_LABEL: Record<string, string> = { new: "חדש", open: "פתוח", pending: "ממתין", on_hold: "בהמתנה", solved: "נפתר", closed: "סגור" };
const PRIORITY: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "דחוף", color: "#B91C1C", bg: "#FEE2E2" },
  high: { label: "גבוה", color: "#92400E", bg: "#FEF3C7" },
  normal: { label: "רגיל", color: "var(--text-muted)", bg: "var(--bg-base)" },
  low: { label: "נמוך", color: "var(--text-dim)", bg: "var(--bg-base)" },
};
const BUILTIN_FILTERS = ["all", "open", "pending", "solved"] as const;

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 };
const input: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", cursor: "pointer" };

/** SLA badge: breached, or time remaining to the next due milestone. */
function SlaBadge({ sla }: { sla: Sla | null }) {
  if (!sla) return null;
  if (sla.breached) return <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ color: "#B91C1C", background: "#FEE2E2" }}><Clock3 size={11} /> חריגת SLA</span>;
  const due = !sla.firstRespondedAt && sla.firstResponseDueAt ? new Date(sla.firstResponseDueAt) : sla.resolutionDueAt ? new Date(sla.resolutionDueAt) : null;
  if (!due) return null;
  const mins = Math.round((due.getTime() - Date.now()) / 60000);
  const label = mins < 0 ? "באיחור" : mins < 60 ? `${mins} ד׳` : `${Math.round(mins / 60)} ש׳`;
  const danger = mins < 30;
  return <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ color: danger ? "#92400E" : "var(--text-muted)", background: danger ? "#FEF3C7" : "var(--bg-base)" }}><Clock3 size={11} /> {sla.firstRespondedAt ? "פתרון" : "מענה"} בעוד {label}</span>;
}

export default function TicketsPage() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [active, setActive] = useState<string>("all"); // builtin filter or view:<id>
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [manageMacros, setManageMacros] = useState(false);

  const currentView = active.startsWith("view:") ? views.find((v) => v.id === active.slice(5)) : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = "";
      if (currentView) {
        const p = new URLSearchParams(Object.entries(currentView.filter).filter(([, v]) => v) as [string, string][]);
        q = `?${p.toString()}`;
      } else if (active !== "all") q = `?status=${active}`;
      const r = await fetch(`/api/tickets${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setItems((await r.json()).items ?? []);
      setError(null);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, [active, currentView]);

  const loadMeta = useCallback(async () => {
    const [v, m] = await Promise.all([
      fetch("/api/tickets/views").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch("/api/tickets/macros").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ]);
    setViews(v.items ?? []); setMacros(m.items ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  async function saveCurrentView() {
    const name = prompt("שם ל-View השמור:");
    if (!name) return;
    const filter = active !== "all" && !currentView ? { status: active as Status } : currentView?.filter ?? {};
    await fetch("/api/tickets/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, filter }) });
    loadMeta();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>טיקטים</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>פניות מורכבות עם שעון SLA, תצוגות שמורות ומאקרו לטיפול מהיר</p>
        </div>
        <button onClick={() => setManageMacros(true)} style={ghostBtn}><Settings2 size={14} /> מאקרו</button>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        {BUILTIN_FILTERS.map((f) => (
          <button key={f} onClick={() => setActive(f)} className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: active === f ? "var(--accent-light)" : "var(--bg-card)", color: active === f ? "var(--accent-dark)" : "var(--text-muted)", border: "1px solid var(--bg-border)" }}>
            {f === "all" ? "הכל" : STATUS_LABEL[f]}
          </button>
        ))}
        {views.map((v) => (
          <span key={v.id} className="flex items-center text-sm rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)", background: active === `view:${v.id}` ? "var(--accent-light)" : "var(--bg-card)" }}>
            <button onClick={() => setActive(`view:${v.id}`)} className="px-3 py-1.5 flex items-center gap-1" style={{ color: active === `view:${v.id}` ? "var(--accent-dark)" : "var(--text-muted)" }}><Bookmark size={12} /> {v.name}</button>
            <button onClick={async () => { await fetch(`/api/tickets/views/${v.id}`, { method: "DELETE" }); if (active === `view:${v.id}`) setActive("all"); loadMeta(); }} className="px-1.5" style={{ color: "var(--text-dim)" }}><X size={12} /></button>
          </span>
        ))}
        <button onClick={saveCurrentView} style={{ ...ghostBtn, padding: "5px 9px" }}><Plus size={12} /> שמור View</button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={card}>
        {loading ? (
          <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16"><TicketIcon size={28} className="mb-2 opacity-30" /><p className="text-sm" style={{ color: "var(--text-muted)" }}>אין טיקטים</p></div>
        ) : (
          items.map((t) => {
            const p = PRIORITY[t.priority] ?? PRIORITY.normal;
            return (
              <div key={t.id} onClick={() => setDetail(t)} className="flex items-center justify-between px-4 py-3 cursor-pointer" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.subject}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{STATUS_LABEL[t.status] ?? t.status}{t.topic ? ` · ${t.topic}` : ""}{t.tags.length ? ` · ${t.tags.join(", ")}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {t.status !== "solved" && t.status !== "closed" && <SlaBadge sla={t.sla} />}
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: p.color, background: p.bg }}>{p.label}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {detail && <TicketDetail ticket={detail} macros={macros} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load(); }} />}
      {manageMacros && <MacrosManager macros={macros} onClose={() => setManageMacros(false)} onChanged={loadMeta} />}
    </div>
  );
}

function TicketDetail({ ticket, macros, onClose, onChanged }: { ticket: Ticket; macros: Macro[]; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState<Status>(ticket.status);
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/tickets/${ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onChanged();
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: "92%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{ticket.subject}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SlaBadge sla={ticket.sla} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>סטטוס</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)} style={input}>
                {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>עדיפות</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} style={input}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>הערה פנימית</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...input, resize: "vertical" }} />
          </div>
          {macros.length > 0 && (
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>החל מאקרו</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {macros.map((m) => (
                  <button key={m.id} disabled={saving} onClick={() => patch({ macroId: m.id })} style={{ ...ghostBtn, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none" }}><Zap size={12} /> {m.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button disabled={saving} onClick={() => patch({ status, priority, ...(note.trim() ? { note: note.trim() } : {}) })} style={primaryBtn}>{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} שמור</button>
          <button disabled={saving} onClick={() => patch({ markResponded: true })} style={ghostBtn}>סמן מענה ראשון</button>
        </div>
      </div>
    </div>
  );
}

function MacrosManager({ macros, onClose, onChanged }: { macros: Macro[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [setStatusVal, setSetStatusVal] = useState<string>("");
  const [setPriorityVal, setSetPriorityVal] = useState<string>("");

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/tickets/macros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), body: body.trim() || null, setStatus: setStatusVal || null, setPriority: setPriorityVal || null }) });
    setName(""); setBody(""); setSetStatusVal(""); setSetPriorityVal(""); onChanged();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: "92%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Zap size={16} /> מאקרו</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {macros.map((m) => (
            <div key={m.id} className="flex items-center justify-between" style={{ border: "1px solid var(--bg-border)", borderRadius: 10, padding: "8px 12px" }}>
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{[m.setStatus && STATUS_LABEL[m.setStatus], m.setPriority && PRIORITY[m.setPriority]?.label, m.body && "תגובה"].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <button onClick={async () => { await fetch(`/api/tickets/macros/${m.id}`, { method: "DELETE" }); onChanged(); }} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={14} color="#EF4444" /></button>
            </div>
          ))}
          {macros.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>אין מאקרו עדיין.</p>}
        </div>
        <div style={{ borderTop: "1px solid var(--bg-border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם המאקרו (למשל: סגירה עם תודה)" style={input} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="תגובה קבועה (אופציונלי)" style={{ ...input, resize: "vertical" }} />
          <div className="grid grid-cols-2 gap-3">
            <select value={setStatusVal} onChange={(e) => setSetStatusVal(e.target.value)} style={input}>
              <option value="">— ללא שינוי סטטוס —</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={setPriorityVal} onChange={(e) => setSetPriorityVal(e.target.value)} style={input}>
              <option value="">— ללא שינוי עדיפות —</option>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <button onClick={create} style={primaryBtn}><Plus size={14} /> הוסף מאקרו</button>
        </div>
      </div>
    </div>
  );
}
