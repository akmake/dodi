"use client";

/**
 * Data collections dashboard ([קטגוריה 28]) — the no-code "internal database".
 * Define tables (schema) and manage their rows; flows read/write them via the
 * `data` node. Three modes: list → schema editor → records table.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Plus, Trash2, Pencil, ArrowRight, Table2, Save, X, Loader2, Download, Upload, BarChart3 } from "lucide-react";

type FieldType = "text" | "number" | "boolean" | "date" | "datetime" | "select" | "reference" | "json";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "טקסט" },
  { value: "number", label: "מספר" },
  { value: "boolean", label: "כן/לא" },
  { value: "date", label: "תאריך" },
  { value: "datetime", label: "תאריך ושעה" },
  { value: "select", label: "בחירה מרשימה" },
  { value: "reference", label: "הפניה לטבלה" },
  { value: "json", label: "JSON" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  options?: string[];
  refCollection?: string;
}
interface Collection {
  id: string;
  name: string;
  label: string;
  description?: string | null;
  fields: FieldDef[];
  recordCount?: number;
  aiAccess?: "none" | "read" | "write";
}
interface Rec { id: string; data: Record<string, unknown> }

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 };
const input: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", cursor: "pointer" };

export default function DataPage() {
  const [mode, setMode] = useState<"list" | "schema" | "records">("list");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/data/collections")
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((d) => setCollections(d.collections ?? []))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  if (mode === "schema") {
    return <SchemaEditor collection={editing} collections={collections}
      onCancel={() => { setMode("list"); setEditing(null); }}
      onSaved={() => { setMode("list"); setEditing(null); reload(); }} />;
  }
  if (mode === "records" && editing) {
    return <RecordsView collection={editing} onBack={() => { setMode("list"); setEditing(null); reload(); }} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Database size={22} /> מאגרי מידע
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            טבלאות נתונים פנימיות שכל תהליך יכול לקרוא ולכתוב — תורים, מלאי, הרשמות, הזמנות וכל מה שצריך. בלי קוד, בלי API חיצוני.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setMode("schema"); }} style={primaryBtn}><Plus size={15} /> טבלה חדשה</button>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}><Loader2 className="animate-spin" size={20} /></div>
      ) : collections.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: "center" }}>
          <Database size={40} className="mx-auto mb-3 opacity-20" />
          <h3 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>אין עדיין טבלאות</h3>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>צור טבלה ראשונה — למשל "חדרים", "תורים" או "נרשמים"</p>
          <button onClick={() => { setEditing(null); setMode("schema"); }} style={{ ...primaryBtn, margin: "0 auto" }}><Plus size={15} /> צור טבלה ראשונה</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {collections.map((c) => (
            <div key={c.id} style={{ ...card, padding: 16 }}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{c.label}</h3>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{c.name}</span>
              </div>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{c.fields.length} שדות · {c.recordCount ?? 0} שורות</p>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(c); setMode("records"); }} style={{ ...ghostBtn, flex: 1, justifyContent: "center", background: "var(--accent-light)", color: "var(--accent-dark)", border: "none" }}><Table2 size={13} /> שורות</button>
                <button onClick={() => { setEditing(c); setMode("schema"); }} style={ghostBtn}><Pencil size={13} /></button>
                <button onClick={async () => { if (confirm(`למחוק את הטבלה "${c.label}" וכל השורות?`)) { await fetch(`/api/data/collections/${c.id}`, { method: "DELETE" }); reload(); } }} style={{ ...ghostBtn, background: "#FEE2E2", color: "#DC2626", border: "none" }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Schema editor ─────────────────────────────────────────────────────────────
function SchemaEditor({ collection, collections, onCancel, onSaved }: {
  collection: Collection | null; collections: Collection[]; onCancel: () => void; onSaved: () => void;
}) {
  const isNew = !collection;
  const [name, setName] = useState(collection?.name ?? "");
  const [label, setLabel] = useState(collection?.label ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [fields, setFields] = useState<FieldDef[]>(collection?.fields ?? []);
  const [aiAccess, setAiAccess] = useState<"none" | "read" | "write">(collection?.aiAccess ?? "read");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (i: number, patch: Partial<FieldDef>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  async function save() {
    setError(null);
    if (!label.trim()) { setError("שם תצוגה חובה"); return; }
    if (isNew && !name.trim()) { setError("מפתח טבלה חובה (אנגלית, ללא רווחים)"); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), label: label.trim(), description, fields, aiAccess };
      const res = isNew
        ? await fetch("/api/data/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(`/api/data/collections/${collection!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), description, fields, aiAccess }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "שמירה נכשלה"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5" style={{ maxWidth: 760 }}>
      <button onClick={onCancel} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
        <ArrowRight size={14} /> חזרה למאגרי מידע
      </button>
      <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{isNew ? "טבלה חדשה" : `עריכת מבנה — ${collection!.label}`}</h1>

      <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>שם תצוגה</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="חדרים" style={input} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>מפתח (אנגלית)</label>
            <input value={name} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} disabled={!isNew}
              placeholder="rooms" style={{ ...input, fontFamily: "monospace", direction: "ltr", textAlign: "left", opacity: isNew ? 1 : 0.6 }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>תיאור (אופציונלי)</label>
          <input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} style={input} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>גישת ה‑AI לטבלה</label>
          <select value={aiAccess} onChange={(e) => setAiAccess(e.target.value as "none" | "read" | "write")} style={input}>
            <option value="none">ללא — הסוכן לא רואה את הטבלה</option>
            <option value="read">קריאה — הסוכן יכול לחפש ולסכם</option>
            <option value="write">קריאה+כתיבה — הסוכן יכול גם להוסיף/לעדכן (מלאי, הרשמות…)</option>
          </select>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>קובע אילו כלים נחשפים ל‑AI Agent עבור הטבלה הזו.</p>
        </div>
      </div>

      <div style={{ ...card, padding: 18 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>שדות הטבלה</h3>
          <button onClick={() => setFields((fs) => [...fs, { key: "", label: "", type: "text" }])} style={ghostBtn}><Plus size={13} /> שדה</button>
        </div>
        {fields.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>אין עדיין שדות. הוסף לפחות שדה אחד.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fields.map((f, i) => (
              <div key={i} style={{ border: "1px solid var(--bg-border)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="שם תצוגה (סוג חדר)" style={{ ...input, flex: 1 }} />
                  <input value={f.key} onChange={(e) => setField(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} placeholder="key" style={{ ...input, width: 130, fontFamily: "monospace", direction: "ltr", textAlign: "left" }} />
                  <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })} style={{ ...input, width: 130 }}>
                    {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={14} color="#EF4444" /></button>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> חובה
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!f.unique} onChange={(e) => setField(i, { unique: e.target.checked })} /> ייחודי
                  </label>
                  {f.type === "select" && (
                    <input value={(f.options ?? []).join(", ")} onChange={(e) => setField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="אפשרויות, מופרדות בפסיק" style={{ ...input, flex: 1, minWidth: 160 }} />
                  )}
                  {f.type === "reference" && (
                    <select value={f.refCollection ?? ""} onChange={(e) => setField(i, { refCollection: e.target.value })} style={{ ...input, flex: 1, minWidth: 160 }}>
                      <option value="">— טבלת יעד —</option>
                      {collections.filter((c) => c.name !== name).map((c) => <option key={c.id} value={c.name}>{c.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ color: "#DC2626", fontSize: 13 }}>{error}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} שמור טבלה</button>
        <button onClick={onCancel} style={ghostBtn}>ביטול</button>
      </div>
    </div>
  );
}

// ── Records table ─────────────────────────────────────────────────────────────
function RecordsView({ collection, onBack }: { collection: Collection; onBack: () => void }) {
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRec, setEditRec] = useState<Rec | "new" | null>(null);
  const [showAgg, setShowAgg] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`/api/data/collections/${collection.id}/records`)
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => setRecords(d.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [collection.id]);
  useEffect(() => { reload(); }, [reload]);

  async function importCsvFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch(`/api/data/collections/${collection.id}/csv`, {
        method: "POST", headers: { "Content-Type": "text/csv" }, body: text,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) alert(d.error ?? "ייבוא נכשל");
      else alert(`יובאו ${d.inserted} שורות${d.errors?.length ? `, ${d.errors.length} שגיאות` : ""}`);
      reload();
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
        <ArrowRight size={14} /> חזרה למאגרי מידע
      </button>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{collection.label} <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}>· {records.length} שורות</span></h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAgg((s) => !s)} style={{ ...ghostBtn, ...(showAgg ? { background: "var(--accent-light)", color: "var(--accent-dark)", border: "none" } : {}) }}><BarChart3 size={14} /> סיכום</button>
          <a href={`/api/data/collections/${collection.id}/csv`} style={{ ...ghostBtn, textDecoration: "none" }}><Download size={14} /> ייצוא CSV</a>
          <button onClick={() => fileRef.current?.click()} disabled={importing} style={ghostBtn}>{importing ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />} ייבוא</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsvFile(f); }} />
          <button onClick={() => setEditRec("new")} style={primaryBtn}><Plus size={15} /> שורה חדשה</button>
        </div>
      </div>

      {showAgg && <AggregatePanel collection={collection} />}

      <div style={{ ...card, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}><Loader2 className="animate-spin" size={20} /></div>
        ) : records.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>אין עדיין שורות בטבלה.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-base)", textAlign: "right" }}>
                  {collection.fields.map((f) => <th key={f.key} style={{ padding: "9px 12px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{f.label}</th>)}
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id} style={{ borderTop: "1px solid var(--bg-border)" }}>
                    {collection.fields.map((f) => <td key={f.key} style={{ padding: "9px 12px", color: "var(--text-primary)" }}>{renderCell(rec.data[f.key], f)}</td>)}
                    <td style={{ padding: "6px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => setEditRec(rec)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={13} color="var(--text-muted)" /></button>
                        <button onClick={async () => { if (confirm("למחוק שורה זו?")) { await fetch(`/api/data/records/${rec.id}`, { method: "DELETE" }); reload(); } }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={13} color="#EF4444" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editRec && (
        <RecordModal collection={collection} record={editRec === "new" ? null : editRec}
          onClose={() => setEditRec(null)} onSaved={() => { setEditRec(null); reload(); }} />
      )}
    </div>
  );
}

// ── Aggregation panel ─────────────────────────────────────────────────────────
function AggregatePanel({ collection }: { collection: Collection }) {
  const numericFields = collection.fields.filter((f) => f.type === "number");
  const groupableFields = collection.fields.filter((f) => ["text", "select", "boolean"].includes(f.type));
  const [metric, setMetric] = useState<"count" | "sum" | "avg" | "min" | "max">("count");
  const [field, setField] = useState<string>(numericFields[0]?.key ?? "");
  const [groupBy, setGroupBy] = useState<string>("");
  const [results, setResults] = useState<{ group: unknown; value: number; count: number }[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/data/collections/${collection.id}/aggregate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric, field: metric === "count" ? undefined : field, groupBy: groupBy || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      setResults(res.ok ? d.results ?? [] : []);
    } finally {
      setLoading(false);
    }
  }

  const groupLabel = groupableFields.find((f) => f.key === groupBy)?.label;

  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>פעולה</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} style={{ ...input, width: 140 }}>
            <option value="count">ספירה</option>
            <option value="sum">סכום</option>
            <option value="avg">ממוצע</option>
            <option value="min">מינימום</option>
            <option value="max">מקסימום</option>
          </select>
        </div>
        {metric !== "count" && (
          <div>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>שדה מספרי</label>
            <select value={field} onChange={(e) => setField(e.target.value)} style={{ ...input, width: 160 }}>
              {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>קיבוץ לפי</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ ...input, width: 160 }}>
            <option value="">— ללא —</option>
            {groupableFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <button onClick={run} disabled={loading || (metric !== "count" && !field)} style={primaryBtn}>
          {loading ? <Loader2 className="animate-spin" size={14} /> : <BarChart3 size={14} />} חשב
        </button>
      </div>
      {results && (
        <div style={{ marginTop: 14 }}>
          {results.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>אין תוצאות.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "right", color: "var(--text-muted)" }}>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>{groupBy ? groupLabel : "סך הכל"}</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>ערך</th>
                  {groupBy && <th style={{ padding: "6px 10px", fontWeight: 600 }}>שורות</th>}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--bg-border)" }}>
                    <td style={{ padding: "6px 10px", color: "var(--text-primary)" }}>{r.group == null ? "—" : String(r.group)}</td>
                    <td style={{ padding: "6px 10px", color: "var(--text-primary)", fontWeight: 600 }}>{Math.round(r.value * 100) / 100}</td>
                    {groupBy && <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{r.count}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function renderCell(value: unknown, field: FieldDef): string {
  if (value == null || value === "") return "—";
  if (field.type === "boolean") return value ? "כן" : "לא";
  if (field.type === "json") return JSON.stringify(value);
  if ((field.type === "date" || field.type === "datetime") && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("he-IL");
  }
  return String(value);
}

// ── Record add/edit modal ─────────────────────────────────────────────────────
function RecordModal({ collection, record, onClose, onSaved }: {
  collection: Collection; record: Rec | null; onClose: () => void; onSaved: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(record?.data ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = record
        ? await fetch(`/api/data/records/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) })
        : await fetch(`/api/data/collections/${collection.id}/records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "שמירה נכשלה"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 440, maxWidth: "92%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{record ? "עריכת שורה" : "שורה חדשה"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {collection.fields.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                {f.label}{f.required ? " *" : ""} <span style={{ fontSize: 10, opacity: 0.6 }}>({TYPE_LABEL[f.type]})</span>
              </label>
              <FieldInput field={f} value={data[f.key]} onChange={(v) => set(f.key, v)} />
            </div>
          ))}
          {collection.fields.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>לטבלה אין שדות — הוסף שדות במבנה הטבלה.</p>}
        </div>
        {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} שמור</button>
          <button onClick={onClose} style={ghostBtn}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-primary)", cursor: "pointer" }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {value ? "כן" : "לא"}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={input}>
        <option value="">— בחר —</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === "number") {
    return <input type="number" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} style={input} />;
  }
  if (field.type === "date") {
    return <input type="date" value={String(value ?? "").slice(0, 10)} onChange={(e) => onChange(e.target.value)} style={input} />;
  }
  if (field.type === "datetime") {
    return <input type="datetime-local" value={String(value ?? "").slice(0, 16)} onChange={(e) => onChange(e.target.value)} style={input} />;
  }
  if (field.type === "json") {
    return <textarea value={typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2)} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...input, resize: "none", fontFamily: "monospace", direction: "ltr", textAlign: "left" }} />;
  }
  return <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={input} />;
}
