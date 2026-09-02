"use client";

/**
 * Segments ([קטגוריה 5]) — saved audiences over the condition engine. Live /api/segments.
 */
import { useCallback, useEffect, useState } from "react";
import { Filter, Plus, AlertCircle, Loader2, RefreshCw, Users, Trash2, Pencil, Check, X } from "lucide-react";

interface Segment {
  id: string;
  name: string;
  type: string;
  estimatedSize: number;
  refreshedAt: string | null;
}

const FIELDS = [
  { key: "contact.status", label: "סטטוס לקוח", op: "eq", placeholder: "active / customer / blocked" },
  { key: "contact.marketingOptIn", label: "הסכמת שיווק", op: "eq", placeholder: "opted_in / opted_out" },
  { key: "contact.tags", label: "תגית", op: "contains", placeholder: "VIP" },
];

export default function SegmentsPage() {
  const [items, setItems] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [field, setField] = useState(FIELDS[0].key);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/segments", { cache: "no-store" });
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
    if (!name.trim() || !value.trim() || saving) return;
    setSaving(true);
    setError(null);
    const f = FIELDS.find((x) => x.key === field)!;
    try {
      const r = await fetch("/api/segments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definition: { op: "AND", rules: [{ field: f.key, operator: f.op, value }], groups: [] },
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setName(""); setValue("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function refresh(id: string) {
    setRefreshing(id);
    try {
      await fetch(`/api/segments/${id}/refresh`, { method: "POST" });
      await load();
    } finally {
      setRefreshing(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הסגמנט?")) return;
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    await load();
  }

  async function saveRename(id: string) {
    if (!editName.trim()) { setEditing(null); return; }
    await fetch(`/api/segments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditing(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>סגמנטים</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>קהלי יעד מבוססי תנאים — לקמפיינים ולניתוב</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>סגמנט חדש</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הסגמנט (למשל: לקוחות VIP)"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <select value={field} onChange={(e) => setField(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={FIELDS.find((f) => f.key === field)?.placeholder}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <button onClick={add} disabled={saving || !name.trim() || !value.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            צור סגמנט
          </button>
        </div>

        <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Filter size={28} className="mb-2 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין סגמנטים עדיין — צור את הראשון</p>
            </div>
          ) : (
            items.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Filter size={15} style={{ color: "var(--accent)" }} />
                  {editing === s.id ? (
                    <input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(s.id); if (e.key === "Escape") setEditing(null); }}
                      className="text-sm px-2 py-0.5 rounded outline-none"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--accent)", color: "var(--text-primary)" }} />
                  ) : (
                    <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}>{s.type}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Users size={13} /> {s.estimatedSize}
                  </span>
                  {editing === s.id ? (
                    <>
                      <button onClick={() => saveRename(s.id)} title="שמור" style={{ color: "#16A34A" }}><Check size={15} /></button>
                      <button onClick={() => setEditing(null)} title="ביטול" style={{ color: "var(--text-muted)" }}><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => refresh(s.id)} title="רענון" style={{ color: "var(--accent-dark)" }}>
                        <RefreshCw size={14} className={refreshing === s.id ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => { setEditing(s.id); setEditName(s.name); }} title="שינוי שם" style={{ color: "var(--text-muted)" }}><Pencil size={14} /></button>
                      <button onClick={() => remove(s.id)} title="מחק" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
