"use client";

/**
 * Templates manager ([קטגוריה 19]) — live catalog from /api/templates.
 * Author drafts, submit them to Meta for approval, track status, and review the
 * version history of each template. Meta sync reconciles externally-made changes.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, RefreshCw, AlertCircle, FileText, Plus, Send, Pencil, Trash2, History, X, Save, Loader2 } from "lucide-react";

interface TemplateComponent { type: string; format?: string; text?: string; buttons?: { type: string; text: string }[] }
interface Revision { revision: number; action: string; status: string; at: string; note?: string | null }
interface Template {
  id: string;
  metaTemplateId: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  variableCount: number;
  rejectionReason: string | null;
  components: TemplateComponent[];
  history?: Revision[];
}

const STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  APPROVED: { label: "מאושר", color: "var(--accent-dark)", bg: "var(--accent-light)", icon: <CheckCircle2 size={13} /> },
  PENDING: { label: "ממתין לאישור", color: "#92400E", bg: "#FEF3C7", icon: <Clock size={13} /> },
  REJECTED: { label: "נדחה", color: "#B91C1C", bg: "#FEE2E2", icon: <XCircle size={13} /> },
  PAUSED: { label: "מושהה", color: "#92400E", bg: "#FEF3C7", icon: <Clock size={13} /> },
  DISABLED: { label: "מושבת", color: "#B91C1C", bg: "#FEE2E2", icon: <XCircle size={13} /> },
};

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 };
const input: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", cursor: "pointer" };

const bodyText = (t: Template) => t.components.find((c) => c.type === "BODY")?.text ?? "";

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [historyOf, setHistoryOf] = useState<Template | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/templates", { cache: "no-store" });
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

  async function sync() {
    setSyncing(true); setError(null);
    try {
      const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(String(e)); } finally { setSyncing(false); }
  }

  async function submit(t: Template) {
    if (!confirm(`לשלוח את "${t.name}" לאישור Meta?`)) return;
    const r = await fetch(`/api/templates/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) alert(d.error ?? "השליחה נכשלה"); else load();
  }

  async function remove(t: Template) {
    if (!confirm(`למחוק את התבנית "${t.name}"?`)) return;
    await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>תבניות הודעה</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>צור תבניות, שלח לאישור Meta ועקוב אחר הסטטוס — לפנייה יזומה מחוץ לחלון 24 השעות</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={sync} disabled={syncing} style={ghostBtn}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />{syncing ? "מסנכרן..." : "סנכרן מ-Meta"}
          </button>
          <button onClick={() => setEditing("new")} style={primaryBtn}><Plus size={15} /> תבנית חדשה</button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} />
          <span>{error.includes("WABA") ? "להגדיר WHATSAPP_WABA_ID כדי לסנכרן/לשלוח תבניות" : error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>טוען...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl flex flex-col items-center justify-center py-16" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <FileText size={28} className="mb-2 opacity-30" />
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>אין תבניות עדיין — צור תבנית או סנכרן מ-Meta</p>
          <button onClick={() => setEditing("new")} style={primaryBtn}><Plus size={15} /> צור תבנית</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {items.map((t) => {
            const s = STATUS[t.status] ?? { label: t.status, color: "var(--text-muted)", bg: "var(--bg-base)", icon: null };
            const isDraft = !t.metaTemplateId;
            return (
              <div key={t.id} style={{ ...card, padding: 16 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>{s.icon}{s.label}</span>
                </div>
                {bodyText(t) && <p className="text-xs mb-2" style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{bodyText(t)}</p>}
                <div className="flex gap-3 text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  <span>שפה: {t.language}</span>
                  <span>קטגוריה: {t.category}</span>
                  <span>{t.variableCount} משתנים</span>
                </div>
                {t.rejectionReason && <div className="text-xs mb-2" style={{ color: "#B91C1C" }}>סיבת דחייה: {t.rejectionReason}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(isDraft || t.status === "REJECTED") && <button onClick={() => submit(t)} style={{ ...ghostBtn, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none" }}><Send size={12} /> שלח לאישור</button>}
                  {isDraft && <button onClick={() => setEditing(t)} style={ghostBtn}><Pencil size={12} /> עריכה</button>}
                  {t.history?.length ? <button onClick={() => setHistoryOf(t)} style={ghostBtn}><History size={12} /> גרסאות ({t.history.length})</button> : null}
                  {isDraft && <button onClick={() => remove(t)} style={{ ...ghostBtn, color: "#DC2626" }}><Trash2 size={12} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <TemplateEditor template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {historyOf && <HistoryModal template={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [language, setLanguage] = useState(template?.language ?? "he");
  const [category, setCategory] = useState(template?.category ?? "UTILITY");
  const [header, setHeader] = useState(template?.components.find((c) => c.type === "HEADER")?.text ?? "");
  const [body, setBody] = useState(bodyText(template ?? { components: [] } as unknown as Template));
  const [footer, setFooter] = useState(template?.components.find((c) => c.type === "FOOTER")?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !template;

  async function save() {
    setError(null);
    if (!body.trim()) { setError("גוף ההודעה חובה"); return; }
    if (isNew && !name.trim()) { setError("שם התבנית חובה"); return; }
    const components: TemplateComponent[] = [];
    if (header.trim()) components.push({ type: "HEADER", format: "TEXT", text: header.trim() });
    components.push({ type: "BODY", text: body.trim() });
    if (footer.trim()) components.push({ type: "FOOTER", text: footer.trim() });
    setSaving(true);
    try {
      const payload = { name: name.trim(), language, category, components };
      const res = isNew
        ? await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/templates/${template!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, components }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "שמירה נכשלה"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 520, maxWidth: "94%", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{isNew ? "תבנית חדשה" : `עריכת ${template!.name}`}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="grid grid-cols-3 gap-3">
            <div style={{ gridColumn: "span 1" }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>שם (snake_case)</label>
              <input value={name} disabled={!isNew} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="order_update" style={{ ...input, fontFamily: "monospace", direction: "ltr", textAlign: "left", opacity: isNew ? 1 : 0.6 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>שפה</label>
              <select value={language} disabled={!isNew} onChange={(e) => setLanguage(e.target.value)} style={{ ...input, opacity: isNew ? 1 : 0.6 }}>
                <option value="he">עברית</option><option value="en_US">English</option><option value="ar">العربية</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>קטגוריה</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
                <option value="UTILITY">שירות</option><option value="MARKETING">שיווק</option><option value="AUTHENTICATION">אימות</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>כותרת (אופציונלי)</label>
            <input value={header} onChange={(e) => setHeader(e.target.value)} style={input} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>גוף ההודעה · השתמש ב-{`{{1}}`} למשתנים</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={"שלום {{1}}, ההזמנה שלך מספר {{2}} בדרך אליך!"} style={{ ...input, resize: "vertical" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>כותרת תחתונה (אופציונלי)</label>
            <input value={footer} onChange={(e) => setFooter(e.target.value)} style={input} />
          </div>
        </div>
        {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} שמור טיוטה</button>
          <button onClick={onClose} style={ghostBtn}>ביטול</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>התבנית נשמרת כטיוטה. לחץ "שלח לאישור" בכרטיס כדי לשלוח ל-Meta.</p>
      </div>
    </div>
  );
}

function HistoryModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const actionLabel: Record<string, string> = { created: "נוצרה", edited: "נערכה", submitted: "נשלחה לאישור" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 440, maxWidth: "92%", maxHeight: "85vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><History size={16} /> גרסאות — {template.name}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...(template.history ?? [])].reverse().map((r) => (
            <div key={r.revision} style={{ border: "1px solid var(--bg-border)", borderRadius: 10, padding: 10 }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>גרסה {r.revision} · {actionLabel[r.action] ?? r.action}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{new Date(r.at).toLocaleString("he-IL")}</span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>סטטוס: {STATUS[r.status]?.label ?? r.status}</div>
            </div>
          ))}
          {!template.history?.length && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>אין היסטוריה.</p>}
        </div>
      </div>
    </div>
  );
}
